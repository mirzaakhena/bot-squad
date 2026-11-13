import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { botPaths } from "../src/launch.ts";
import { isClean, stopBot, type StopDeps } from "../src/stop.ts";
import type { ProcInfo } from "../src/strays.ts";

/**
 * stopBot dengan tmux, daftar proses, sinyal, dan jam tiruan. Tidak ada
 * proses sungguhan yang dikirimi sinyal di sini.
 */

const PLUGIN = "/repo/bot-squad/plugin";
const WA_ROOT = "/Users/x/.claude/plugins/claude-whatsapp-channel/whatsapp";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-stop-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

type Proc = ProcInfo & {
  /** Keluar sendiri setelah sesinya mati, sesudah sekian ms. null = tidak pernah. */
  exitAfterSessionMs: number | null;
  ignoresTerm?: boolean;
  /** SIGKILL pun tidak mempan (proses macet di kernel). */
  unkillable?: boolean;
};

function world(opts: { sessions?: string[]; killSessionFails?: boolean } = {}) {
  let now = 0;
  const sessions = new Set(opts.sessions ?? []);
  const procs = new Map<number, Proc>();
  const alive = new Set<number>();
  const signals: Array<[number, string]> = [];
  const killedSessions: string[] = [];
  const sessionDiedAt = new Map<string, number>();
  const tick = () => {
    for (const p of procs.values()) {
      const sess = p.env?.SESSION;
      if (sess === undefined || p.exitAfterSessionMs === null || !alive.has(p.pid)) continue;
      const died = sessionDiedAt.get(sess);
      if (died !== undefined && now >= died + p.exitAfterSessionMs) alive.delete(p.pid);
    }
  };
  const deps = (name: string): StopDeps => ({
    dataDir: home,
    pluginDir: PLUGIN,
    tmux: {
      async hasSession(n) {
        return sessions.has(n);
      },
      async killSession(n) {
        killedSessions.push(n);
        if (opts.killSessionFails) throw new Error("tmux menolak");
        sessions.delete(n);
        sessionDiedAt.set(n, now);
      },
    },
    isAlive: (pid) => alive.has(pid),
    list: () => {
      tick();
      return [...procs.values()].filter((p) => alive.has(p.pid)).map(({ pid, args, env }) => ({ pid, args, env }));
    },
    kill: (pid, sig) => {
      if (!alive.has(pid)) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
      signals.push([pid, sig]);
      const p = procs.get(pid)!;
      if (sig === "SIGTERM" && !p.ignoresTerm && !p.unkillable) alive.delete(pid);
      if (sig === "SIGKILL" && !p.unkillable) alive.delete(pid);
    },
    sleep: async (ms) => {
      now += ms;
      // Pengaman: loop tunggu yang tak berhenti harus gagal, bukan hang.
      if (now > 600_000) throw new Error("sleep tiruan melewati batas: loop tunggu tidak berhenti");
      tick();
    },
    now: () => now,
    selfPid: 99_999,
  });
  const stateOf = (name: string) => botPaths(home, name).state;
  const addServer = (pid: number, name: string, o: Partial<Proc> = {}) => {
    procs.set(pid, {
      pid,
      args: "bun server.ts",
      env: { TELEGRAM_STATE_DIR: stateOf(name), CLAUDE_PLUGIN_ROOT: PLUGIN, SESSION: name },
      exitAfterSessionMs: 2_000,
      ...o,
    });
    alive.add(pid);
  };
  const addProc = (p: Proc) => {
    procs.set(p.pid, p);
    alive.add(p.pid);
  };
  const writePid = (name: string, pid: number) => {
    const p = botPaths(home, name);
    mkdirSync(p.state, { recursive: true });
    writeFileSync(p.pidFile, String(pid));
  };
  return { deps, sessions, alive, signals, killedSessions, addServer, addProc, writePid, stateOf, now: () => now };
}

/** Proses lain yang tidak boleh pernah tersentuh /stop uji-01. */
function bystanders(w: ReturnType<typeof world>) {
  // Server plugin bot lain (folder plugin sama, folder state lain).
  w.addServer(200, "uji-02", { exitAfterSessionMs: null });
  // Plugin WhatsApp pemilik: baris perintah identik, CLAUDE_PLUGIN_ROOT lain.
  w.addProc({ pid: 300, args: "bun server.ts", env: { CLAUDE_PLUGIN_ROOT: WA_ROOT, TELEGRAM_STATE_DIR: w.stateOf("uji-01") }, exitAfterSessionMs: null });
  // Environment tak terbaca, tampak seperti server plugin uji-01.
  w.addProc({ pid: 400, args: "bun server.ts", env: null, exitAfterSessionMs: null });
  // Folder state yang hanya mirip (awalan sama).
  w.addProc({ pid: 500, args: "bun server.ts", env: { CLAUDE_PLUGIN_ROOT: PLUGIN, TELEGRAM_STATE_DIR: w.stateOf("uji-01") + "x" }, exitAfterSessionMs: null });
  // Proses lain dengan environment bot ini, tetapi bukan bun server.ts.
  w.addProc({ pid: 600, args: "node other.js", env: { CLAUDE_PLUGIN_ROOT: PLUGIN, TELEGRAM_STATE_DIR: w.stateOf("uji-01") }, exitAfterSessionMs: null });
  return [200, 300, 400, 500, 600];
}

function expectUntouched(w: ReturnType<typeof world>, pids: number[]) {
  for (const pid of pids) {
    expect(w.alive.has(pid)).toBe(true);
    expect(w.signals.filter(([p]) => p === pid)).toEqual([]);
  }
}

describe("stopBot", () => {
  test("bersih: sesi dimatikan, server plugin keluar sendiri, tanpa sinyal", async () => {
    const w = world({ sessions: ["uji-01", "uji-02"] });
    w.addServer(101, "uji-01");
    w.writePid("uji-01", 101);
    const others = bystanders(w);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r).toEqual({ wasRunning: true, killed: [], sessionLeft: false, pidsLeft: [] });
    expect(isClean(r)).toBe(true);
    expect(w.killedSessions).toEqual(["uji-01"]);
    expect(w.sessions.has("uji-02")).toBe(true);
    expect(w.signals).toEqual([]);
    expect(w.alive.has(101)).toBe(false);
    expectUntouched(w, others);
  });

  test("server tidak keluar dalam 10 detik: SIGTERM", async () => {
    const w = world({ sessions: ["uji-01"] });
    w.addServer(101, "uji-01", { exitAfterSessionMs: null });
    const others = bystanders(w);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r.killed).toEqual([{ pid: 101, signal: "SIGTERM" }]);
    expect(isClean(r)).toBe(true);
    expect(w.now()).toBeGreaterThanOrEqual(10_000);
    expect(w.signals).toEqual([[101, "SIGTERM"]]);
    expectUntouched(w, others);
  });

  test("server mengabaikan SIGTERM: SIGKILL", async () => {
    const w = world({ sessions: ["uji-01"] });
    w.addServer(101, "uji-01", { exitAfterSessionMs: null, ignoresTerm: true });
    const others = bystanders(w);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r.killed).toEqual([{ pid: 101, signal: "SIGKILL" }]);
    expect(isClean(r)).toBe(true);
    expect(w.signals).toEqual([
      [101, "SIGTERM"],
      [101, "SIGKILL"],
    ]);
    expectUntouched(w, others);
  });

  test("SIGKILL pun tidak mempan: pid dilaporkan tersisa", async () => {
    const w = world({ sessions: ["uji-01"] });
    w.addServer(101, "uji-01", { exitAfterSessionMs: null, unkillable: true });
    const others = bystanders(w);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r.pidsLeft).toEqual([101]);
    expect(isClean(r)).toBe(false);
    expectUntouched(w, others);
  });

  test("server yatim tanpa sesi (bot sudah tidak berjalan) tetap dibersihkan", async () => {
    const w = world();
    w.addServer(101, "uji-01", { exitAfterSessionMs: null });
    const others = bystanders(w);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r.wasRunning).toBe(true);
    expect(w.killedSessions).toEqual([]);
    expect(r.killed).toEqual([{ pid: 101, signal: "SIGTERM" }]);
    expectUntouched(w, others);
  });

  test("sesi tmux tidak mau mati: sessionLeft", async () => {
    const w = world({ sessions: ["uji-01"], killSessionFails: true });
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r.sessionLeft).toBe(true);
    expect(isClean(r)).toBe(false);
  });

  test("tidak berjalan: tidak ada yang dimatikan", async () => {
    const w = world({ sessions: ["uji-02"] });
    const others = bystanders(w);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r).toEqual({ wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [] });
    expect(w.killedSessions).toEqual([]);
    expect(w.now()).toBe(0);
    expectUntouched(w, others);
  });

  test("bot.pid menunjuk proses hidup yang tidak dikenali: dilaporkan, tidak dimatikan", async () => {
    const w = world();
    const others = bystanders(w);
    w.writePid("uji-01", 400);
    const r = await stopBot("uji-01", w.deps("uji-01"));
    expect(r.unrecognizedPid).toBe(400);
    expect(r.wasRunning).toBe(true);
    expectUntouched(w, others);
  });

  test("daftar proses tidak bisa dibaca: error, tidak melempar", async () => {
    const w = world({ sessions: ["uji-01"] });
    const d = w.deps("uji-01");
    const r = await stopBot("uji-01", { ...d, list: () => { throw new Error("ps keluar dengan kode 1"); } });
    expect(r.error).toContain("ps keluar");
    expect(isClean(r)).toBe(false);
  });

  test("nama tidak sah ditolak tanpa menyentuh tmux", async () => {
    const w = world({ sessions: ["uji-01"] });
    const r = await stopBot("../uji-01", w.deps("uji-01"));
    expect(r.error).toBe("nama bot tidak sesuai aturan");
    expect(w.killedSessions).toEqual([]);
  });
});
