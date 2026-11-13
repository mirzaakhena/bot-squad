import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderContext } from "../context-render.ts";
import { writeCapturedStatus } from "../context.ts";

/**
 * Tiket 261112230304: /context di server plugin sungguhan (bun server.ts)
 * terhadap Telegram tiruan di 127.0.0.1. Token palsu. Dilewati kalau
 * plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`context-command.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5004:AAFakeTokenForContextCommandTest_dddddddd";
const OWNER = 111222;
const STRANGER = 333444;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

type Sent = { chat_id: number | string; text: string };
function fakeTelegram() {
  let pending: unknown[] = [];
  const sent: Sent[] = [];
  const commands: unknown[] = [];
  const server = Bun.serve({
    // 127.0.0.1, bukan semua alamat: lihat komentar di master/test/fake-telegram.ts.
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      const body = req.headers.get("content-type")?.includes("json") ? await req.json() : {};
      let result: unknown = true;
      if (method === "getMe") result = { id: 5004, is_bot: true, first_name: "uji", username: "uji_ctx_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else if (method === "sendMessage") {
        sent.push(body as Sent);
        result = { message_id: 900 + sent.length, date: 0, chat: { id: (body as Sent).chat_id, type: "private" } };
      } else if (method === "setMyCommands") commands.push(body);
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  return { apiRoot: `http://127.0.0.1:${server.port}`, push: (u: unknown) => pending.push(u), sent, commands };
}

let updateId = 5000;
function contextUpdate(from: number, chat: { id: number; type: string }) {
  ++updateId;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { ...chat, first_name: "u", title: "g" },
      from: { id: from, is_bot: false, first_name: "u" },
      text: "/context",
      entities: [{ type: "bot_command", offset: 0, length: 8 }],
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
  return { p, stdout: () => out.join(""), stderr: () => err.join("") };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}
const logLines = (state: string) => {
  try { return readFileSync(join(state, "plugin.log"), "utf8").split("\n").filter((l) => l.split(" ")[1] === "pesan"); } catch { return []; }
};

test.skipIf(!hasDeps)("/context: pemilik dibalas dari status.json, yang lain tidak dibalas sama sekali, tidak ada yang ke Claude", async () => {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-ctxcmd-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  // dmPolicy pairing sengaja: /start dan /help meloloskan orang asing di
  // mode ini, /context tidak boleh.
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "pairing", allowFrom: [String(OWNER)], groups: {}, pending: {} }));
  writeFileSync(join(state, "statusline.json"), JSON.stringify({ kind: "installed", chained: null, at_ms: 1 }));
  const captured = Date.now() - 120_000;
  const payload = { context_window: { used_percentage: 4, total_input_tokens: 41032, context_window_size: 1000000 }, rate_limits: { seven_day: { used_percentage: 31, resets_at: Math.floor(Date.now() / 1000) + 86400 + 1800 } } };
  writeCapturedStatus(join(state, "status.json"), payload, captured);

  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_ctx_bot"), "polling");
  await waitFor(() => tg.commands.length > 0, "menu");
  expect(JSON.stringify(tg.commands[0])).toContain('"command":"context"');

  // Yang tidak boleh: orang asing di DM, pemilik di grup, orang asing di grup.
  tg.push(contextUpdate(STRANGER, { id: STRANGER, type: "private" }));
  tg.push(contextUpdate(OWNER, { id: -100123, type: "supergroup" }));
  tg.push(contextUpdate(STRANGER, { id: -100123, type: "group" }));
  await waitFor(() => logLines(state).length === 3, "tiga baris pesan");
  await Bun.sleep(500);
  expect(tg.sent).toEqual([]);

  // Pemilik di DM.
  tg.push(contextUpdate(OWNER, { id: OWNER, type: "private" }));
  await waitFor(() => tg.sent.length === 1, "balasan /context");
  expect(tg.sent[0]!.chat_id).toBe(OWNER);
  const text = tg.sent[0]!.text;
  expect(text).toStartWith("Context\n◑○○○○○○○○○ 4%\n41.0k / 1M tokens\n\nRate Limit 7d\n●●●○○○○○○○ 31%\nreset 1d");
  expect(text).toMatch(/\nreset 1d\n\nLast update: \d\d:\d\d WIB\n\(2m ago\)$/);
  expect(text).toBe(renderContext({ captured_at_ms: captured, payload }, captured + 120_000));

  await Bun.sleep(300);
  expect(tg.sent).toHaveLength(1);
  // Tidak satu pun yang dikirim ke sesi Claude.
  expect(srv.stdout()).not.toContain("notifications/claude/channel");
  for (const l of logLines(state)) expect(l).toContain("hasil=tidak-diteruskan");
}, 30_000);

test.skipIf(!hasDeps)("/context sebelum bridge pernah menangkap: menunggu, lalu menjawab saat data muncul", async () => {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-ctxcmd-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} }));
  writeFileSync(join(state, "statusline.json"), JSON.stringify({ kind: "installed", chained: null, at_ms: 1 }));
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_ctx_bot"), "polling");
  tg.push(contextUpdate(OWNER, { id: OWNER, type: "private" }));
  await waitFor(() => tg.sent.length === 1, "pesan tunggu");
  expect(tg.sent[0]!.text).toBe("⏳ Menunggu data statusline...");
  // Bridge baru menangkap payload sesi baru (used_percentage null).
  const bridge = Bun.spawnSync(["bun", join(PLUGIN, "bot-squad-statusline.ts"), state], {
    stdin: Buffer.from(JSON.stringify({ context_window: { used_percentage: null }, model: { display_name: "Fable 5.2" } })),
  });
  expect(bridge.exitCode).toBe(0);
  await waitFor(() => tg.sent.length === 2, "balasan setelah data muncul", 10_000);
  expect(tg.sent[1]!.text).toStartWith("Context\n(tidak tersedia)\n\nFable 5.2\n\nLast update: ");
  expect(tg.sent[1]!.text).not.toContain("Rate Limit");
}, 30_000);
