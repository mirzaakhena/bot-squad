import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findStrayServers,
  isBunServerArgs,
  isStrayServer,
  killStrayServers,
  listServerProcesses,
  parseEnvNul,
  parseEnvTail,
  TERM_GRACE_MS,
  type ProcInfo,
} from "../src/strays.ts";

const PLUGIN = "/repo/bot-squad/plugin";
const STATE_01 = "/home/u/.bot-squad/bots/uji-01/state";
const STATE_02 = "/home/u/.bot-squad/bots/uji-02/state";
const WA_ROOT = "/home/u/claude-whatsapp-channel/whatsapp";
const T01 = { stateDir: STATE_01, pluginDir: PLUGIN };
const SELF = 99;

const ourServer = (pid: number, state: string, extra: Record<string, string> = {}): ProcInfo => ({
  pid,
  args: "/home/u/.bun/bin/bun server.ts",
  env: { TELEGRAM_STATE_DIR: state, CLAUDE_PLUGIN_ROOT: PLUGIN, PWD: PLUGIN, ...extra },
});

describe("isBunServerArgs", () => {
  test("bun server.ts (path bun absolut)", () => expect(isBunServerArgs("/home/u/.bun/bin/bun server.ts")).toBe(true));
  test("bun server.ts (bun dari PATH)", () => expect(isBunServerArgs("bun server.ts")).toBe(true));
  test("bun dengan path absolut ke server.ts", () => expect(isBunServerArgs("bun /repo/bot-squad/plugin/server.ts")).toBe(true));
  test("bun run start (pembungkus) bukan server", () =>
    expect(isBunServerArgs("bun run --cwd /repo/bot-squad/plugin --shell=bun --silent start")).toBe(false));
  test("node server.ts bukan bun", () => expect(isBunServerArgs("node server.ts")).toBe(false));
  test("program lain bernama mirip", () => expect(isBunServerArgs("/usr/bin/bunx server.ts")).toBe(false));
  test("bun tanpa server.ts", () => expect(isBunServerArgs("bun master/src/start-cli.ts uji-01")).toBe(false));
  test("server.ts.bak bukan server.ts", () => expect(isBunServerArgs("bun server.ts.bak")).toBe(false));
});

describe("isStrayServer per kasus", () => {
  test("server plugin repo ini dengan folder state bot itu: sisa", () =>
    expect(isStrayServer(ourServer(10, STATE_01), T01, SELF)).toBe(true));
  test("server plugin bot lain: bukan", () => expect(isStrayServer(ourServer(11, STATE_02), T01, SELF)).toBe(false));
  test("folder state yang hanya berawalan sama: bukan", () =>
    expect(isStrayServer(ourServer(12, `${STATE_01}-lama`), T01, SELF)).toBe(false));
  test("folder state dengan garis miring di akhir: bukan (harus sama persis)", () =>
    expect(isStrayServer(ourServer(13, `${STATE_01}/`), T01, SELF)).toBe(false));
  test("plugin WhatsApp (bun server.ts dari folder lain): bukan", () =>
    expect(
      isStrayServer(
        { pid: 14, args: "/home/u/.bun/bin/bun server.ts", env: { CLAUDE_PLUGIN_ROOT: WA_ROOT, PWD: WA_ROOT } },
        T01,
        SELF,
      ),
    ).toBe(false));
  test("plugin lain yang kebetulan memakai TELEGRAM_STATE_DIR yang sama: bukan", () =>
    expect(isStrayServer(ourServer(15, STATE_01, { CLAUDE_PLUGIN_ROOT: WA_ROOT }), T01, SELF)).toBe(false));
  test("environment tidak terbaca: tidak pernah dianggap sisa", () =>
    expect(isStrayServer({ pid: 16, args: "bun server.ts", env: null }, T01, SELF)).toBe(false));
  test("tanpa CLAUDE_PLUGIN_ROOT: bukan", () => {
    const p = ourServer(17, STATE_01);
    delete p.env!.CLAUDE_PLUGIN_ROOT;
    expect(isStrayServer(p, T01, SELF)).toBe(false);
  });
  test("tanpa TELEGRAM_STATE_DIR: bukan", () => {
    const p = ourServer(18, STATE_01);
    delete p.env!.TELEGRAM_STATE_DIR;
    expect(isStrayServer(p, T01, SELF)).toBe(false);
  });
  test("pembungkus bun run dengan env yang sama: bukan", () =>
    expect(isStrayServer({ ...ourServer(19, STATE_01), args: "bun run --cwd x --shell=bun --silent start" }, T01, SELF)).toBe(false));
  test("claude induknya dengan env yang sama: bukan", () =>
    expect(isStrayServer({ ...ourServer(20, STATE_01), args: "claude --plugin-dir /repo/bot-squad/plugin" }, T01, SELF)).toBe(false));
  test("proses ini sendiri: bukan", () => expect(isStrayServer(ourServer(SELF, STATE_01), T01, SELF)).toBe(false));
  test("pid 1: bukan", () => expect(isStrayServer(ourServer(1, STATE_01), T01, SELF)).toBe(false));
  test("CLAUDE_PLUGIN_ROOT berupa symlink ke folder plugin: sisa", () => {
    const dir = mkdtempSync(join(tmpdir(), "bot-squad-strays-"));
    try {
      const real = join(dir, "plugin");
      const link = join(dir, "link");
      require("node:fs").mkdirSync(real);
      require("node:fs").symlinkSync(real, link);
      expect(isStrayServer(ourServer(21, STATE_01, { CLAUDE_PLUGIN_ROOT: link }), { stateDir: STATE_01, pluginDir: real }, SELF)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findStrayServers pada daftar proses tiruan", () => {
  test("hanya server sisa bot itu yang terpilih", () => {
    const procs: ProcInfo[] = [
      ourServer(101, STATE_01),
      ourServer(102, STATE_02),
      { pid: 103, args: "/home/u/.bun/bin/bun server.ts", env: { CLAUDE_PLUGIN_ROOT: WA_ROOT, PWD: WA_ROOT } },
      { pid: 104, args: "/home/u/.bun/bin/bun server.ts", env: null },
      ourServer(105, STATE_01),
      ourServer(SELF, STATE_01),
    ];
    expect(findStrayServers(procs, T01, SELF)).toEqual([101, 105]);
  });
});

describe("parseEnvTail (ps -E)", () => {
  test("pasangan biasa", () =>
    expect(parseEnvTail(" A=1 TELEGRAM_STATE_DIR=/x/state B=")).toEqual({ A: "1", TELEGRAM_STATE_DIR: "/x/state", B: "" }));
  test("nilai berisi spasi disambung", () => expect(parseEnvTail(" P=/a b/c Q=2")).toEqual({ P: "/a b/c", Q: "2" }));
  test("nilai berisi =", () => expect(parseEnvTail(" S={\"a\":1}=x")).toEqual({ S: "{\"a\":1}=x" }));
});

describe("parseEnvNul (/proc/<pid>/environ)", () => {
  test("dipisah NUL, nilai boleh berisi spasi dan =", () =>
    expect(parseEnvNul("A=1\0TELEGRAM_STATE_DIR=/a b/state\0C=x=y\0")).toEqual({ A: "1", TELEGRAM_STATE_DIR: "/a b/state", C: "x=y" }));
});

describe("killStrayServers", () => {
  function world(procs: ProcInfo[], opts: { dieOnTerm?: number[] } = {}) {
    let live = [...procs];
    const sent: [number, string][] = [];
    const sleeps: number[] = [];
    return {
      sent,
      sleeps,
      deps: {
        list: () => live,
        kill: (pid: number, sig: "SIGTERM" | "SIGKILL") => {
          if (!live.some((p) => p.pid === pid)) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
          sent.push([pid, sig]);
          if (sig === "SIGKILL" || opts.dieOnTerm?.includes(pid)) live = live.filter((p) => p.pid !== pid);
        },
        sleep: async (ms: number) => {
          sleeps.push(ms);
        },
        selfPid: SELF,
      },
      replace: (pid: number, p: ProcInfo) => (live = live.map((q) => (q.pid === pid ? p : q))),
    };
  }

  test("tidak ada sisa: tidak mengirim sinyal dan tidak menunggu", async () => {
    const w = world([ourServer(102, STATE_02)]);
    expect(await killStrayServers(T01, w.deps)).toEqual([]);
    expect(w.sent).toEqual([]);
    expect(w.sleeps).toEqual([]);
  });

  test("keluar setelah SIGTERM: tidak di-SIGKILL", async () => {
    const w = world([ourServer(101, STATE_01), ourServer(102, STATE_02)], { dieOnTerm: [101] });
    expect(await killStrayServers(T01, w.deps)).toEqual([{ pid: 101, signal: "SIGTERM" }]);
    expect(w.sent).toEqual([[101, "SIGTERM"]]);
    expect(w.sleeps).toEqual([TERM_GRACE_MS]);
    expect(TERM_GRACE_MS).toBe(2_000);
  });

  test("masih hidup setelah 2 detik: SIGKILL; bot lain dan WhatsApp tidak disentuh", async () => {
    const wa: ProcInfo = { pid: 103, args: "bun server.ts", env: { CLAUDE_PLUGIN_ROOT: WA_ROOT } };
    const w = world([ourServer(101, STATE_01), ourServer(102, STATE_02), wa, { pid: 104, args: "bun server.ts", env: null }]);
    expect(await killStrayServers(T01, w.deps)).toEqual([{ pid: 101, signal: "SIGKILL" }]);
    expect(w.sent).toEqual([
      [101, "SIGTERM"],
      [101, "SIGKILL"],
    ]);
    expect(w.deps.list().map((p) => p.pid)).toEqual([102, 103, 104]);
  });

  test("pid dipakai ulang proses lain selama jeda: tidak di-SIGKILL", async () => {
    const w = world([ourServer(101, STATE_01)]);
    const sleep = w.deps.sleep;
    w.deps.sleep = async (ms) => {
      await sleep(ms);
      w.replace(101, { pid: 101, args: "bun server.ts", env: { CLAUDE_PLUGIN_ROOT: WA_ROOT } });
    };
    expect(await killStrayServers(T01, w.deps)).toEqual([{ pid: 101, signal: "SIGTERM" }]);
    expect(w.sent).toEqual([[101, "SIGTERM"]]);
  });

  test("sudah hilang sebelum SIGTERM: tidak dicatat dan tidak menunggu", async () => {
    const w = world([ourServer(101, STATE_01)]);
    w.deps.kill = () => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    };
    expect(await killStrayServers(T01, w.deps)).toEqual([]);
    expect(w.sleeps).toEqual([]);
  });
});

describe("listServerProcesses di mesin ini", () => {
  test("menemukan server.ts tiruan milik tes ini lengkap dengan environment-nya", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bot-squad-strays-"));
    const script = join(dir, "server.ts");
    require("node:fs").writeFileSync(script, "await Bun.sleep(30_000);\n");
    const state = join(dir, "state with space");
    const child = Bun.spawn(["bun", script], {
      env: { ...process.env, TELEGRAM_STATE_DIR: state, CLAUDE_PLUGIN_ROOT: dir },
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      let found: ProcInfo | undefined;
      for (let i = 0; i < 50 && !found; i++) {
        await Bun.sleep(100);
        found = listServerProcesses().find((p) => p.pid === child.pid);
      }
      expect(found).toBeDefined();
      expect(found!.env?.TELEGRAM_STATE_DIR).toBe(state);
      expect(findStrayServers([found!], { stateDir: state, pluginDir: dir })).toEqual([child.pid]);
      expect(findStrayServers([found!], { stateDir: join(dir, "state"), pluginDir: dir })).toEqual([]);
    } finally {
      child.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("killStrayServers dengan proses sungguhan", () => {
  test("server sisa yang mengabaikan SIGTERM di-SIGKILL; server bot lain tetap hidup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bot-squad-strays-"));
    const script = join(dir, "server.ts");
    // Meniru server yatim yang macet: SIGTERM tidak membuatnya keluar.
    require("node:fs").writeFileSync(script, "process.on('SIGTERM', () => {});\nawait Bun.sleep(30_000);\n");
    const mine = join(dir, "bots", "uji-01", "state");
    const other = join(dir, "bots", "uji-02", "state");
    const spawn = (state: string) =>
      Bun.spawn(["bun", script], {
        env: { ...process.env, TELEGRAM_STATE_DIR: state, CLAUDE_PLUGIN_ROOT: dir },
        stdout: "ignore",
        stderr: "ignore",
      });
    const a = spawn(mine);
    const b = spawn(other);
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    try {
      for (let i = 0; i < 50; i++) {
        const pids = listServerProcesses().map((p) => p.pid);
        if (pids.includes(a.pid) && pids.includes(b.pid)) break;
        await Bun.sleep(100);
      }
      await Bun.sleep(300); // handler SIGTERM sudah terpasang
      const killed = await killStrayServers(
        { stateDir: mine, pluginDir: dir },
        { list: listServerProcesses, kill: (pid, sig) => process.kill(pid, sig), sleep: (ms) => Bun.sleep(ms) },
      );
      expect(killed).toEqual([{ pid: a.pid, signal: "SIGKILL" }]);
      await a.exited;
      expect(alive(b.pid)).toBe(true);
    } finally {
      a.kill("SIGKILL");
      b.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
