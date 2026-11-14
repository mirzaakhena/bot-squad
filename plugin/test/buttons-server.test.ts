import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261114101206: tombol pilihan dari Claude di server plugin sungguhan
 * (bun server.ts) terhadap Telegram tiruan di 127.0.0.1. Token palsu.
 * Dilewati kalau plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`buttons-server.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5006:AAFakeTokenForButtonsTest_fffffffffffff";
const OWNER = 111222;
const STRANGER = 333444;
const MANUAL = "✏️ Explain manually";
const MANUAL_DATA = "c:let me explain manually instead";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

type Call = { method: string; body: any };
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
      if (method === "getMe") result = { id: 5006, is_bot: true, first_name: "uji", username: "uji_buttons_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else {
        calls.push({ method, body });
        if (method === "sendMessage") result = { message_id: ++nextMsg, date: 0, chat: { id: Number(body.chat_id), type: "private" }, text: body.text };
      }
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  const of = (method: string) => calls.filter((c) => c.method === method);
  return { apiRoot: `http://127.0.0.1:${server.port}`, push: (u: unknown) => pending.push(u), calls, of };
}

let updateId = 8000;
/** Ketukan seperti dikirim Telegram: pesan bot lengkap dengan keyboard-nya. */
function tap(from: number, message: Record<string, unknown>, data: string) {
  ++updateId;
  return {
    update_id: updateId,
    callback_query: {
      id: `cq${updateId}`,
      from: { id: from, is_bot: false, first_name: "u", username: from === OWNER ? "pemilik" : "asing" },
      chat_instance: "ci",
      data,
      message: { date: 1, chat: { id: OWNER, type: "private", first_name: "p" }, from: { id: 5006, is_bot: true, first_name: "uji" }, ...message },
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
    out.join("").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
  let rpc = 10;
  const call = async (name: string, args: Record<string, unknown>) => {
    const id = ++rpc;
    send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
    await waitFor(() => messages().some((m) => m.id === id), `jawaban ${name}`);
    return messages().find((m) => m.id === id).result as { content: Array<{ text: string }>; isError?: boolean };
  };
  const notes = () => messages().filter((m) => m.method === "notifications/claude/channel").map((m) => m.params as { content: string; meta: Record<string, string> });
  const perms = () => messages().filter((m) => m.method === "notifications/claude/channel/permission").map((m) => m.params);
  return { p, send, call, messages, notes, perms, stderr: () => err.join("") };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}

function newState(access: Record<string, unknown> = {}) {
  const state = mkdtempSync(join(tmpdir(), "bot-squad-buttons-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {}, ...access }));
  return state;
}
const tombolLines = (state: string) => {
  try { return readFileSync(join(state, "plugin.log"), "utf8").split("\n").filter((l) => l.split(" ")[1] === "tombol"); } catch { return []; }
};

async function ready() {
  const tg = fakeTelegram();
  const state = newState();
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_buttons_bot"), "polling");
  return { tg, state, srv };
}

test.skipIf(!hasDeps)("kirim tombol, tekan satu: sampai ke Claude, keyboard dicopot, pesan ditandai, tekan ulang diabaikan", async () => {
  const { tg, state, srv } = await ready();
  const init = srv.messages().find((m) => m.id === 1);
  expect(init.result.instructions).toContain("Explain manually");
  const tools = await (async () => {
    srv.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await waitFor(() => srv.messages().some((m) => m.id === 2), "tools/list");
    return srv.messages().find((m) => m.id === 2).result.tools;
  })();
  expect(tools.find((t: any) => t.name === "reply").inputSchema.properties).toHaveProperty("buttons");

  const text = "Mau yang mana?\n1. Lanjut backup\n2. Batalkan";
  const res = await srv.call("reply", { chat_id: String(OWNER), text, buttons: [[{ text: "1", data: "lanjut" }, { text: "2" }]] });
  expect(res.isError).toBeFalsy();
  const sent = tg.of("sendMessage");
  expect(sent).toHaveLength(1);
  const kb = sent[0]!.body.reply_markup.inline_keyboard;
  expect(kb).toEqual([[{ text: "1", callback_data: "c:lanjut" }, { text: "2", callback_data: "c:2" }], [{ text: MANUAL, callback_data: MANUAL_DATA }]]);

  // Pesan seperti Telegram mengembalikannya: teks tampil + entity + keyboard.
  const msg = { message_id: 901, text, entities: [{ type: "bold", offset: 0, length: 3 }], reply_markup: { inline_keyboard: kb } };
  tg.push(tap(OWNER, msg, "c:lanjut"));
  await waitFor(() => srv.notes().length === 1, "pilihan diteruskan");
  const n = srv.notes()[0]!;
  expect(n.content).toBe("lanjut");
  expect(n.meta).toMatchObject({ chat_id: String(OWNER), user: "pemilik", user_id: String(OWNER), button_data: "lanjut", button_label: "1", button_message_id: "901" });
  expect(n.meta).not.toHaveProperty("button_manual");

  await waitFor(() => tg.of("editMessageText").length === 1, "pesan ditandai");
  const edit = tg.of("editMessageText")[0]!.body;
  expect(edit).toMatchObject({ chat_id: OWNER, message_id: 901, text: `${text}\n\n→ 1`, entities: msg.entities });
  expect(edit.reply_markup).toBeUndefined(); // tanpa reply_markup = keyboard dicopot
  const answers = tg.of("answerCallbackQuery");
  expect(answers).toHaveLength(1);
  expect(answers[0]!.body.text).toBe("→ 1");
  // "typing…" menyala seperti pesan masuk.
  await waitFor(() => tg.of("sendChatAction").length >= 1, "typing");

  // Ketukan kedua pada pesan yang sama (sebelum klien melihat edit) dan ketukan pada
  // pesan yang keyboard-nya sudah dicopot: dijawab tapi tidak diteruskan.
  tg.push(tap(OWNER, msg, "c:2"));
  tg.push(tap(OWNER, { message_id: 901, text: `${text}\n\n→ 1` }, "c:2"));
  await waitFor(() => tg.of("answerCallbackQuery").length === 3, "dua ketukan ulang dijawab");
  await Bun.sleep(500);
  expect(srv.notes()).toHaveLength(1);
  expect(tg.of("editMessageText")).toHaveLength(1);
  const lines = tombolLines(state);
  expect(lines.filter((l) => l.includes("hasil=diteruskan"))).toHaveLength(1);
  expect(lines.filter((l) => l.includes("hasil=ganda"))).toHaveLength(2);
}, 30_000);

test.skipIf(!hasDeps)("tombol jawab sendiri: dicopot, ditandai, Claude diberi tahu pemilik akan mengetik", async () => {
  const { tg, state, srv } = await ready();
  // Claude ikut menulis tombol jawab-sendiri: tetap satu, di baris terakhir.
  await srv.call("reply", { chat_id: String(OWNER), text: "Pilih:\n1. A\n2. B", buttons: [[{ text: "1" }, { text: MANUAL }], [{ text: "2" }]] });
  const kb = tg.of("sendMessage")[0]!.body.reply_markup.inline_keyboard;
  expect(kb).toEqual([[{ text: "1", callback_data: "c:1" }], [{ text: "2", callback_data: "c:2" }], [{ text: MANUAL, callback_data: MANUAL_DATA }]]);

  tg.push(tap(OWNER, { message_id: 901, text: "Pilih:\n1. A\n2. B", reply_markup: { inline_keyboard: kb } }, MANUAL_DATA));
  await waitFor(() => srv.notes().length === 1, "diteruskan");
  const n = srv.notes()[0]!;
  expect(n.content).toContain("type their own answer");
  expect(n.meta).toMatchObject({ button_manual: "true", button_label: MANUAL, button_data: "let me explain manually instead" });
  await waitFor(() => tg.of("editMessageText").length === 1, "ditandai");
  expect(tg.of("editMessageText")[0]!.body.text).toBe(`Pilih:\n1. A\n2. B\n\n→ ${MANUAL}`);
  expect(tombolLines(state).some((l) => l.includes("hasil=jawab-sendiri"))).toBe(true);
}, 30_000);

test.skipIf(!hasDeps)("tombol salah ditolak sebelum apa pun terkirim, juga pada balasan panjang dan dengan berkas", async () => {
  const { tg, srv } = await ready();
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ text: "Pilih satu", buttons: [[{ text: "1" }, { text: "2" }]] }, /numbered_buttons_without_list/],
    [{ text: "x", buttons: [[{ text: "a", data: "d".repeat(63) }]] }, /callback_data_too_long/],
    [{ text: "x", buttons: [[{ text: "😀".repeat(20) }]] }, /callback_data_too_long/],
    [{ text: "x", buttons: "1,2" }, /array of rows/],
    [{ text: "p ".repeat(5000) + "\nPilih", buttons: [[{ text: "1" }, { text: "2" }]] }, /numbered_buttons_without_list/],
    [{ text: "Pilih", files: ["/etc/hosts"], buttons: [[{ text: "1" }, { text: "2" }]] }, /numbered_buttons_without_list/],
  ];
  for (const [args, re] of cases) {
    const res = await srv.call("reply", { chat_id: String(OWNER), ...args });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(re);
    expect(res.content[0]!.text).toMatch(/Nothing was sent|must be/);
  }
  expect(tg.of("sendMessage")).toEqual([]);
  expect(tg.of("sendDocument")).toEqual([]);
  expect(tg.of("sendPhoto")).toEqual([]);
}, 30_000);

test.skipIf(!hasDeps)("balasan panjang: tombol hanya di potongan terakhir; tanpa tombol tidak ada keyboard", async () => {
  const { tg, srv } = await ready();
  const long = Array.from({ length: 80 }, (_, i) => `Paragraf ${i} ${"isi ".repeat(20)}`).join("\n\n") + "\n\n1. Ya\n2. Tidak";
  await srv.call("reply", { chat_id: String(OWNER), text: long, buttons: [[{ text: "1" }, { text: "2" }]] });
  const sent = tg.of("sendMessage");
  expect(sent.length).toBeGreaterThan(1);
  for (const s of sent.slice(0, -1)) expect(s.body.reply_markup).toBeUndefined();
  expect(sent.at(-1)!.body.reply_markup.inline_keyboard.at(-1)).toEqual([{ text: MANUAL, callback_data: MANUAL_DATA }]);

  await srv.call("reply", { chat_id: String(OWNER), text: "biasa" });
  expect(tg.of("sendMessage").at(-1)!.body.reply_markup).toBeUndefined();
  await srv.call("reply", { chat_id: String(OWNER), text: "kosong", buttons: [] });
  expect(tg.of("sendMessage").at(-1)!.body.reply_markup).toBeUndefined();
}, 30_000);

test.skipIf(!hasDeps)("orang asing tidak bisa menekan tombol pilihan maupun izin; tombol izin pemilik tetap bekerja", async () => {
  const { tg, state, srv } = await ready();
  const kb = { inline_keyboard: [[{ text: "1", callback_data: "c:1" }], [{ text: MANUAL, callback_data: MANUAL_DATA }]] };
  tg.push(tap(STRANGER, { message_id: 950, text: "1. A", reply_markup: kb }, "c:1"));
  tg.push(tap(STRANGER, { message_id: 950, text: "1. A", reply_markup: kb }, MANUAL_DATA));

  // Permintaan izin dari Claude, lalu ditekan orang asing dan pemilik.
  srv.send({ jsonrpc: "2.0", method: "notifications/claude/channel/permission_request", params: { request_id: "abcde", tool_name: "Bash", description: "ls", input_preview: "{}" } });
  await waitFor(() => tg.of("sendMessage").length === 1, "permintaan izin terkirim");
  const permMsg = tg.of("sendMessage")[0]!.body;
  expect(permMsg.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual(["perm:more:abcde", "perm:allow:abcde", "perm:deny:abcde"]);
  tg.push(tap(STRANGER, { message_id: 951, text: permMsg.text, reply_markup: permMsg.reply_markup }, "perm:allow:abcde"));
  await waitFor(() => tg.of("answerCallbackQuery").length === 3, "tiga ketukan asing dijawab");
  expect(tg.of("answerCallbackQuery").map((c) => c.body.text)).toEqual(["Not authorized.", "Not authorized.", "Not authorized."]);
  await Bun.sleep(300);
  expect(srv.notes()).toEqual([]);
  expect(srv.perms()).toEqual([]);
  expect(tg.of("editMessageText")).toEqual([]);
  expect(tombolLines(state).filter((l) => l.includes("hasil=dibuang"))).toHaveLength(2);

  tg.push(tap(OWNER, { message_id: 951, text: permMsg.text, reply_markup: permMsg.reply_markup }, "perm:allow:abcde"));
  await waitFor(() => srv.perms().length === 1, "izin diteruskan");
  expect(srv.perms()[0]).toEqual({ request_id: "abcde", behavior: "allow" });
  await waitFor(() => tg.of("editMessageText").length === 1, "pesan izin ditandai");
  expect(tg.of("editMessageText")[0]!.body.text).toBe(`${permMsg.text}\n\n✅ Allowed`);
  expect(srv.notes()).toEqual([]);
  // Data perm: berbentuk tombol pilihan tidak mungkin: tombol Claude selalu berawalan c:.
}, 30_000);
