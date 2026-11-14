import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { writeCapturedStatus } from "../context.ts";

/**
 * Tiket 261114101207: pengingat konteks menipis lewat meta notifikasi, diuji
 * pada server plugin sungguhan (bun server.ts) terhadap Telegram tiruan di
 * 127.0.0.1. Token palsu. Dilewati kalau plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`context-reminder-server.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5007:AAFakeTokenForReminderServerTest_ffffffff";
const OWNER = 111222;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

function fakeTelegram() {
  let pending: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      let result: unknown = true;
      if (method === "getMe") result = { id: 5007, is_bot: true, first_name: "uji", username: "uji_reminder_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else if (method === "getFile") result = { file_id: "f", file_unique_id: "u" }; // tanpa file_path: foto tidak diunduh
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  return { apiRoot: `http://127.0.0.1:${server.port}`, push: (u: unknown) => pending.push(u) };
}

let updateId = 9000;
function update(fields: Record<string, unknown>) {
  ++updateId;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: OWNER, type: "private", first_name: "p" },
      from: { id: OWNER, is_bot: false, first_name: "p", username: "pemilik" },
      ...fields,
    },
  };
}
function startServer(state: string, apiRoot: string) {
  const p = Bun.spawn(["bun", "server.ts"], {
    cwd: PLUGIN,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      TELEGRAM_STATE_DIR: state,
      TELEGRAM_BOT_TOKEN: TOKEN,
      BOT_SQUAD_TELEGRAM_API_ROOT: apiRoot,
      HTTPS_PROXY: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
    },
  });
  cleanups.push(() => p.kill("SIGKILL"));
  const out: string[] = [];
  const err: string[] = [];
  const pump = async (s: ReadableStream<Uint8Array>, into: string[]) => {
    const dec = new TextDecoder();
    for await (const chunk of s) into.push(dec.decode(chunk));
  };
  void pump(p.stdout as ReadableStream<Uint8Array>, out);
  void pump(p.stderr as ReadableStream<Uint8Array>, err);
  const send = (msg: unknown) => {
    p.stdin!.write(JSON.stringify(msg) + "\n");
    p.stdin!.flush();
  };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uji", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  const messages = () =>
    out.join("").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const notes = () =>
    messages().filter((m: any) => m.method === "notifications/claude/channel").map((m: any) => m.params as { content: string; meta: Record<string, string> });
  return { p, messages, notes, stderr: () => err.join("") };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}


const KEY = "context_reminder";

test.skipIf(!hasDeps)("pengingat menempel hanya pada pesan yang diteruskan, selama di atas ambang", async () => {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-reminder-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} }));
  const status = join(state, "status.json");
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_reminder_bot"), "polling");

  const init = srv.messages().find((m: any) => m.id === 1) as any;
  expect(init.result.instructions).toContain("context_reminder");

  const sendAndWait = async (n: number, fields: Record<string, unknown>) => {
    tg.push(update(fields));
    await waitFor(() => srv.notes().length === n, `notifikasi ke-${n}`);
    return srv.notes()[n - 1]!;
  };

  // 1. Data tidak ada: tanpa pengingat.
  expect((await sendAndWait(1, { text: "satu" })).meta).not.toHaveProperty(KEY);

  // 2. Sesi baru (angka null): tanpa pengingat.
  writeCapturedStatus(status, { context_window: { total_input_tokens: 0, context_window_size: 200000, used_percentage: null } }, Date.now());
  expect((await sendAndWait(2, { text: "dua" })).meta).not.toHaveProperty(KEY);

  // 3. Di bawah ambang.
  writeCapturedStatus(status, { context_window: { total_input_tokens: 90000, context_window_size: 200000, used_percentage: 45 } }, Date.now());
  expect((await sendAndWait(3, { text: "tiga" })).meta).not.toHaveProperty(KEY);

  // 4. Di atas ambang: tidak ada notifikasi yang dikirim sendirian.
  writeCapturedStatus(status, { context_window: { total_input_tokens: 130000, context_window_size: 200000, used_percentage: 65 } }, Date.now());
  await Bun.sleep(800);
  expect(srv.notes().length).toBe(3);
  // Perintah plugin tidak diteruskan, jadi tidak membawa pengingat.
  tg.push(update({ text: "/context", entities: [{ type: "bot_command", offset: 0, length: 8 }] }));
  await Bun.sleep(800);
  expect(srv.notes().length).toBe(3);

  // Pesan pemilik berikutnya membawa pengingat dengan angkanya; content tidak berubah.
  const n4 = await sendAndWait(4, { text: "empat" });
  expect(n4.content).toBe("empat");
  expect(n4.meta[KEY]).toContain("130.0k dari 200.0k token (65%)");
  // Selama masih di atas ambang, pesan berikutnya juga membawanya (pemicu keadaan).
  writeCapturedStatus(status, { context_window: { total_input_tokens: 450000, context_window_size: 1000000, used_percentage: 45 } }, Date.now());
  const n5 = await sendAndWait(5, { photo: [{ file_id: "p1", file_unique_id: "pu1", width: 1, height: 1 }], caption: "foto" });
  expect(n5.meta[KEY]).toContain("450.0k dari 1M token (45%)");

  // 5. Kembali di bawah ambang (percakapan baru): hilang sendiri.
  writeCapturedStatus(status, { context_window: { total_input_tokens: 0, context_window_size: 1000000, used_percentage: null } }, Date.now());
  expect((await sendAndWait(6, { text: "enam" })).meta).not.toHaveProperty(KEY);

  // 6. Berkas rusak: tanpa pengingat, pesan tetap sampai.
  writeFileSync(status, "{rusak");
  const n7 = await sendAndWait(7, { text: "tujuh" });
  expect(n7.content).toBe("tujuh");
  expect(n7.meta).not.toHaveProperty(KEY);
}, 30_000);
