import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  botPaths,
  classifyScreen,
  claudeArgv,
  ensureTrusted,
  installPluginLocked,
  launchBot,
  PLUGIN_DIR,
  realLaunchDeps,
  screenSnippet,
  type LaunchDeps,
  type NewSession,
  type Tmux,
} from "../src/launch.ts";

const FAKE_TOKEN = "5001:AAGoodFakeTokenForLaunchTests_aaaaaaaa";
const OWNER = 111222333;
const DEV = "WARNING: Loading development channels\n❯ 1. I am using this for local development\n  2. Exit";
const READY = "Claude Code v2.1.322\n\n> \n  ⏵⏵ bypass permissions on (shift+tab to cycle)";
const TRUST = "Quick safety check: Is this a project you created or one you trust?\n❯ 1. Yes, I trust this folder\n  2. No, exit";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-launch-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function makeBotDir(name: string, opts: { token?: boolean; access?: boolean } = {}) {
  const p = botPaths(home, name);
  mkdirSync(p.state, { recursive: true });
  mkdirSync(p.workspace, { recursive: true });
  if (opts.token !== false) writeFileSync(join(p.state, ".env"), `TELEGRAM_BOT_TOKEN=${FAKE_TOKEN}\n`, { mode: 0o644 });
  if (opts.access) writeFileSync(join(p.state, "access.json"), '{"dmPolicy":"allowlist","allowFrom":["42"]}');
  return p;
}

/**
 * tmux tiruan. `screens` dipanggil setiap capture dengan nomor tangkapan
 * (mulai 0) dan mengembalikan isi layar, atau null kalau sesi berhenti.
 * `onCapture` bisa meniru server plugin yang menulis bot.pid.
 */
function fakeTmux(screens: (i: number) => string | null, preexisting: string[] = []) {
  const sessions = new Set(preexisting);
  const created: NewSession[] = [];
  const enters: string[] = [];
  let captures = 0;
  const tmux: Tmux = {
    async hasSession(name) {
      return sessions.has(name);
    },
    async newSession(s) {
      if (sessions.has(s.name)) throw new Error(`duplicate session: ${s.name}`);
      sessions.add(s.name);
      created.push(s);
    },
    async capture(name) {
      if (!sessions.has(name)) return null;
      const out = screens(captures++);
      if (out === null) sessions.delete(name);
      return out;
    },
    async sendEnter(name) {
      enters.push(name);
    },
  };
  return { tmux, sessions, created, enters, captureCount: () => captures };
}

const ALIVE = 4242;
const DEAD = 4343;

function deps(
  tmux: Tmux,
  over: Partial<LaunchDeps> = {},
): LaunchDeps & { installs: number; clock: { t: number }; strayCalls: string[]; logs: string[] } {
  const clock = { t: 0 };
  const strayCalls: string[] = [];
  const logs: string[] = [];
  const d = {
    strayCalls,
    logs,
    killStrays: async (stateDir: string) => {
      strayCalls.push(stateDir);
      return [];
    },
    log: (m: string) => logs.push(m),
    dataDir: home,
    ownerId: OWNER,
    pluginDir: "/repo/plugin",
    claudeJson: join(home, "claude.json"),
    tmux,
    isAlive: (pid: number) => pid === ALIVE,
    installs: 0,
    installPlugin: async () => {
      d.installs++;
    },
    sleep: async (ms: number) => {
      clock.t += ms;
      // Pengaman: loop tunggu yang tidak berhenti di batas waktu jadi error, bukan hang.
      if (clock.t > 10 * 90_000) throw new Error("loop tunggu tidak berhenti di batas waktu");
    },
    now: () => clock.t,
    clock,
    ...over,
  };
  return d;
}

/** Menulis bot.pid seperti server plugin. */
const writePid = (name: string, pid: number) => writeFileSync(botPaths(home, name).pidFile, String(pid));

describe("classifyScreen per kasus", () => {
  test("dialog development channel", () => expect(classifyScreen(DEV, false)).toBe("dev-prompt"));
  test("dialog development channel menang atas tanda siap", () => expect(classifyScreen(`${DEV}\n${READY}`, true)).toBe("dev-prompt"));
  test("dialog trust: tak terduga", () => expect(classifyScreen(TRUST, true)).toBe("unexpected-dialog"));
  test("dialog bypass: tak terduga", () => expect(classifyScreen("❯ 2. Yes, I accept", true)).toBe("unexpected-dialog"));
  test("Enter to confirm: tak terduga", () => expect(classifyScreen("Enter to confirm · Esc to exit", true)).toBe("unexpected-dialog"));
  test("siap: tanda di layar dan plugin hidup", () => expect(classifyScreen(READY, true)).toBe("ready"));
  test("tanda di layar tetapi plugin belum hidup: menunggu", () => expect(classifyScreen(READY, false)).toBe("waiting"));
  test("layar kosong: menunggu", () => expect(classifyScreen("", true)).toBe("waiting"));
  test("peringatan plugin not installed bukan tanda gagal", () =>
    expect(classifyScreen(`plugin:bot-squad@inline · plugin not installed\n${READY}`, true)).toBe("ready"));
});

describe("screenSnippet", () => {
  test("20 baris terakhir yang tidak kosong", () => {
    const pane = Array.from({ length: 60 }, (_, i) => (i % 2 ? "" : `baris ${i}   `)).join("\n");
    const lines = screenSnippet(pane).split("\n");
    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe("baris 20");
    expect(lines[19]).toBe("baris 58");
  });
  test("paling banyak 3000 karakter, yang terakhir disimpan", () => {
    const pane = Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(400, "x")).join("\n");
    const out = screenSnippet(pane);
    expect(out.length).toBeLessThanOrEqual(3000);
    expect(out.endsWith(`19`.padEnd(400, "x"))).toBe(true);
  });
  test("satu baris yang sangat panjang dipotong", () => {
    expect(screenSnippet("y".repeat(5000)).length).toBe(3000);
  });
  test("token di layar disensor", () => {
    expect(screenSnippet(`TELEGRAM_BOT_TOKEN=123456789:AAH${"z".repeat(32)}`)).not.toContain("AAH");
  });
});

describe("launchBot: siap", () => {
  test("dialog dijawab sekali, lalu aktif; sesi di folder kerja dan state miliknya", async () => {
    makeBotDir("bot-01");
    writePid("bot-01", DEAD); // bot.pid basi dari sesi lama
    const f = fakeTmux((i) => {
      if (i < 3) return DEV;
      if (i === 4) writePid("bot-01", ALIVE);
      return READY;
    });
    const d = deps(f.tmux);
    const res = await launchBot("bot-01", d);
    expect(res).toEqual({ kind: "active", pid: ALIVE });
    expect(f.enters).toEqual(["bot-01"]);
    expect(f.created).toHaveLength(1);
    const s = f.created[0]!;
    expect(s.name).toBe("bot-01");
    expect(s.cwd).toBe(join(home, "bots", "bot-01", "workspace"));
    expect(s.env).toEqual({ TELEGRAM_STATE_DIR: join(home, "bots", "bot-01", "state") });
    expect(s.argv).toEqual(claudeArgv("/repo/plugin"));
    expect(s.argv).toContain("--dangerously-skip-permissions");
    expect(d.installs).toBe(1);
    // bot.pid basi tidak dianggap tanda siap: siap baru setelah plugin menulis pid baru.
    expect(f.captureCount()).toBe(5);
  });

  test("bot.pid basi yang pid-nya kemudian dipakai proses lain tidak dianggap siap", async () => {
    makeBotDir("bot-01");
    writePid("bot-01", ALIVE);
    let checks = 0;
    // Saat dicek di awal pid itu mati; setelahnya pid dipakai ulang proses lain.
    const isAlive = (pid: number) => pid === ALIVE && checks++ > 0;
    const f = fakeTmux((i) => {
      if (i === 3) writePid("bot-01", ALIVE);
      return READY;
    });
    const res = await launchBot("bot-01", deps(f.tmux, { isAlive }));
    expect(res.kind).toBe("active");
    expect(f.captureCount()).toBe(4);
  });

  test("siap baru setelah server plugin menulis bot.pid", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux((i) => {
      if (i === 2) writePid("bot-01", ALIVE);
      return READY;
    });
    const res = await launchBot("bot-01", deps(f.tmux));
    expect(res.kind).toBe("active");
    expect(f.captureCount()).toBe(3);
  });

  test("access.json ditulis berisi pemilik kalau belum ada; .env jadi 0600", async () => {
    const p = makeBotDir("bot-01");
    const f = fakeTmux(() => (writePid("bot-01", ALIVE), READY));
    await launchBot("bot-01", deps(f.tmux));
    const access = JSON.parse(readFileSync(join(p.state, "access.json"), "utf8"));
    expect(access).toEqual({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} });
    expect(statSync(join(p.state, ".env")).mode & 0o777).toBe(0o600);
  });

  test("access.json yang sudah ada tidak ditimpa", async () => {
    const p = makeBotDir("bot-01", { access: true });
    const f = fakeTmux(() => (writePid("bot-01", ALIVE), READY));
    await launchBot("bot-01", deps(f.tmux));
    expect(readFileSync(join(p.state, "access.json"), "utf8")).toBe('{"dmPolicy":"allowlist","allowFrom":["42"]}');
  });
});

describe("launchBot: sudah berjalan", () => {
  test("sesi tmux dengan nama itu sudah hidup", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => READY, ["bot-01"]);
    const d = deps(f.tmux);
    const res = await launchBot("bot-01", d);
    expect(res.kind).toBe("already-running");
    expect(f.created).toHaveLength(0);
    expect(d.installs).toBe(0);
  });

  test("server plugin di bot.pid masih hidup", async () => {
    makeBotDir("bot-01");
    writePid("bot-01", ALIVE);
    const f = fakeTmux(() => READY);
    const res = await launchBot("bot-01", deps(f.tmux));
    expect(res).toEqual({ kind: "already-running", reason: `server plugin untuk 'bot-01' masih hidup (pid ${ALIVE})` });
    expect(f.created).toHaveLength(0);
    // bot.pid milik server yang hidup tidak dihapus.
    expect(readFileSync(botPaths(home, "bot-01").pidFile, "utf8")).toBe(String(ALIVE));
  });

  test("bot.pid yang prosesnya sudah mati tidak menghalangi", async () => {
    makeBotDir("bot-01");
    writePid("bot-01", DEAD);
    const f = fakeTmux((i) => (i === 1 && writePid("bot-01", ALIVE), READY));
    expect((await launchBot("bot-01", deps(f.tmux))).kind).toBe("active");
  });

  test("dua penyalaan bersamaan: hanya satu sesi dibuat", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux((i) => (i === 3 && writePid("bot-01", ALIVE), READY));
    const d = deps(f.tmux);
    const [a, b] = await Promise.all([launchBot("bot-01", d), launchBot("bot-01", d)]);
    expect([a.kind, b.kind].sort()).toEqual(["active", "already-running"]);
    expect(f.created).toHaveLength(1);
  });

  test("penyalaan kedua saat yang pertama masih memasang plugin: ditolak tanpa install kedua", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => (writePid("bot-01", ALIVE), READY));
    let release!: () => void;
    let installs = 0;
    const d = deps(f.tmux, {
      installPlugin: () => {
        installs++;
        return new Promise<void>((r) => (release = r));
      },
    });
    const first = launchBot("bot-01", d);
    await Bun.sleep(5);
    const second = await launchBot("bot-01", d);
    expect(second).toEqual({ kind: "already-running", reason: "'bot-01' sedang dinyalakan" });
    expect(installs).toBe(1);
    release();
    expect((await first).kind).toBe("active");
  });

  test("setelah selesai, penyalaan berikutnya ditolak karena sesinya hidup", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => (writePid("bot-01", ALIVE), READY));
    const d = deps(f.tmux);
    expect((await launchBot("bot-01", d)).kind).toBe("active");
    expect((await launchBot("bot-01", d)).kind).toBe("already-running");
    expect(f.created).toHaveLength(1);
  });

  test("sesi muncul di antara cek dan new-session (proses lain): sudah berjalan", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => READY);
    const original = f.tmux.newSession;
    f.tmux.newSession = async (s) => {
      f.sessions.add(s.name); // proses lain menang
      return original(s);
    };
    const res = await launchBot("bot-01", deps(f.tmux));
    expect(res.kind).toBe("already-running");
  });
});

describe("launchBot: server plugin sisa", () => {
  test("dibersihkan untuk folder state bot itu sebelum sesi dibuat; satu baris log per pid", async () => {
    const p = makeBotDir("bot-01");
    const f = fakeTmux((i) => (i === 1 && writePid("bot-01", ALIVE), READY));
    let createdAtCleanup = -1;
    const d = deps(f.tmux, {
      killStrays: async (stateDir) => {
        d.strayCalls.push(stateDir);
        createdAtCleanup = f.created.length;
        return [
          { pid: 7001, signal: "SIGTERM" },
          { pid: 7002, signal: "SIGKILL" },
        ];
      },
    });
    const res = await launchBot("bot-01", d);
    expect(res).toEqual({ kind: "active", pid: ALIVE });
    expect(d.strayCalls).toEqual([p.state]);
    expect(createdAtCleanup).toBe(0);
    expect(d.logs).toEqual([
      "server plugin sisa 'bot-01' dimatikan: pid 7001 (SIGTERM)",
      "server plugin sisa 'bot-01' dimatikan: pid 7002 (SIGKILL)",
    ]);
  });

  test("tidak ada sisa: tidak ada log", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux((i) => (i === 1 && writePid("bot-01", ALIVE), READY));
    const d = deps(f.tmux);
    expect((await launchBot("bot-01", d)).kind).toBe("active");
    expect(d.strayCalls).toHaveLength(1);
    expect(d.logs).toEqual([]);
  });

  test("sesi tmux masih hidup: tidak membersihkan apa pun", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => READY, ["bot-01"]);
    const d = deps(f.tmux);
    expect((await launchBot("bot-01", d)).kind).toBe("already-running");
    expect(d.strayCalls).toEqual([]);
  });

  test("bot.pid masih hidup: tidak membersihkan apa pun", async () => {
    makeBotDir("bot-01");
    writePid("bot-01", ALIVE);
    const f = fakeTmux(() => READY);
    const d = deps(f.tmux);
    expect((await launchBot("bot-01", d)).kind).toBe("already-running");
    expect(d.strayCalls).toEqual([]);
  });

  test("sedang dinyalakan oleh panggilan lain: tidak membersihkan lagi", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => (writePid("bot-01", ALIVE), READY));
    let release!: () => void;
    const d = deps(f.tmux, { installPlugin: () => new Promise<void>((r) => (release = r)) });
    const first = launchBot("bot-01", d);
    await Bun.sleep(5);
    expect((await launchBot("bot-01", d)).kind).toBe("already-running");
    expect(d.strayCalls).toHaveLength(1);
    release();
    await first;
  });

  test("pembersihan gagal: start tetap jalan, kegagalan dicatat", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux((i) => (i === 1 && writePid("bot-01", ALIVE), READY));
    const d = deps(f.tmux, {
      killStrays: async () => {
        throw new Error("ps keluar dengan kode 1");
      },
    });
    expect((await launchBot("bot-01", d)).kind).toBe("active");
    expect(d.logs).toEqual(["pembersihan server plugin sisa 'bot-01' gagal: ps keluar dengan kode 1"]);
  });
});

describe("launchBot: gagal", () => {
  test("tidak siap dalam batas waktu: gagal dengan potongan layar, sesi dibiarkan", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => "Claude Code v2.1.322\nmemuat sesuatu...");
    const d = deps(f.tmux, { timeoutMs: 90_000, pollMs: 1_000 });
    const res = await launchBot("bot-01", d);
    expect(res).toEqual({
      kind: "failed",
      reason: "belum siap setelah 90 detik",
      sessionAlive: true,
      screen: "Claude Code v2.1.322\nmemuat sesuatu...",
    });
    expect(d.clock.t).toBe(90_000);
    expect(f.sessions.has("bot-01")).toBe(true);
  });

  test("tanda siap tanpa server plugin hidup sampai batas waktu: gagal", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => READY);
    const res = await launchBot("bot-01", deps(f.tmux, { timeoutMs: 5_000 }));
    expect(res.kind).toBe("failed");
    if (res.kind === "failed") expect(res.reason).toBe("belum siap setelah 5 detik");
  });

  test("dialog development channel yang tidak hilang: dijawab sekali, lalu gagal", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => DEV);
    const res = await launchBot("bot-01", deps(f.tmux, { timeoutMs: 10_000 }));
    expect(res.kind).toBe("failed");
    expect(f.enters).toEqual(["bot-01"]);
  });

  test("dialog tak terduga: gagal tanpa menekan apa pun", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => TRUST);
    const res = await launchBot("bot-01", deps(f.tmux));
    expect(res).toMatchObject({ kind: "failed", reason: "dialog tak terduga muncul di layar", sessionAlive: true });
    if (res.kind === "failed") expect(res.screen).toContain("Yes, I trust this folder");
    expect(f.enters).toEqual([]);
    expect(f.captureCount()).toBe(1);
  });

  test("sesi berhenti saat start: gagal dengan layar terakhir", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux((i) => (i === 0 ? "Error: sesuatu rusak" : null));
    const res = await launchBot("bot-01", deps(f.tmux));
    expect(res).toEqual({ kind: "failed", reason: "sesi berhenti saat start", sessionAlive: false, screen: "Error: sesuatu rusak" });
  });

  test("token tidak ada: gagal sebelum tmux dibuka", async () => {
    makeBotDir("bot-01", { token: false });
    const f = fakeTmux(() => READY);
    const res = await launchBot("bot-01", deps(f.tmux));
    expect(res.kind).toBe("failed");
    expect(f.created).toHaveLength(0);
  });

  test("install plugin gagal: gagal sebelum tmux dibuka", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => READY);
    const res = await launchBot("bot-01", deps(f.tmux, { installPlugin: async () => { throw new Error("EEXIST"); } }));
    expect(res).toMatchObject({ kind: "failed", reason: "paket plugin gagal dipasang (EEXIST)" });
    expect(f.created).toHaveLength(0);
  });

  test("tmux new-session gagal karena hal lain", async () => {
    makeBotDir("bot-01");
    const f = fakeTmux(() => READY);
    f.tmux.newSession = async () => {
      throw new Error("no server");
    };
    expect(await launchBot("bot-01", deps(f.tmux))).toMatchObject({ kind: "failed", reason: "sesi tmux gagal dibuat (no server)" });
  });

  test("nama tidak sah ditolak tanpa menyentuh tmux", async () => {
    const f = fakeTmux(() => READY);
    expect((await launchBot("../x", deps(f.tmux))).kind).toBe("failed");
    expect(f.created).toHaveLength(0);
  });
});

describe("ensureTrusted", () => {
  test("ditulis kalau belum trusted, pengaturan lain tetap", () => {
    const file = join(home, "claude.json");
    writeFileSync(file, JSON.stringify({ theme: "dark", projects: { "/lain": { x: 1 } } }));
    expect(ensureTrusted(file, join(home, "bots"))).toBe("written");
    const cfg = JSON.parse(readFileSync(file, "utf8"));
    expect(cfg.theme).toBe("dark");
    expect(cfg.projects["/lain"]).toEqual({ x: 1 });
    expect(cfg.projects[join(home, "bots")].hasTrustDialogAccepted).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  test("dilewati kalau induknya sudah trusted", () => {
    const file = join(home, "claude.json");
    const before = JSON.stringify({ projects: { [home]: { hasTrustDialogAccepted: true } } });
    writeFileSync(file, before);
    expect(ensureTrusted(file, join(home, "bots"))).toBe("already");
    expect(readFileSync(file, "utf8")).toBe(before);
  });
  test("file belum ada: dibuat", () => {
    const file = join(home, "claude.json");
    expect(ensureTrusted(file, join(home, "bots"))).toBe("written");
    expect(existsSync(file)).toBe(true);
  });
});

describe("installPluginLocked", () => {
  const opts = (over: object = {}) => ({
    dataDir: home,
    pluginDir: "/repo/plugin",
    isAlive: (pid: number) => pid === process.pid,
    sleep: (ms: number) => Bun.sleep(Math.min(ms, 5)),
    now: () => Date.now(),
    ...over,
  });
  const lock = () => join(home, "locks", "plugin-install.lock");

  test("install bergiliran, tidak pernah bersamaan; kunci dilepas", async () => {
    let running = 0;
    let maxRunning = 0;
    const install = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await Bun.sleep(20);
      running--;
    };
    await Promise.all([1, 2, 3].map(() => installPluginLocked(opts({ install }))));
    expect(maxRunning).toBe(1);
    expect(existsSync(lock())).toBe(false);
  });

  test("kunci basi (pemilik mati) diambil alih", async () => {
    mkdirSync(lock(), { recursive: true });
    writeFileSync(join(lock(), "pid"), "999999");
    let ran = false;
    await installPluginLocked(opts({ isAlive: () => false, install: async () => void (ran = true) }));
    expect(ran).toBe(true);
  });

  test("kunci yang dipegang proses hidup: gagal setelah batas waktu", async () => {
    mkdirSync(lock(), { recursive: true });
    writeFileSync(join(lock(), "pid"), String(process.pid));
    await expect(installPluginLocked(opts({ lockTimeoutMs: 30, install: async () => {} }))).rejects.toThrow("kunci install");
  });

  test("install gagal: kunci tetap dilepas", async () => {
    await expect(installPluginLocked(opts({ install: async () => { throw new Error("x"); } }))).rejects.toThrow("x");
    expect(existsSync(lock())).toBe(false);
  });
});

describe("realLaunchDeps: pembersihan server sisa terpasang", () => {
  test("mematikan bun server.ts milik plugin repo ini dengan folder state bot itu, dan meneruskan log", async () => {
    const p = makeBotDir("uji-01");
    const script = join(home, "server.ts");
    writeFileSync(script, "await Bun.sleep(30_000);\n");
    const child = Bun.spawn(["bun", script], {
      env: { ...process.env, TELEGRAM_STATE_DIR: p.state, CLAUDE_PLUGIN_ROOT: PLUGIN_DIR },
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      await Bun.sleep(300);
      const logs: string[] = [];
      const d = realLaunchDeps(home, OWNER, (m) => logs.push(m));
      d.log!("x");
      expect(logs).toEqual(["x"]);
      expect(await d.killStrays(p.state)).toEqual([{ pid: child.pid, signal: "SIGTERM" }]);
      expect(await child.exited).not.toBe(0);
    } finally {
      child.kill("SIGKILL");
    }
  }, 15_000);
});
