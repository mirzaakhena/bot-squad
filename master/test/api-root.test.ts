import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApiRoot } from "../src/api-root.ts";
import { masterLockPath } from "../src/lock.ts";
import { run } from "../src/main.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER } from "./updates.ts";

const TOKEN = "555444666:AAAApiRootTestFakeToken_NotReal_abcde";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");

describe("resolveApiRoot", () => {
  test("tidak di-set, kosong, atau hanya spasi: dianggap tidak dipakai", () => {
    for (const v of [undefined, "", "   ", "\t\n"]) {
      expect(resolveApiRoot({ MASTER_BOT_API_ROOT: v })).toEqual({ kind: "unset" });
    }
    expect(resolveApiRoot({})).toEqual({ kind: "unset" });
  });

  const local = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://[::1]:8081",
    "https://localhost",
    "http://LOCALHOST:1",
    "http://127.0.0.1",
    "  http://127.0.0.1:9  ",
  ];
  for (const v of local) {
    test(`alamat lokal diterima dengan peringatan: ${JSON.stringify(v)}`, () => {
      const r = resolveApiRoot({ MASTER_BOT_API_ROOT: v });
      expect(r.kind).toBe("local");
      if (r.kind !== "local") return;
      expect(r.apiRoot).toBe(v.trim());
      expect(r.warning).toContain("PERINGATAN");
      expect(r.warning).toContain("TIDAK terhubung ke Telegram sungguhan");
      expect(r.warning).toContain(v.trim());
    });
  }

  const rejected = [
    "https://api.telegram.org",
    "http://evil.example:8081",
    "http://localhost.evil.example",
    "http://127.0.0.1.evil.example",
    "http://localhost@evil.example",
    "http://127.0.0.1@evil.example:8081",
    "http://user:pass@localhost:8081",
    "http://:pass@localhost:8081",
    "http://0.0.0.0:8081",
    "http://127.0.0.2:8081",
    "http://[::ffff:127.0.0.1]:8081",
    "http://10.0.0.1",
    "ftp://127.0.0.1:8081",
    "file:///tmp/x",
    "localhost:8081",
    "127.0.0.1:8081",
    "bukan url",
  ];
  for (const v of rejected) {
    test(`ditolak: ${JSON.stringify(v)}`, () => {
      const r = resolveApiRoot({ MASTER_BOT_API_ROOT: v });
      expect(r.kind).toBe("rejected");
      if (r.kind !== "rejected") return;
      expect(r.message).toContain("MASTER_BOT_API_ROOT");
      expect(r.message).toContain("ditolak");
      expect(r.message).toContain(JSON.stringify(v));
    });
  }
});

// --- Proses main.ts sungguhan ---

let home: string;
const procs: Array<{ kill: (sig?: number | NodeJS.Signals) => void }> = [];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-apiroot-"));
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

function spawnMain(apiRoot: string | undefined) {
  // Proxy mati: kalau ada kode yang lolos ke Telegram sungguhan, permintaannya
  // gagal di mesin ini dan tidak pernah sampai ke api.telegram.org.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    BOT_SQUAD_HOME: home,
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
  };
  if (apiRoot !== undefined) env.MASTER_BOT_API_ROOT = apiRoot;
  const proc = Bun.spawn(["bun", MAIN], { env, stdout: "pipe", stderr: "pipe" });
  procs.push(proc);
  let text = "";
  const decoder = new TextDecoder();
  const collect = async (s: ReadableStream<Uint8Array>) => {
    for await (const chunk of s) text += decoder.decode(chunk, { stream: true });
  };
  const done = Promise.all([collect(proc.stdout), collect(proc.stderr)]);
  return { proc, out: () => text, done };
}

async function waitFor(cond: () => boolean, what: string) {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await Bun.sleep(10);
  }
  throw new Error(`tidak terjadi dalam 5 detik: ${what}`);
}

describe("main.ts dengan MASTER_BOT_API_ROOT bukan mesin lokal", () => {
  // Alamat yang sebenarnya sampai ke Telegram tiruan di mesin ini, sehingga
  // tes melihat langsung bahwa tidak ada satu pun permintaan yang terkirim.
  const reachable: Array<[string, (port: number) => string]> = [
    ["0.0.0.0", (p) => `http://0.0.0.0:${p}`],
    ["IPv4 dalam IPv6", (p) => `http://[::ffff:127.0.0.1]:${p}`],
    ["userinfo di depan host lokal", (p) => `http://localhost@127.0.0.1:${p}`],
    ["skema bukan http", (p) => `ftp://127.0.0.1:${p}`],
    ["tanpa skema", (p) => `127.0.0.1:${p}`],
  ];
  for (const [name, make] of reachable) {
    test(`ditolak sebelum memanggil Telegram: ${name}`, async () => {
      const tg = startFakeTelegram(TOKEN);
      try {
        const value = make(Number(new URL(tg.apiRoot).port));
        const m = spawnMain(value);
        expect(await m.proc.exited).toBe(1);
        await m.done;
        const out = m.out();
        expect(out).toBe(`master-bot: ${(resolveApiRoot({ MASTER_BOT_API_ROOT: value }) as { message: string }).message}\n`);
        expect(out).toStartWith(`master-bot: MASTER_BOT_API_ROOT=${JSON.stringify(value)} ditolak`);
        expect(out).toContain("ditolak");
        expect(out).not.toContain(TOKEN);
        expect(out).not.toContain(TOKEN.split(":")[1]!);
        expect(out).not.toContain("PERINGATAN");
        expect(tg.calls).toEqual([]);
        expect(tg.stray.count).toBe(0);
        expect(existsSync(masterLockPath(home))).toBe(false);
      } finally {
        tg.stop();
      }
    }, 20000);
  }

  test("ditolak: alamat luar", async () => {
    const m = spawnMain("https://api.telegram.org.evil.example");
    expect(await m.proc.exited).toBe(1);
    await m.done;
    expect(m.out()).toStartWith(`master-bot: MASTER_BOT_API_ROOT="https://api.telegram.org.evil.example" ditolak`);
    expect(m.out().trimEnd().split("\n")).toHaveLength(2);
    expect(m.out()).not.toContain(TOKEN.split(":")[1]!);
    expect(existsSync(masterLockPath(home))).toBe(false);
  }, 20000);
});

describe("main.ts dengan MASTER_BOT_API_ROOT lokal", () => {
  for (const host of ["127.0.0.1", "localhost"]) {
    test(`peringatan tampil dan Telegram tiruan dipakai: ${host}`, async () => {
      const tg = startFakeTelegram(TOKEN);
      try {
        const value = `http://${host}:${new URL(tg.apiRoot).port}`;
        const m = spawnMain(value);
        await waitFor(() => tg.calls.some((c) => c.method === "getUpdates"), "polling ke Telegram tiruan");
        await waitFor(() => m.out().includes("berjalan sebagai"), "log berjalan");
        m.proc.kill("SIGTERM");
        expect(await m.proc.exited).toBe(0);
        await m.done;
        const out = m.out();
        const lines = out.split("\n");
        expect(lines[0]).toBe(
          `master-bot: PERINGATAN: MASTER_BOT_API_ROOT=${value} aktif. master-bot TIDAK terhubung ke Telegram sungguhan; ` +
            `semua permintaan dikirim ke ${value}. Variabel ini hanya untuk tes.`,
        );
        expect(out).not.toContain(TOKEN.split(":")[1]!);
      } finally {
        tg.stop();
      }
    }, 20000);
  }

  test("peringatan tampil untuk [::1]", async () => {
    // Server kecil di ::1 yang menolak token, supaya proses berhenti sendiri.
    let hits = 0;
    const srv = Bun.serve({
      hostname: "::1",
      port: 0,
      fetch: () => {
        hits++;
        return Response.json({ ok: false, error_code: 401, description: "Unauthorized" }, { status: 401 });
      },
    });
    try {
      const value = `http://[::1]:${srv.port}`;
      const m = spawnMain(value);
      expect(await m.proc.exited).toBe(1);
      await m.done;
      const out = m.out();
      expect(out).toStartWith(`master-bot: PERINGATAN: MASTER_BOT_API_ROOT=${value} aktif.`);
      expect(out).toContain("401 Unauthorized");
      expect(out).not.toContain(TOKEN.split(":")[1]!);
      expect(hits).toBeGreaterThan(0);
    } finally {
      srv.stop(true);
    }
  }, 20000);
});

describe("main.ts tanpa MASTER_BOT_API_ROOT", () => {
  // Tanpa variabel, proses akan ke Telegram sungguhan; supaya tidak ada
  // token yang terkirim, .env dikosongkan dan proses berhenti di cek konfigurasi.
  for (const [name, value] of [
    ["tidak di-set", undefined],
    ["kosong", ""],
    ["hanya spasi", "   "],
  ] as const) {
    test(`perilaku sama dengan run() biasa: ${name}`, async () => {
      rmSync(join(home, "master", ".env"));
      const lines: string[] = [];
      expect(await run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l) })).toBe(1);
      const m = spawnMain(value);
      expect(await m.proc.exited).toBe(1);
      await m.done;
      expect(m.out()).toBe(lines.join("\n") + "\n");
      expect(m.out()).not.toContain("PERINGATAN");
      expect(m.out()).not.toContain("MASTER_BOT_API_ROOT");
    }, 20000);
  }
});
