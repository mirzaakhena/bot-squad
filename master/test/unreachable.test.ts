import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER } from "./updates.ts";

/**
 * Tiket 261112235501: proses master-bot sungguhan harus berhenti dalam 5 detik
 * setelah SIGINT/SIGTERM walau Telegram tidak terjangkau, baik sejak menyala
 * maupun setelah polling berjalan, dan kunci master.pid dilepas. Semua di
 * folder sementara baru; Telegram tiruan atau port lokal yang tidak menjawab;
 * token palsu; HTTPS_PROXY mati supaya bug yang lolos ke api.telegram.org
 * gagal lokal.
 */

const MASTER = "123456789:AAFakeMasterTokenForUnreachableTests_ab";
const SECRET = MASTER.split(":")[1]!;
const MAIN = join(import.meta.dir, "..", "src", "main.ts");

let home: string;
let cleanup: Array<() => void> = [];

function symlinks(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out.push(p);
    else if (st.isDirectory()) out.push(...symlinks(p));
  }
  return out;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsq-unreach-"));
  mkdirSync(join(home, "master"));
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
});

afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  rmSync(home, { recursive: true, force: true });
});

const lockPath = () => join(home, "master", "master.pid");

function spawnMain(apiRoot: string) {
  expect(symlinks(home)).toEqual([]);
  const proc = Bun.spawn([process.execPath, MAIN], {
    env: {
      PATH: "/usr/bin:/bin",
      HOME: home,
      BOT_SQUAD_HOME: home,
      MASTER_BOT_API_ROOT: apiRoot,
      HTTPS_PROXY: "http://127.0.0.1:9",
      HTTP_PROXY: "http://127.0.0.1:9",
      NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  cleanup.push(() => {
    if (proc.exitCode === null) proc.kill(9);
  });
  let out = "";
  const dec = new TextDecoder();
  const reading = Promise.all(
    [proc.stdout, proc.stderr].map(async (s) => {
      for await (const chunk of s as ReadableStream<Uint8Array>) out += dec.decode(chunk);
    }),
  );
  const until = async (cond: () => boolean, what: string, ms = 10_000) => {
    for (const end = Date.now() + ms; !cond(); await Bun.sleep(25)) {
      if (Date.now() > end) throw new Error(`tidak terjadi: ${what}\n${out}`);
    }
  };
  return {
    proc,
    until,
    out: () => out,
    async stop(sig: "SIGINT" | "SIGTERM") {
      const t0 = Date.now();
      proc.kill(sig);
      const code = await Promise.race([proc.exited, Bun.sleep(8_000).then(() => "masih hidup" as const)]);
      const ms = Date.now() - t0;
      if (code === "masih hidup") proc.kill(9);
      await proc.exited;
      await reading;
      return { code, ms, out };
    },
  };
}

/** Port lokal yang menolak koneksi: didengar lalu ditutup. */
function closedPort(): number {
  const l = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = l.port;
  l.stop(true);
  return port;
}

/** Port lokal yang menerima koneksi tetapi tidak pernah menjawab. */
function silentPort() {
  const accepted = { count: 0 };
  const l = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open() {
        accepted.count++;
      },
      data() {},
    },
  });
  cleanup.push(() => l.stop(true));
  return { port: l.port, accepted };
}

function expectCleanExit(r: { code: number | string; ms: number; out: string }) {
  expect(r.code).toBe(0);
  expect(r.ms).toBeLessThan(5_000);
  expect(existsSync(lockPath())).toBe(false);
  expect(r.out).not.toContain(SECRET);
  expect(r.out).not.toContain("error tak terduga");
}

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

describe("Telegram tidak terjangkau sejak master-bot menyala", () => {
  for (const sig of SIGNALS) {
    test(`${sig}: koneksi ditolak -> keluar < 5 detik, pesan belum terjangkau, kunci dilepas`, async () => {
      const m = spawnMain(`http://127.0.0.1:${closedPort()}`);
      await m.until(() => existsSync(lockPath()), "kunci master.pid diambil");
      await Bun.sleep(2_000); // bot.init sedang mencoba ulang
      const r = await m.stop(sig);
      expectCleanExit(r);
      expect(r.out).toContain("dihentikan sebelum Telegram terjangkau (tahap: getMe)");
      expect(r.out).toContain("Kegagalan terakhir: Network request for 'getMe' failed!");
      expect(r.out).not.toContain("berjalan sebagai");
    }, 20_000);

    test(`${sig}: koneksi diterima tetapi tidak dijawab -> keluar < 5 detik, kunci dilepas`, async () => {
      const silent = silentPort();
      const m = spawnMain(`http://127.0.0.1:${silent.port}`);
      await m.until(() => silent.accepted.count > 0, "koneksi getMe");
      await Bun.sleep(1_500); // getMe menggantung
      const r = await m.stop(sig);
      expectCleanExit(r);
      expect(r.out).toContain("dihentikan sebelum Telegram terjangkau (tahap: getMe)");
      expect(r.out).toMatch(/Panggilan getMe belum dijawab Telegram setelah \d+ detik/);
    }, 20_000);
  }

  test("SIGTERM saat menu perintah menggantung -> keluar < 5 detik, tahap menu", async () => {
    const tg = startFakeTelegram(MASTER, { setMyCommands: () => new Promise(() => {}) });
    cleanup.push(() => tg.stop());
    const m = spawnMain(tg.apiRoot);
    await m.until(() => tg.calls.some((c) => c.method === "setMyCommands"), "menu perintah");
    await Bun.sleep(500);
    const r = await m.stop("SIGTERM");
    expectCleanExit(r);
    expect(r.out).toContain("dihentikan sebelum Telegram terjangkau (tahap: menu perintah)");
    expect(r.out).toMatch(/Panggilan setMyCommands belum dijawab/);
    // Langkah menu sisanya tidak dicoba lagi setelah berhenti diminta.
    expect(tg.calls.filter((c) => c.method === "setMyCommands")).toHaveLength(1);
    expect(tg.calls.some((c) => c.method === "getUpdates")).toBe(false);
  }, 20_000);
});

describe("Telegram putus setelah polling berjalan", () => {
  for (const sig of SIGNALS) {
    test(`${sig}: semua panggilan menggantung -> keluar < 5 detik, getUpdates terakhir tidak menahan`, async () => {
      let broken = false;
      const hang = () => new Promise<never>(() => {});
      const tg = startFakeTelegram(MASTER, {
        getUpdates: (_p, next) => (broken ? hang() : next()),
        deleteWebhook: (_p, next) => (broken ? hang() : next()),
      });
      cleanup.push(() => tg.stop());
      const m = spawnMain(tg.apiRoot);
      await m.until(() => m.out().includes("berjalan sebagai"), "polling berjalan");
      broken = true;
      const before = tg.calls.filter((c) => c.method === "getUpdates").length;
      await m.until(() => tg.calls.filter((c) => c.method === "getUpdates").length > before, "getUpdates menggantung");
      await Bun.sleep(500);
      const r = await m.stop(sig);
      expectCleanExit(r);
      expect(r.out).toContain("master-bot: berhenti");
      expect(r.out).not.toContain("dihentikan sebelum Telegram terjangkau");
      // getUpdates konfirmasi dari bot.stop() memang dikirim, lalu diputus.
      expect(tg.calls.some((c) => c.method === "getUpdates" && c.params.limit === 1)).toBe(true);
    }, 20_000);

    test(`${sig}: server Telegram hilang (koneksi ditolak) -> keluar < 5 detik`, async () => {
      const tg = startFakeTelegram(MASTER);
      const m = spawnMain(tg.apiRoot);
      await m.until(() => m.out().includes("berjalan sebagai"), "polling berjalan");
      tg.stop();
      await Bun.sleep(1_000); // grammY sedang menunggu 3 detik sebelum mencoba lagi
      const r = await m.stop(sig);
      expectCleanExit(r);
      expect(r.out).toContain("master-bot: berhenti");
    }, 20_000);
  }
});
