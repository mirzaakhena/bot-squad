import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261112225309: /help, /status di server plugin sungguhan terhadap
 * Telegram tiruan. Tiket 261115202402: /start bukan perintah lagi; ditelan
 * diam-diam. Token palsu. Dilewati tanpa plugin/node_modules.
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
  /** Semua panggilan selain getMe/getUpdates, untuk membuktikan "tidak ada apa pun". */
  const calls: Array<{ method: string; body: unknown }> = [];
  /** Menu per cakupan, seperti Telegram: setMyCommands menggantikan isi lama. */
  const menus = new Map<string, Array<{ command: string }>>();
  // Menu sisa versi lama plugin, masih memuat /start.
  menus.set("all_private_chats", [{ command: "start" }, { command: "help" }, { command: "status" }, { command: "context" }]);
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
      if (method === "getMe") result = { id: 5005, is_bot: true, first_name: "uji", username: "uji_cmd_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else calls.push({ method, body });
      if (method === "sendMessage") {
        sent.push(body as Sent);
        result = { message_id: 900 + sent.length, date: 0, chat: { id: (body as Sent).chat_id, type: "private" } };
      } else if (method === "setMyCommands") {
        commands.push(body);
        const b = body as { commands: Array<{ command: string }>; scope?: { type: string } };
        menus.set(b.scope?.type ?? "default", b.commands);
      }
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  return { apiRoot: `http://127.0.0.1:${server.port}`, push: (u: unknown) => pending.push(u), sent, commands, calls, menus };
}

let updateId = 7000;
function cmd(text: string, from: number, chat: { id: number; type: string }, username?: string, cmdLength = text.length) {
  ++updateId;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { ...chat, first_name: "u", title: "g" },
      from: { id: from, is_bot: false, first_name: "u", ...(username ? { username } : {}) },
      text,
      entities: [{ type: "bot_command", offset: 0, length: cmdLength }],
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
  const out: string[] = [];
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of p.stdout as ReadableStream<Uint8Array>) out.push(dec.decode(chunk));
  })();
  const send = (msg: unknown) => {
    p.stdin!.write(JSON.stringify(msg) + "\n");
    p.stdin!.flush();
  };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uji", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { stderr: () => err.join(""), stdout: () => out.join("") };
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
const PRIVATE = { id: OWNER, type: "private" };

for (const policy of ["allowlist", "pairing"]) {
  test.skipIf(!hasDeps)(`/help /status dmPolicy ${policy}: pemilik dibalas tanpa pairing, orang lain dan grup tidak; /start ditelan`, async () => {
    const tg = fakeTelegram();
    const state = mkdtempSync(join(tmpdir(), "bot-squad-cmds-"));
    cleanups.push(() => rmSync(state, { recursive: true, force: true }));
    writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: policy, allowFrom: [String(OWNER)], groups: {}, pending: {} }));
    const srv = startServer(state, tg.apiRoot);
    await waitFor(() => srv.stderr().includes("polling as @uji_cmd_bot"), "polling");
    await waitFor(() => tg.commands.length > 0, "menu");
    expect(JSON.stringify(tg.commands[0])).not.toMatch(/pairing/i);
    // Menu yang ditulis saat menyala menggantikan menu lama yang memuat /start.
    expect(tg.menus.get("all_private_chats")!.map((c) => c.command)).toEqual(["help", "status", "context"]);
    for (const [, menu] of tg.menus) expect(menu.map((c) => c.command)).not.toContain("start");

    for (const c of ["/start", "/help", "/status"]) {
      tg.push(cmd(c, STRANGER, { id: STRANGER, type: "private" }, "orang"));
      tg.push(cmd(c, OWNER, { id: -100123, type: "supergroup" }));
      tg.push(cmd(c, STRANGER, { id: -100123, type: "group" }));
    }
    await waitFor(() => pesanLines(state).length === 9, "sembilan baris pesan");
    await Bun.sleep(700);
    expect(tg.sent).toEqual([]);
    // /start dari orang lain dan di grup: seperti sebelum tiket 261115202402,
    // tidak dibalas dan tidak sampai ke Claude.
    expect(pesanLines(state).filter((l) => l.includes("hasil=diteruskan"))).toEqual([]);
    expect(srv.stdout()).not.toContain("notifications/claude/channel");

    // /start dari pemilik, dalam tiga bentuk: ditelan tanpa jejak di Telegram.
    const before = tg.calls.length;
    tg.push(cmd("/start", OWNER, PRIVATE, "pemilik"));
    tg.push(cmd("/start halo apa kabar", OWNER, PRIVATE, "pemilik", "/start".length));
    tg.push(cmd("/start@uji_cmd_bot", OWNER, PRIVATE, "pemilik"));
    tg.push(cmd("/start@uji_cmd_bot payload123", OWNER, PRIVATE, "pemilik", "/start@uji_cmd_bot".length));
    await waitFor(() => pesanLines(state).length === 13, "empat baris /start pemilik");
    await Bun.sleep(1500);
    // Tidak ada balasan, typing, reaksi, atau panggilan Telegram lain.
    expect(tg.calls.slice(before)).toEqual([]);
    expect(srv.stdout()).not.toContain("notifications/claude/channel");
    const startLines = pesanLines(state).slice(9);
    expect(startLines).toHaveLength(4);
    for (const l of startLines) {
      expect(l).toContain("hasil=tidak-diteruskan");
      expect(l).toContain(`chat=${OWNER}`);
    }
    expect(readFileSync(join(state, "plugin.log"), "utf8")).not.toContain("/start");

    for (const c of ["/help", "/status"]) tg.push(cmd(c, OWNER, PRIVATE, "pemilik"));
    await waitFor(() => tg.sent.length === 2, "dua balasan");
    await Bun.sleep(300);
    expect(tg.sent).toHaveLength(2);
    for (const s of tg.sent) {
      expect(s.chat_id).toBe(OWNER);
      expect(s.text).not.toMatch(/pair|kode|6-char/i);
      expect(s.text).not.toContain("/start");
    }
    expect(tg.sent[0]!.text).toContain("sesi Claude Code");
    expect(tg.sent[0]!.text).toContain("/status");
    expect(tg.sent[0]!.text).toContain("/context");
    expect(tg.sent[1]!.text).toContain("diizinkan");
    expect(tg.sent[1]!.text).toContain("@pemilik");
    expect(tg.sent[1]!.text).toContain(String(OWNER));

    // Pesan biasa tetap diteruskan, dengan typing dan reaksi.
    const biasa = cmd("halo bot", OWNER, PRIVATE, "pemilik", 0);
    delete (biasa.message as { entities?: unknown }).entities;
    tg.push(biasa);
    await waitFor(() => srv.stdout().includes("notifications/claude/channel"), "pesan biasa diteruskan");
    expect(srv.stdout()).toContain("halo bot");
    expect(srv.stdout()).not.toContain("/start");
    await waitFor(() => tg.calls.some((c) => c.method === "sendChatAction") && tg.calls.some((c) => c.method === "setMessageReaction"), "typing dan reaksi");
    expect(pesanLines(state).at(-1)).toContain("hasil=diteruskan");
  }, 40_000);
}
