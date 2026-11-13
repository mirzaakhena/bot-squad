import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261112225309: /start, /help, /status di server plugin sungguhan
 * terhadap Telegram tiruan. Token palsu. Dilewati tanpa plugin/node_modules.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));

const TOKEN = "5005:AAFakeTokenForCommandsTest_eeeeeeeeeeee";
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
    port: 0,
    async fetch(req) {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      const body = req.headers.get("content-type")?.includes("json") ? await req.json() : {};
      let result: unknown = true;
      if (method === "getMe") result = { id: 5005, is_bot: true, first_name: "uji", username: "uji_cmd_bot" };
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

let updateId = 7000;
function cmd(text: string, from: number, chat: { id: number; type: string }, username?: string) {
  ++updateId;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { ...chat, first_name: "u", title: "g" },
      from: { id: from, is_bot: false, first_name: "u", ...(username ? { username } : {}) },
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.length }],
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
  const err: string[] = [];
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of p.stderr as ReadableStream<Uint8Array>) err.push(dec.decode(chunk));
  })();
  void (async () => { for await (const _ of p.stdout as ReadableStream<Uint8Array>) {} })();
  const send = (msg: unknown) => {
    p.stdin!.write(JSON.stringify(msg) + "\n");
    p.stdin!.flush();
  };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uji", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { stderr: () => err.join("") };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}

for (const policy of ["allowlist", "pairing"]) {
  test.skipIf(!hasDeps)(`/start /help /status dmPolicy ${policy}: pemilik dibalas tanpa pairing, orang lain dan grup tidak`, async () => {
    const tg = fakeTelegram();
    const state = mkdtempSync(join(tmpdir(), "bot-squad-cmds-"));
    cleanups.push(() => rmSync(state, { recursive: true, force: true }));
    writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: policy, allowFrom: [String(OWNER)], groups: {}, pending: {} }));
    const srv = startServer(state, tg.apiRoot);
    await waitFor(() => srv.stderr().includes("polling as @uji_cmd_bot"), "polling");
    await waitFor(() => tg.commands.length > 0, "menu");
    expect(JSON.stringify(tg.commands[0])).not.toMatch(/pairing/i);

    for (const c of ["/start", "/help", "/status"]) {
      tg.push(cmd(c, STRANGER, { id: STRANGER, type: "private" }, "orang"));
      tg.push(cmd(c, OWNER, { id: -100123, type: "supergroup" }));
      tg.push(cmd(c, STRANGER, { id: -100123, type: "group" }));
    }
    await Bun.sleep(1000);
    expect(tg.sent).toEqual([]);

    for (const c of ["/start", "/help", "/status"]) tg.push(cmd(c, OWNER, { id: OWNER, type: "private" }, "pemilik"));
    await waitFor(() => tg.sent.length === 3, "tiga balasan");
    await Bun.sleep(300);
    expect(tg.sent).toHaveLength(3);
    for (const s of tg.sent) {
      expect(s.chat_id).toBe(OWNER);
      expect(s.text).not.toMatch(/pair|kode|6-char/i);
    }
    expect(tg.sent[0]!.text).toContain("sesi Claude Code");
    expect(tg.sent[1]!.text).toContain("sesi Claude Code");
    expect(tg.sent[1]!.text).toContain("/context");
    expect(tg.sent[2]!.text).toContain("diizinkan");
    expect(tg.sent[2]!.text).toContain("@pemilik");
    expect(tg.sent[2]!.text).toContain(String(OWNER));
  }, 30_000);
}
