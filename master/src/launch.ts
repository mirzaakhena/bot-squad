import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { NAME_RULE } from "./register.ts";
import { redact } from "./log.ts";

/**
 * Menyalakan satu bot sebagai sesi Claude Code di tmux, dengan cara yang
 * terbukti di spike 261112184701/261112184702 (lihat CLAUDE.md, "Menyalakan
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

/** Perintah claude di dalam sesi tmux. */
export function claudeArgv(pluginDir: string): string[] {
  return [
    "claude",
    "--setting-sources",
    "project,local",
    "--settings",
    '{"skipDangerousModePermissionPrompt":true}',
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
};

export type LaunchDeps = {
  dataDir: string;
  ownerId: number;
  pluginDir: string;
  /** Lokasi ~/.claude.json (untuk trust folder). */
  claudeJson: string;
  tmux: Tmux;
  isAlive: (pid: number) => boolean;
  /** Memasang paket plugin; melempar error kalau gagal. */
  installPlugin: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs?: number;
  pollMs?: number;
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
    };

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

function readPid(file: string): number | null {
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

  let busy: string | null;
  try {
    busy = await runningReason(name, deps);
  } catch (err) {
    return fail(`tmux tidak bisa diperiksa (${short(err)})`);
  }
  if (busy) return { kind: "already-running", reason: busy };

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

  try {
    await deps.installPlugin();
  } catch (err) {
    return fail(`paket plugin gagal dipasang (${short(err)})`);
  }

  // bot.pid lama sudah dipastikan mati; dihapus supaya tanda siap hanya
  // datang dari server plugin sesi ini.
  rmSync(pidFile, { force: true });
  try {
    await deps.tmux.newSession({
      name,
      cwd: workspace,
      env: { TELEGRAM_STATE_DIR: state },
      argv: claudeArgv(deps.pluginDir),
    });
  } catch (err) {
    // tmux menolak nama sesi yang sudah dipakai: sesi lain menang balapan.
    if (await deps.tmux.hasSession(name).catch(() => false)) {
      return { kind: "already-running", reason: `sesi tmux '${name}' sudah hidup` };
    }
    return fail(`sesi tmux gagal dibuat (${short(err)})`);
  }

  // Dialog development channel dijawab sekali. Dialog lain tidak dijawab:
  // pilihan default-nya "No, exit", jadi lebih aman dinyatakan gagal.
  const deadline = deps.now() + timeoutMs;
  let answered = false;
  let last: string | null = null;
  while (deps.now() < deadline) {
    await deps.sleep(pollMs);
    const pane = await deps.tmux.capture(name);
    if (pane === null) {
      return fail("sesi berhenti saat start", false, last !== null ? screenSnippet(last) : undefined);
    }
    last = pane;
    const pid = readPid(pidFile);
    const state = classifyScreen(pane, pid !== null && deps.isAlive(pid));
    if (state === "dev-prompt") {
      if (!answered) {
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

async function exec(argv: string[], opts: { stdout?: "pipe" | "inherit" } = {}) {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: opts.stdout ?? "pipe", stderr: "pipe" });
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
    if (o.now() >= deadline) throw new Error(`kunci install plugin tidak lepas: ${lock}`);
    await o.sleep(100);
  }
  try {
    if (o.install) await o.install();
    else {
      const r = await exec(["bun", "install", "--cwd", o.pluginDir, "--no-summary"]);
      if (r.code !== 0) throw new Error(`bun install keluar dengan kode ${r.code}`);
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Folder plugin di repo ini. */
export const PLUGIN_DIR = resolve(import.meta.dir, "..", "..", "plugin");

/** Dependensi asli untuk menyalakan bot di mesin ini. */
export function realLaunchDeps(dataDir: string, ownerId: number): LaunchDeps {
  const sleep = (ms: number) => Bun.sleep(ms);
  const now = () => Date.now();
  return {
    dataDir,
    ownerId,
    pluginDir: PLUGIN_DIR,
    claudeJson: join(process.env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json"),
    tmux: realTmux,
    isAlive,
    installPlugin: () => installPluginLocked({ dataDir, pluginDir: PLUGIN_DIR, isAlive, sleep, now }),
    sleep,
    now,
  };
}
