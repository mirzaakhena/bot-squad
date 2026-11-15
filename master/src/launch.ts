import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { NAME_RULE } from "./register.ts";
import { redact } from "./log.ts";
import { killStrayServers, listServerProcesses, type Killed } from "./strays.ts";
import { abortableSleep } from "./retry.ts";
import { prepareStatusline } from "./statusline.ts";

/**
 * Menyalakan satu bot sebagai sesi Claude Code di tmux, dengan cara yang
 * terbukti di spike 261112184701/261112184702 (lihat docs/menyalakan-bot.md, "Menyalakan
 * satu bot"). Dipakai master-bot dan scripts/start-bot.sh, jadi hanya ada
 * satu implementasi.
 */

/** Batas waktu sampai bot dinyatakan gagal (keputusan pemilik, Q2). */
export const READY_TIMEOUT_MS = 90_000;
export const POLL_MS = 1_000;
/** Batas waktu menunggu kunci install plugin. */
export const INSTALL_LOCK_TIMEOUT_MS = 120_000;
/** Potongan layar di pesan gagal (keputusan pemilik, Q3). */
export const SCREEN_LINES = 20;
export const SCREEN_MAX_CHARS = 3_000;

export const DEV_CHANNEL_PROMPT = "I am using this for local development";
export const UNEXPECTED_DIALOG = /Yes, I trust this folder|Yes, I accept|Enter to confirm/;
export const READY_MARK = "bypass permissions on";

/**
 * Perintah claude di dalam sesi tmux. `statusLine` (perintah bridge /context,
 * tiket 261112230304) hanya dipasang kalau pendahulunya sudah dipastikan.
 */
export function claudeArgv(pluginDir: string, statusLine: string | null = null): string[] {
  const settings: Record<string, unknown> = { skipDangerousModePermissionPrompt: true };
  if (statusLine !== null) settings.statusLine = { type: "command", command: statusLine };
  return [
    "claude",
    "--setting-sources",
    "project,local",
    "--settings",
    JSON.stringify(settings),
    "--dangerously-skip-permissions",
    "--plugin-dir",
    pluginDir,
    "--dangerously-load-development-channels",
    "plugin:bot-squad@inline",
  ];
}

export type NewSession = { name: string; cwd: string; env: Record<string, string>; argv: string[] };

/** Operasi tmux yang dipakai; diganti tiruan di tes. */
export type Tmux = {
  hasSession(name: string): Promise<boolean>;
  /** Melempar error kalau sesi gagal dibuat (misalnya nama sudah dipakai). */
  newSession(s: NewSession): Promise<void>;
  /** Isi layar sesi, atau null kalau sesi sudah tidak ada. */
  capture(name: string): Promise<string | null>;
  sendEnter(name: string): Promise<void>;
  /** Mematikan sesi; melempar error kalau tmux menolak (sesi yang sudah tidak ada bukan error). */
  killSession(name: string): Promise<void>;
};

export type LaunchDeps = {
  dataDir: string;
  ownerId: number;
  pluginDir: string;
  /** Lokasi ~/.claude.json (untuk trust folder). */
  claudeJson: string;
  /** Lokasi ~/.claude/settings.json; hanya dibaca, untuk statusline pendahulu. */
  userSettings: string;
  tmux: Tmux;
  isAlive: (pid: number) => boolean;
  /** Memasang paket plugin; melempar error kalau gagal atau dibatalkan lewat signal. */
  installPlugin: (signal?: AbortSignal) => Promise<void>;
  /**
   * Mematikan server plugin sisa yang memakai folder state ini (SIGTERM, 2
   * detik, SIGKILL) dan mengembalikan yang dimatikan. Hanya dipanggil setelah
   * cek start ganda lolos.
   */
  killStrays: (stateDir: string) => Promise<Killed[]>;
  /** Satu baris log (tanpa token); default tidak menulis apa-apa. */
  log?: (message: string) => void;
  /** Harus selesai lebih awal kalau signal dibatalkan. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  timeoutMs?: number;
  pollMs?: number;
  /**
   * Dibatalkan saat master-bot berhenti (tiket 261112223102). Penyalaan yang
   * belum siap dihentikan: sesi tmux-nya dimatikan dan hasilnya "failed"
   * dengan interrupted. Kalau bot ternyata sudah siap, hasilnya "active".
   */
  signal?: AbortSignal;
};

export type LaunchResult =
  | { kind: "active"; pid: number }
  | { kind: "already-running"; reason: string }
  | {
      kind: "failed";
      reason: string;
      /** Potongan layar terakhir (sudah diringkas dan disensor), kalau ada. */
      screen?: string;
      /** Sesi tmux masih ada, jadi pemilik bisa tmux attach. */
      sessionAlive: boolean;
      /** Penyalaan diputus karena master-bot berhenti. */
      interrupted?: true;
    };

export const INTERRUPTED_REASON = "penyalaan terputus karena master-bot berhenti";

export type ScreenState = "dev-prompt" | "unexpected-dialog" | "ready" | "waiting";

/** Membaca satu tangkapan layar. "ready" butuh tanda di layar dan server plugin yang hidup. */
export function classifyScreen(pane: string, pluginAlive: boolean): ScreenState {
  if (pane.includes(DEV_CHANNEL_PROMPT)) return "dev-prompt";
  if (UNEXPECTED_DIALOG.test(pane)) return "unexpected-dialog";
  if (pane.includes(READY_MARK) && pluginAlive) return "ready";
  return "waiting";
}

/** 20 baris terakhir yang tidak kosong, paling banyak ~3000 karakter, token disensor. */
export function screenSnippet(pane: string): string {
  const lines = pane
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
    .slice(-SCREEN_LINES);
  while (lines.length > 1 && lines.join("\n").length > SCREEN_MAX_CHARS) lines.shift();
  let out = lines.join("\n");
  if (out.length > SCREEN_MAX_CHARS) out = out.slice(-SCREEN_MAX_CHARS);
  return redact(out, []);
}

export function botPaths(dataDir: string, name: string) {
  const botsDir = join(dataDir, "bots");
  const state = join(botsDir, name, "state");
  return { botsDir, state, workspace: join(botsDir, name, "workspace"), pidFile: join(state, "bot.pid") };
}

export function readPid(file: string): number | null {
  try {
    const pid = parseInt(readFileSync(file, "utf8"), 10);
    return pid > 1 ? pid : null;
  } catch {
    return null;
  }
}

/** Alasan bot dianggap sudah berjalan (A1: sesi tmux atau proses bot.pid hidup), atau null. */
export async function runningReason(name: string, deps: Pick<LaunchDeps, "dataDir" | "tmux" | "isAlive">): Promise<string | null> {
  if (await deps.tmux.hasSession(name)) return `sesi tmux '${name}' sudah hidup`;
  const pid = readPid(botPaths(deps.dataDir, name).pidFile);
  if (pid !== null && deps.isAlive(pid)) return `server plugin untuk '${name}' masih hidup (pid ${pid})`;
  return null;
}

/** Menandai folder sebagai trusted di ~/.claude.json, kecuali folder itu atau induknya sudah trusted. */
export function ensureTrusted(claudeJson: string, dir: string): "already" | "written" {
  const cfg = existsSync(claudeJson) ? JSON.parse(readFileSync(claudeJson, "utf8")) : {};
  cfg.projects ??= {};
  for (let d = resolve(dir); ; d = dirname(d)) {
    if (cfg.projects[d]?.hasTrustDialogAccepted === true) return "already";
    if (d === dirname(d)) break;
  }
  const key = resolve(dir);
  cfg.projects[key] = { ...(cfg.projects[key] ?? {}), hasTrustDialogAccepted: true };
  const tmp = `${claudeJson}.bot-squad.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  renameSync(tmp, claudeJson);
  return "written";
}

/** Nama yang sedang dinyalakan di proses ini; menutup celah antara cek dan tmux new-session. */
const starting = new Set<string>();

/**
 * Menyalakan bot `name` dan menunggu sampai siap, gagal, atau batas waktu.
 * Tidak pernah melempar error: semua kegagalan menjadi LaunchResult.
 */
export async function launchBot(name: string, deps: LaunchDeps): Promise<LaunchResult> {
  if (!NAME_RULE.test(name)) {
    return { kind: "failed", reason: "nama bot tidak sesuai aturan", sessionAlive: false };
  }
  if (starting.has(name)) {
    return { kind: "already-running", reason: `'${name}' sedang dinyalakan` };
  }
  starting.add(name);
  try {
    return await launchUnguarded(name, deps);
  } finally {
    starting.delete(name);
  }
}

async function launchUnguarded(name: string, deps: LaunchDeps): Promise<LaunchResult> {
  const fail = (reason: string, sessionAlive = false, screen?: string): LaunchResult => ({
    kind: "failed",
    reason,
    sessionAlive,
    ...(screen !== undefined ? { screen } : {}),
  });
  const { botsDir, state, workspace, pidFile } = botPaths(deps.dataDir, name);
  const timeoutMs = deps.timeoutMs ?? READY_TIMEOUT_MS;
  const pollMs = deps.pollMs ?? POLL_MS;
  const signal = deps.signal;
  const aborted = () => signal?.aborted === true;
  let sessionCreated = false;
  /**
   * Master-bot berhenti di tengah penyalaan. Satu tangkapan terakhir: kalau
   * bot sudah siap, sesinya dibiarkan dan hasilnya active. Kalau belum, sesi
   * dimatikan supaya status failed sesuai kenyataan (keputusan pemilik, Q2).
   */
  const interrupted = async (): Promise<LaunchResult> => {
    let pane: string | null = null;
    if (sessionCreated) {
      pane = await deps.tmux.capture(name).catch(() => null);
      const pid = readPid(pidFile);
      if (pane !== null && classifyScreen(pane, pid !== null && deps.isAlive(pid)) === "ready") {
        return { kind: "active", pid: pid! };
      }
      try {
        await deps.tmux.killSession(name);
        deps.log?.(`sesi tmux '${name}' dimatikan karena penyalaannya terputus`);
      } catch (err) {
        deps.log?.(`sesi tmux '${name}' gagal dimatikan: ${short(err)}`);
      }
    }
    return {
      kind: "failed",
      reason: INTERRUPTED_REASON,
      sessionAlive: false,
      interrupted: true,
      ...(pane !== null ? { screen: screenSnippet(pane) } : {}),
    };
  };

  if (aborted()) return interrupted();
  let busy: string | null;
  try {
    busy = await runningReason(name, deps);
  } catch (err) {
    return fail(`tmux tidak bisa diperiksa (${short(err)})`);
  }
  if (busy) return { kind: "already-running", reason: busy };

  // Jaring pengaman (tiket 261112211001): server plugin sesi lama yang tidak
  // keluar sendiri. Gagal membersihkan tidak menggagalkan start.
  try {
    for (const k of await deps.killStrays(state)) {
      deps.log?.(`server plugin sisa '${name}' dimatikan: pid ${k.pid} (${k.signal})`);
    }
  } catch (err) {
    deps.log?.(`pembersihan server plugin sisa '${name}' gagal: ${short(err)}`);
  }

  const envFile = join(state, ".env");
  let envText = "";
  try {
    envText = readFileSync(envFile, "utf8");
  } catch {}
  if (!/^TELEGRAM_BOT_TOKEN=.+/m.test(envText)) return fail(`token tidak ada di ${envFile}`);

  try {
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    chmodSync(envFile, 0o600);
    const access = join(state, "access.json");
    if (!existsSync(access)) {
      writeFileSync(
        access,
        JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(deps.ownerId)], groups: {}, pending: {} }, null, 2) + "\n",
        { mode: 0o600 },
      );
    }
  } catch (err) {
    return fail(`folder bot tidak bisa disiapkan (${short(err)})`);
  }

  try {
    ensureTrusted(deps.claudeJson, botsDir);
  } catch (err) {
    return fail(`trust folder di ${deps.claudeJson} gagal ditulis (${short(err)})`);
  }

  if (aborted()) return interrupted();
  try {
    await deps.installPlugin(signal);
  } catch (err) {
    if (aborted()) return interrupted();
    return fail(`paket plugin gagal dipasang (${short(err)})`);
  }
  if (aborted()) return interrupted();

  // Statusline bridge untuk /context. Tidak pernah menggagalkan start.
  const statusline = prepareStatusline({
    workspace,
    stateDir: state,
    pluginDir: deps.pluginDir,
    userSettings: deps.userSettings,
    now: deps.now,
  });
  if (statusline.kind !== "installed") deps.log?.(`statusline '${name}' tidak dipasang: ${statusline.reason}`);

  // bot.pid lama sudah dipastikan mati; dihapus supaya tanda siap hanya
  // datang dari server plugin sesi ini.
  rmSync(pidFile, { force: true });
  try {
    await deps.tmux.newSession({
      name,
      cwd: workspace,
      env: { TELEGRAM_STATE_DIR: state },
      argv: claudeArgv(deps.pluginDir, statusline.kind === "installed" ? statusline.command : null),
    });
  } catch (err) {
    // tmux menolak nama sesi yang sudah dipakai: sesi lain menang balapan.
    if (await deps.tmux.hasSession(name).catch(() => false)) {
      return { kind: "already-running", reason: `sesi tmux '${name}' sudah hidup` };
    }
    return fail(`sesi tmux gagal dibuat (${short(err)})`);
  }
  sessionCreated = true;

  // Dialog development channel dijawab sekali. Dialog lain tidak dijawab:
  // pilihan default-nya "No, exit", jadi lebih aman dinyatakan gagal.
  const deadline = deps.now() + timeoutMs;
  let answered = false;
  let last: string | null = null;
  while (deps.now() < deadline) {
    if (aborted()) return interrupted();
    await deps.sleep(pollMs, signal);
    if (aborted()) return interrupted();
    const pane = await deps.tmux.capture(name);
    if (pane === null) {
      return fail("sesi berhenti saat start", false, last !== null ? screenSnippet(last) : undefined);
    }
    last = pane;
    const pid = readPid(pidFile);
    const state = classifyScreen(pane, pid !== null && deps.isAlive(pid));
    if (state === "dev-prompt") {
      if (!answered && !aborted()) {
        await deps.tmux.sendEnter(name);
        answered = true;
      }
      continue;
    }
    if (state === "unexpected-dialog") return fail("dialog tak terduga muncul di layar", true, screenSnippet(pane));
    if (state === "ready") return { kind: "active", pid: pid! };
  }
  const pane = (await deps.tmux.capture(name)) ?? last;
  const alive = await deps.tmux.hasSession(name).catch(() => false);
  return fail(
    `belum siap setelah ${Math.round(timeoutMs / 1000)} detik`,
    alive,
    pane !== null ? screenSnippet(pane) : undefined,
  );
}

function short(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redact(msg.split("\n")[0]!.slice(0, 200), []);
}

// ---------------------------------------------------------------------------
// Implementasi asli: tmux, bun install dengan kunci, jam.

async function exec(argv: string[], opts: { stdout?: "pipe" | "inherit"; signal?: AbortSignal } = {}) {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: opts.stdout ?? "pipe", stderr: "pipe" });
  const kill = () => proc.kill();
  if (opts.signal?.aborted) kill();
  opts.signal?.addEventListener("abort", kill, { once: true });
  proc.exited.finally(() => opts.signal?.removeEventListener("abort", kill));
  const [code, out, err] = await Promise.all([
    proc.exited,
    opts.stdout === "inherit" ? Promise.resolve("") : new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, out, err };
}

export const realTmux: Tmux = {
  async hasSession(name) {
    return (await exec(["tmux", "has-session", "-t", `=${name}`])).code === 0;
  },
  async newSession(s) {
    const env = Object.entries(s.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    const r = await exec(["tmux", "new-session", "-d", "-s", s.name, "-x", "200", "-y", "50", "-c", s.cwd, ...env, ...s.argv]);
    if (r.code !== 0) throw new Error(r.err.trim() || `tmux keluar dengan kode ${r.code}`);
  },
  async capture(name) {
    const r = await exec(["tmux", "capture-pane", "-p", "-t", `=${name}:`]);
    return r.code === 0 ? r.out : null;
  },
  async sendEnter(name) {
    await exec(["tmux", "send-keys", "-t", `=${name}:`, "Enter"]);
  },
  async killSession(name) {
    const r = await exec(["tmux", "kill-session", "-t", `=${name}`]);
    if (r.code !== 0 && (await realTmux.hasSession(name))) throw new Error(r.err.trim() || `tmux keluar dengan kode ${r.code}`);
  },
};

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export type InstallOptions = {
  dataDir: string;
  pluginDir: string;
  isAlive: (pid: number) => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Perintah install; default `bun install --cwd <pluginDir> --no-summary`. */
  install?: () => Promise<void>;
  lockTimeoutMs?: number;
  /** Menghentikan tunggu kunci dan bun install (master-bot berhenti). */
  signal?: AbortSignal;
};

/**
 * Memasang paket plugin satu per satu dengan kunci folder
 * <dataDir>/locks/plugin-install.lock (mkdir atomik). Kunci yang pemiliknya
 * sudah mati dianggap basi dan diambil alih.
 */
export async function installPluginLocked(o: InstallOptions): Promise<void> {
  const locks = join(o.dataDir, "locks");
  const lock = join(locks, "plugin-install.lock");
  mkdirSync(locks, { recursive: true, mode: 0o700 });
  const deadline = o.now() + (o.lockTimeoutMs ?? INSTALL_LOCK_TIMEOUT_MS);
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "pid"), String(process.pid));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const holder = readPid(join(lock, "pid"));
    if (holder !== null && !o.isAlive(holder)) {
      rmSync(lock, { recursive: true, force: true });
      continue;
    }
    if (o.signal?.aborted) throw new Error("install plugin dibatalkan: master-bot berhenti");
    if (o.now() >= deadline) throw new Error(`kunci install plugin tidak lepas: ${lock}`);
    await o.sleep(100);
  }
  try {
    if (o.install) await o.install();
    else {
      const r = await exec(["bun", "install", "--cwd", o.pluginDir, "--no-summary"], { signal: o.signal });
      if (o.signal?.aborted) throw new Error("install plugin dibatalkan: master-bot berhenti");
      if (r.code !== 0) throw new Error(`bun install keluar dengan kode ${r.code}`);
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Folder plugin di repo ini. */
export const PLUGIN_DIR = resolve(import.meta.dir, "..", "..", "plugin");

/** Dependensi asli untuk menyalakan bot di mesin ini. */
export function realLaunchDeps(
  dataDir: string,
  ownerId: number,
  log?: (message: string) => void,
  signal?: AbortSignal,
): LaunchDeps {
  const sleep = (ms: number, s?: AbortSignal) => abortableSleep(ms, s);
  const now = () => Date.now();
  return {
    dataDir,
    ownerId,
    pluginDir: PLUGIN_DIR,
    claudeJson: join(process.env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json"),
    userSettings: join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json"),
    tmux: realTmux,
    isAlive,
    installPlugin: (s) => installPluginLocked({ dataDir, pluginDir: PLUGIN_DIR, isAlive, sleep, now, signal: s }),
    killStrays: (stateDir) =>
      killStrayServers(
        { stateDir, pluginDir: PLUGIN_DIR },
        { list: listServerProcesses, kill: (pid, sig) => process.kill(pid, sig), sleep },
      ),
    ...(log ? { log } : {}),
    ...(signal ? { signal } : {}),
    sleep,
    now,
  };
}
