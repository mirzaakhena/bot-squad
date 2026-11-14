import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261114101201: "typing…" sepanjang giliran dan reaksi tanda diterima,
 * di server plugin sungguhan (bun server.ts) terhadap Telegram tiruan di
 * 127.0.0.1. Token palsu. Dilewati kalau plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`typing-server.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5006:AAFakeTokenForTypingTest_ffffffffffffff";
const OWNER = 111222;
const STRANGER = 333444;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

type Call = { method: string; body: Record<string, unknown>; at: number };
function fakeTelegram() {
  let pending: unknown[] = [];
  const calls: Call[] = [];
  let nextMsg = 900;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      const body = req.headers.get("content-type")?.includes("json") ? await req.json() : {};
      let result: unknown = true;
      if (method === "getMe") result = { id: 5006, is_bot: true, first_name: "uji", username: "uji_typing_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else {
        calls.push({ method, body: body as Record<string, unknown>, at: Date.now() });
        if (method === "sendMessage") result = { message_id: ++nextMsg, date: 0, chat: { id: (body as { chat_id: number }).chat_id, type: "private" } };
      }
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  const of = (method: string) => calls.filter((c) => c.method === method);
  return { apiRoot: `http://127.0.0.1:${server.port}`, push: (u: unknown) => pending.push(u), calls, of };
}

let updateId = 6000;
function textUpdate(from: number, text: string, command = false) {
  ++updateId;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from, type: "private", first_name: "u" },
      from: { id: from, is_bot: false, first_name: "u" },
      text,
      ...(command ? { entities: [{ type: "bot_command", offset: 0, length: text.length }] } : {}),
    },
  };
}

function startServer(state: string, apiRoot: string, extraEnv: Record<string, string> = {}) {
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
      ...extraEnv,
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
  return { p, send, stdout: () => out.join(""), stderr: () => err.join("") };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}
const pesanLines = (state: string) => {
  try { return readFileSync(join(state, "plugin.log"), "utf8").split("\n").filter((l) => l.split(" ")[1] === "pesan"); } catch { return []; }
};

function newState(access: Record<string, unknown>) {
  const state = mkdtempSync(join(tmpdir(), "bot-squad-typing-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {}, ...access }));
  return state;
}

test.skipIf(!hasDeps)("pesan pemilik: 👀 bawaan, typing diperbarui tiap ~4 detik, berhenti di balasan pertama", async () => {
  const tg = fakeTelegram();
  const state = newState({});
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_typing_bot"), "polling");

  const u = textUpdate(OWNER, "kerjakan yang lama");
  tg.push(u);
  await waitFor(() => srv.stdout().includes("notifications/claude/channel"), "diteruskan ke Claude");
  await waitFor(() => tg.of("setMessageReaction").length === 1, "reaksi tanda diterima");
  expect(tg.of("setMessageReaction")[0]!.body).toMatchObject({ chat_id: String(OWNER), message_id: u.message.message_id, reaction: [{ type: "emoji", emoji: "👀" }] });

  await waitFor(() => tg.of("sendChatAction").length >= 3, "typing diperbarui", 12_000);
  const pings = tg.of("sendChatAction");
  for (const c of pings) expect(c.body).toMatchObject({ chat_id: String(OWNER), action: "typing" });
  const gap = pings[2]!.at - pings[1]!.at;
  expect(gap).toBeGreaterThan(3_000);
  expect(gap).toBeLessThan(5_000);

  // Balasan pertama dari Claude.
  srv.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "reply", arguments: { chat_id: String(OWNER), text: "selesai" } } });
  await waitFor(() => tg.of("sendMessage").length === 1, "balasan terkirim");
  const afterReply = tg.of("sendChatAction").length;
  await Bun.sleep(9_000);
  expect(tg.of("sendChatAction").length).toBe(afterReply);
  expect(tg.of("setMessageReaction")).toHaveLength(1);
}, 45_000);

test.skipIf(!hasDeps)("tanpa balasan: typing berhenti sendiri di batas waktu (dipercepat lewat BOT_SQUAD_TYPING_MAX_MS)", async () => {
  const tg = fakeTelegram();
  const state = newState({});
  const srv = startServer(state, tg.apiRoot, { BOT_SQUAD_TYPING_MAX_MS: "6000" });
  await waitFor(() => srv.stderr().includes("polling as @uji_typing_bot"), "polling");
  tg.push(textUpdate(OWNER, "tidak akan dibalas"));
  await waitFor(() => tg.of("sendChatAction").length === 1, "typing pertama");
  const t0 = tg.of("sendChatAction")[0]!.at;
  await Bun.sleep(14_000);
  const pings = tg.of("sendChatAction");
  // Batas 6 detik, interval 4 detik: ping di 0 dan 4 detik, lalu berhenti.
  expect(pings).toHaveLength(2);
  for (const c of pings) expect(c.at - t0).toBeLessThan(6_000);
}, 40_000);

test.skipIf(!hasDeps)("tanpa typing: orang asing, perintah plugin, dan jawaban izin", async () => {
  const tg = fakeTelegram();
  const state = newState({});
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_typing_bot"), "polling");

  tg.push(textUpdate(STRANGER, "halo"));
  for (const c of ["/start", "/help", "/status", "/context"]) tg.push(textUpdate(OWNER, c, true));
  const perm = textUpdate(OWNER, "yes abcde");
  tg.push(perm);
  await waitFor(() => pesanLines(state).length === 6, "enam baris pesan");
  await Bun.sleep(1_500);

  const lines = pesanLines(state);
  expect(lines.filter((l) => l.includes("hasil=dibuang"))).toHaveLength(1);
  expect(lines.filter((l) => l.includes("hasil=tidak-diteruskan"))).toHaveLength(4);
  expect(lines.filter((l) => l.includes("hasil=izin"))).toHaveLength(1);
  expect(tg.of("sendChatAction")).toEqual([]);
  // Jawaban izin hanya mendapat ✅, tidak 👀.
  const reactions = tg.of("setMessageReaction");
  expect(reactions).toHaveLength(1);
  expect(reactions[0]!.body).toMatchObject({ message_id: perm.message.message_id, reaction: [{ type: "emoji", emoji: "✅" }] });
}, 30_000);

test.skipIf(!hasDeps)("ackReaction \"\" mematikan reaksi, ackReaction lain dipakai; typing tetap ada", async () => {
  for (const [ackReaction, expected] of [["", null], ["👍", "👍"]] as const) {
    const tg = fakeTelegram();
    const state = newState({ ackReaction });
    const srv = startServer(state, tg.apiRoot);
    await waitFor(() => srv.stderr().includes("polling as @uji_typing_bot"), "polling");
    tg.push(textUpdate(OWNER, "halo"));
    await waitFor(() => tg.of("sendChatAction").length === 1, "typing");
    await waitFor(() => pesanLines(state).some((l) => l.includes("hasil=diteruskan")), "diteruskan");
    await Bun.sleep(800);
    const reactions = tg.of("setMessageReaction");
    if (expected == null) expect(reactions).toEqual([]);
    else expect(reactions.map((r) => (r.body.reaction as Array<{ emoji: string }>)[0]!.emoji)).toEqual([expected]);
    srv.p.kill("SIGKILL");
  }
}, 40_000);
