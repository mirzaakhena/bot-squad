import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireMasterLock, isMasterCommand, masterLockPath, psCommand } from "../src/lock.ts";
import { run } from "../src/main.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

const TOKEN = "555444333:AAALockTestFakeToken_NotReal_abcdefgh";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const MASTER_CMD = `bun ${MAIN}`;

let home: string;
const procs: Array<{ kill: (sig?: number | NodeJS.Signals) => void }> = [];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-lock-"));
  mkdirSync(join(home, "master"), { recursive: true });
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
});
afterEach(() => {
  for (const p of procs.splice(0)) {
    try {
      p.kill(9);
    } catch {}
  }
  rmSync(home, { recursive: true, force: true });
});

const lockFile = () => masterLockPath(home);
const lockPid = () => Number(readFileSync(lockFile(), "utf8").trim());
/** Tidak ada file sementara kunci yang tertinggal. */
const leftovers = () => readdirSync(join(home, "master")).filter((f) => f.startsWith("master.pid."));

describe("acquireMasterLock", () => {
  test("folder kosong: kunci dibuat berisi pid, dilepas saat release", () => {
    const r = acquireMasterLock(home, { pid: 4242 });
    expect(r.kind).toBe("acquired");
    expect(lockPid()).toBe(4242);
    expect(leftovers()).toEqual([]);
    if (r.kind === "acquired") r.release();
    expect(existsSync(lockFile())).toBe(false);
  });

  test("dipegang master-bot yang hidup: ditolak, kunci tidak diubah", () => {
    writeFileSync(lockFile(), "777\n");
    const r = acquireMasterLock(home, { pid: 4242, isAlive: (p) => p === 777, commandOf: () => MASTER_CMD });
    expect(r).toEqual({ kind: "held", path: lockFile(), pid: 777 });
    expect(lockPid()).toBe(777);
    expect(leftovers()).toEqual([]);
  });

  test("perintah proses tidak terbaca: dianggap masih dipegang", () => {
    writeFileSync(lockFile(), "777\n");
    const r = acquireMasterLock(home, { pid: 4242, isAlive: () => true, commandOf: () => null });
    expect(r.kind).toBe("held");
    expect(lockPid()).toBe(777);
  });

  const staleCases: Array<[string, string, (p: number) => boolean, (p: number) => string | null]> = [
    ["pid sudah mati", "777\n", () => false, () => MASTER_CMD],
    ["pid hidup tetapi bukan master-bot", "777\n", () => true, () => "/usr/bin/vim notes.txt"],
    ["pid hidup, perintah bun lain", "777\n", () => true, () => "bun test"],
    ["pid milik proses ini sendiri (dipakai ulang OS)", "4242\n", () => true, () => MASTER_CMD],
    ["isi bukan angka", "abc\n", () => true, () => MASTER_CMD],
    ["file kosong", "", () => true, () => MASTER_CMD],
  ];
  for (const [name, content, alive, cmd] of staleCases) {
    test(`kunci basi diambil alih: ${name}`, () => {
      writeFileSync(lockFile(), content);
      const r = acquireMasterLock(home, { pid: 4242, isAlive: alive, commandOf: cmd });
      expect(r.kind).toBe("acquired");
      expect(lockPid()).toBe(4242);
      expect(leftovers()).toEqual([]);
    });
  }

  test("kunci basi diganti proses lain di tengah pengambilalihan: kunci baru itu tidak dibuang", () => {
    writeFileSync(lockFile(), "777\n");
    const r = acquireMasterLock(home, {
      pid: 4242,
      isAlive: () => true,
      commandOf: (p) => {
        if (p === 888) return MASTER_CMD;
        // Proses 777 bukan master-bot; tepat saat itu master-bot 888 lebih
        // dulu mengambil alih kunci basinya.
        writeFileSync(lockFile(), "888\n");
        return "sleep 30";
      },
    });
    expect(r).toEqual({ kind: "held", path: lockFile(), pid: 888 });
    expect(lockPid()).toBe(888);
    expect(leftovers()).toEqual([]);
  });

  test("release tidak menghapus kunci milik proses lain", () => {
    const r = acquireMasterLock(home, { pid: 4242 });
    writeFileSync(lockFile(), "999\n");
    if (r.kind === "acquired") r.release();
    expect(lockPid()).toBe(999);
  });
});

describe("isMasterCommand", () => {
  const yes = [
    `bun ${MAIN}`,
    "bun /srv/bot-squad/master/src/main.ts",
    "bun master/src/main.ts",
    "bun src/main.ts",
    "/opt/bun/bin/bun ./src/main.ts",
  ];
  const no = ["bun test", "bun /srv/bot-squad/plugin/server.ts", "bun /x/other/src/main.tsx", "vim master/src/main.ts.bak", "bun /x/src/main.ts"];
  for (const c of yes) test(`master-bot: ${c}`, () => expect(isMasterCommand(c)).toBe(true));
  for (const c of no) test(`bukan master-bot: ${c}`, () => expect(isMasterCommand(c)).toBe(false));
});

test("psCommand membaca perintah proses yang hidup, null untuk pid mati", async () => {
  const p = Bun.spawn(["sleep", "30"]);
  procs.push(p);
  expect(psCommand(p.pid)).toContain("sleep 30");
  p.kill(9);
  await p.exited;
  expect(psCommand(p.pid)).toBeNull();
});

test("run(): kunci dipegang master-bot lain, berhenti tanpa memanggil Telegram", async () => {
  writeFileSync(lockFile(), "777\n");
  const tg = startFakeTelegram(TOKEN);
  const lines: string[] = [];
  try {
    const code = await run({
      env: { BOT_SQUAD_HOME: home },
      write: (l) => lines.push(l),
      client: { apiRoot: tg.apiRoot },
      lock: { isAlive: () => true, commandOf: () => MASTER_CMD },
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("master-bot sudah berjalan");
    expect(lines.join("\n")).not.toContain(TOKEN);
    expect(tg.calls).toEqual([]);
    expect(tg.stray.count).toBe(0);
    expect(lockPid()).toBe(777);
  } finally {
    tg.stop();
  }
});

test("run(): kunci dilepas setelah berhenti karena error Telegram", async () => {
  const tg = startFakeTelegram(TOKEN, { getMe: () => ({ status: 401, body: { ok: false, error_code: 401, description: "Unauthorized" } }) });
  try {
    expect(await run({ env: { BOT_SQUAD_HOME: home }, write: () => {}, client: { apiRoot: tg.apiRoot } })).toBe(1);
    expect(existsSync(lockFile())).toBe(false);
  } finally {
    tg.stop();
  }
});

// --- Dua proses main.ts sungguhan dengan Telegram tiruan ---

function spawnMain(apiRoot: string) {
  const proc = Bun.spawn(["bun", MAIN], {
    env: { PATH: process.env.PATH ?? "", HOME: home, BOT_SQUAD_HOME: home, MASTER_BOT_API_ROOT: apiRoot },
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push(proc);
  const output = (async () => (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()))();
  return { proc, output };
}

async function waitFor(cond: () => boolean, what: string) {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await Bun.sleep(10);
  }
  throw new Error(`tidak terjadi dalam 5 detik: ${what}`);
}

const polls = (tg: ReturnType<typeof startFakeTelegram>) => tg.calls.filter((c) => c.method === "getUpdates").length;

test("proses kedua ditolak tanpa menyentuh Telegram, proses pertama tetap melayani", async () => {
  const tg1 = startFakeTelegram(TOKEN);
  const tg2 = startFakeTelegram(TOKEN);
  try {
    const first = spawnMain(tg1.apiRoot);
    await waitFor(() => polls(tg1) > 0, "proses pertama polling");
    expect(lockPid()).toBe(first.proc.pid);

    const second = spawnMain(tg2.apiRoot);
    expect(await second.proc.exited).toBe(1);
    const out = await second.output;
    expect(out).toContain("master-bot sudah berjalan");
    expect(out).toContain(`pid ${first.proc.pid}`);
    expect(out).toContain(lockFile());
    expect(out).not.toContain(TOKEN);
    expect(tg2.calls).toEqual([]);
    expect(tg2.stray.count).toBe(0);
    expect(lockPid()).toBe(first.proc.pid);

    // Proses pertama masih hidup dan masih membalas pemilik.
    expect(first.proc.exitCode).toBeNull();
    const before = polls(tg1);
    tg1.push(ownerDm("/help"));
    await waitFor(() => tg1.calls.some((c) => c.method === "sendMessage"), "proses pertama membalas");
    await waitFor(() => polls(tg1) > before + 1, "proses pertama terus polling");
    expect(tg1.calls.filter((c) => c.method === "sendMessage").every((c) => c.params.chat_id === OWNER)).toBe(true);
    expect(tg1.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);

    // Berhenti normal: kunci dihapus.
    first.proc.kill("SIGTERM");
    expect(await first.proc.exited).toBe(0);
    expect(await first.output).not.toContain(TOKEN);
    expect(existsSync(lockFile())).toBe(false);
  } finally {
    tg1.stop();
    tg2.stop();
  }
}, 20000);

test("setelah master-bot mati mendadak, start berikutnya jalan tanpa langkah manual", async () => {
  const tg = startFakeTelegram(TOKEN);
  try {
    const crashed = spawnMain(tg.apiRoot);
    await waitFor(() => polls(tg) > 0, "proses pertama polling");
    crashed.proc.kill(9);
    await crashed.proc.exited;
    expect(lockPid()).toBe(crashed.proc.pid);

    const calls = tg.calls.length;
    const next = spawnMain(tg.apiRoot);
    await waitFor(() => tg.calls.slice(calls).some((c) => c.method === "getUpdates"), "proses baru polling");
    expect(next.proc.exitCode).toBeNull();
    expect(lockPid()).toBe(next.proc.pid);
    next.proc.kill("SIGTERM");
    expect(await next.proc.exited).toBe(0);
    expect(existsSync(lockFile())).toBe(false);
  } finally {
    tg.stop();
  }
}, 20000);

test("kunci berisi pid proses hidup yang bukan master-bot dianggap basi", async () => {
  const other = Bun.spawn(["sleep", "30"]);
  procs.push(other);
  writeFileSync(lockFile(), `${other.pid}\n`);
  const tg = startFakeTelegram(TOKEN);
  try {
    const m = spawnMain(tg.apiRoot);
    await waitFor(() => polls(tg) > 0, "master-bot polling");
    expect(lockPid()).toBe(m.proc.pid);
    expect(other.exitCode).toBeNull();
    m.proc.kill("SIGTERM");
    expect(await m.proc.exited).toBe(0);
  } finally {
    other.kill(9);
    tg.stop();
  }
}, 20000);
