import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261114101205: alat reply dan edit_message di server plugin sungguhan
 * (bun server.ts) terhadap Telegram tiruan. Telegram tiruan memeriksa
 * MarkdownV2 kira-kira seperti Telegram: karakter khusus yang tidak di-escape
 * di luar kode ditolak 400 "can't parse entities". Token palsu. Dilewati
 * kalau plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "telegramify-markdown"));
if (!hasDeps) console.warn(`reply-format.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5006:AAFakeTokenForReplyFormatTest_ffffffffff";
const OWNER = "111333";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

/**
 * Pemeriksa MarkdownV2 sederhana: di luar blok/inline kode, setiap karakter
 * khusus harus di-escape kecuali penanda format yang berpasangan. Cukup untuk
 * menangkap teks mentah yang dikirim dengan parse_mode MarkdownV2, dan fence
 * yang tidak tertutup.
 */
function checkMarkdownV2(text: string): string | null {
  let i = 0;
  const open: string[] = [];
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\\") { i += 2; continue; }
    if (text.startsWith("```", i)) {
      const end = text.indexOf("\n```", i + 3);
      if (end < 0) return `Can't find end of Pre entity at offset ${i}`;
      i = end + 4;
      continue;
    }
    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end < 0) return `Can't find end of Code entity at offset ${i}`;
      i = end + 1;
      continue;
    }
    if ("*_~".includes(c)) {
      if (open.at(-1) === c) open.pop(); else open.push(c);
      i++;
      continue;
    }
    if (c === "[") {
      const m = /^\[([^\]]*)\]\(((?:\\.|[^)\\])*)\)/.exec(text.slice(i));
      if (!m) return `Character '[' is reserved and must be escaped with the preceding '\\'`;
      i += m[0].length;
      continue;
    }
    if ("[]()>#+-=|{}.!".includes(c)) {
      // '>' di awal baris adalah kutipan.
      if (c === ">" && (i === 0 || text[i - 1] === "\n")) { i++; continue; }
      return `Character '${c}' is reserved and must be escaped with the preceding '\\'`;
    }
    i++;
  }
  if (open.length) return `Can't find end of ${open.at(-1)} entity`;
  return null;
}

type Sent = { method: string; chat_id: string | number; text: string; parse_mode?: string; reply_parameters?: { message_id: number } };
function fakeTelegram() {
  const sent: Sent[] = [];
  const rejected: Array<{ method: string; description: string }> = [];
  let nextId = 700;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      const body = req.headers.get("content-type")?.includes("json") ? await req.json() : {};
      let result: unknown = true;
      if (method === "getMe") result = { id: 5006, is_bot: true, first_name: "uji", username: "uji_fmt_bot" };
      else if (method === "getUpdates") { await Bun.sleep(30); result = []; }
      else if (method === "sendMessage" || method === "editMessageText") {
        const b = body as Sent;
        if (b.text.length > 4096) return Response.json({ ok: false, error_code: 400, description: "Bad Request: message is too long" }, { status: 400 });
        if (b.parse_mode === "MarkdownV2") {
          const why = checkMarkdownV2(b.text);
          if (why) {
            const description = `Bad Request: can't parse entities: ${why}`;
            rejected.push({ method, description });
            return Response.json({ ok: false, error_code: 400, description }, { status: 400 });
          }
        }
        sent.push({ ...b, method });
        result = { message_id: method === "sendMessage" ? ++nextId : Number((b as { message_id?: number }).message_id), date: 0, chat: { id: b.chat_id, type: "private" }, text: b.text };
      }
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  return { apiRoot: `http://127.0.0.1:${server.port}`, sent, rejected };
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
  let out = "";
  let err = "";
  void (async () => { const d = new TextDecoder(); for await (const c of p.stdout as ReadableStream<Uint8Array>) out += d.decode(c); })();
  void (async () => { const d = new TextDecoder(); for await (const c of p.stderr as ReadableStream<Uint8Array>) err += d.decode(c); })();
  const send = (msg: unknown) => { p.stdin!.write(JSON.stringify(msg) + "\n"); p.stdin!.flush(); };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uji", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  let id = 10;
  const responses = () => out.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  async function call(name: string, args: Record<string, unknown>) {
    const myId = ++id;
    send({ jsonrpc: "2.0", id: myId, method: "tools/call", params: { name, arguments: args } });
    await waitFor(() => responses().some((r) => r.id === myId), `jawaban ${name}`);
    return responses().find((r) => r.id === myId).result as { content: Array<{ text: string }>; isError?: boolean };
  }
  async function listTools() {
    const myId = ++id;
    send({ jsonrpc: "2.0", id: myId, method: "tools/list" });
    await waitFor(() => responses().some((r) => r.id === myId), "tools/list");
    return responses().find((r) => r.id === myId).result.tools as Array<{ name: string; inputSchema: any }>;
  }
  return { stderr: () => err, call, listTools, instructions: () => responses().find((r) => r.id === 1)?.result?.instructions as string };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}

function setup(access: Record<string, unknown> = {}) {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-fmt-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [OWNER], groups: {}, pending: {}, ...access }));
  const srv = startServer(state, tg.apiRoot);
  return { tg, state, srv };
}

test("pemeriksa MarkdownV2 tiruan menolak teks mentah dan menerima hasil konversi", async () => {
  expect(checkMarkdownV2("Selesai! v1.2")).toContain("'!'");
  expect(checkMarkdownV2("**tebal**")).toBeNull(); // dua pasangan *: lolos
  expect(checkMarkdownV2("*tebal")).toContain("end of");
  expect(checkMarkdownV2("```\nx.y")).toContain("Pre");
  expect(checkMarkdownV2("Selesai\\! v1\\.2 `a.b` [x](https://a.b)")).toBeNull();
});

test.skipIf(!hasDeps)("reply: Markdown biasa tampil terformat, tanpa Claude meng-escape", async () => {
  const { tg, srv } = setup();
  await waitFor(() => srv.stderr().includes("polling as @uji_fmt_bot"), "polling");
  expect(srv.instructions()).toContain("ordinary Markdown");
  const tools = await srv.listTools();
  for (const n of ["reply", "edit_message"]) {
    const f = tools.find((t) => t.name === n)!.inputSchema.properties.format;
    expect(f.enum).toEqual(["markdown", "text", "markdownv2"]);
    expect(f.description).toContain("Default 'markdown'");
  }

  const text = "**Selesai!** Versi 1.2 (beta) siap: `bun test` lulus.\n\n- satu\n- dua\n\nLihat [dok](https://example.com/a_b).\n\n```ts\nconst x = f(1).y!\n```";
  const r = await srv.call("reply", { chat_id: OWNER, text });
  expect(r.isError).toBeUndefined();
  expect(r.content[0]!.text).toBe("sent (id: 701)");
  expect(tg.rejected).toEqual([]);
  expect(tg.sent).toHaveLength(1);
  expect(tg.sent[0]!.parse_mode).toBe("MarkdownV2");
  expect(tg.sent[0]!.text).toBe("*Selesai\\!* Versi 1\\.2 \\(beta\\) siap: `bun test` lulus\\.\n\n•   satu\n•   dua\n\nLihat [dok](https://example.com/a_b)\\.\n\n```\nconst x = f(1).y!\n```");

  // format 'text' tetap teks biasa tanpa parse_mode.
  await srv.call("reply", { chat_id: OWNER, text: "**mentah**", format: "text" });
  expect(tg.sent[1]).toMatchObject({ text: "**mentah**" });
  expect(tg.sent[1]!.parse_mode).toBeUndefined();
}, 30_000);

test.skipIf(!hasDeps)("reply: format ditolak Telegram -> dikirim sebagai teks biasa, tercatat di plugin.log", async () => {
  const { tg, state, srv } = setup();
  await waitFor(() => srv.stderr().includes("polling as @uji_fmt_bot"), "polling");
  // markdownv2 mentah yang salah escape: dulu balasan hilang dengan error.
  const r = await srv.call("reply", { chat_id: OWNER, text: "Selesai! v1.2", format: "markdownv2", reply_to: "55" });
  expect(r.isError).toBeUndefined();
  expect(tg.rejected).toHaveLength(1);
  expect(tg.sent).toHaveLength(1);
  expect(tg.sent[0]!.text).toBe("Selesai! v1.2");
  expect(tg.sent[0]!.parse_mode).toBeUndefined();
  // Kutipan tetap ada di kiriman ulang.
  expect(tg.sent[0]!.reply_parameters).toEqual({ message_id: 55 });

  // edit_message juga.
  const e = await srv.call("edit_message", { chat_id: OWNER, message_id: "701", text: "*a", format: "markdownv2" });
  expect(e.isError).toBeUndefined();
  expect(tg.sent[1]).toMatchObject({ method: "editMessageText", text: "*a" });
  expect(tg.sent[1]!.parse_mode).toBeUndefined();
  // edit_message bawaan markdown.
  await srv.call("edit_message", { chat_id: OWNER, message_id: "701", text: "**ok**." });
  expect(tg.sent[2]).toMatchObject({ method: "editMessageText", text: "*ok*\\.", parse_mode: "MarkdownV2" });

  const log = readFileSync(join(state, "plugin.log"), "utf8").split("\n").filter((l) => l.split(" ")[1] === "format-ditolak");
  expect(log).toHaveLength(2);
  expect(log[0]).toContain("alat=reply potongan=1/1 alasan=");
  expect(log[1]).toContain("alat=edit_message alasan=");
  expect(log.join("\n")).not.toContain("Selesai");
}, 30_000);

test.skipIf(!hasDeps)("reply panjang berisi kode: beberapa pesan berurutan, kode tetap blok kode, kutipan di potongan pertama", async () => {
  const { tg, srv } = setup();
  await waitFor(() => srv.stderr().includes("polling as @uji_fmt_bot"), "polling");
  const code = Array.from({ length: 300 }, (_, i) => `print("baris ${i}.") # (x+y)=z!`).join("\n");
  const text = `Ini **skripnya**:\n\n\`\`\`python\n${code}\n\`\`\`\n\nSelesai. *Semoga* membantu!`;
  const r = await srv.call("reply", { chat_id: OWNER, text, reply_to: "42" });
  expect(r.isError).toBeUndefined();
  expect(tg.rejected).toEqual([]);
  const n = tg.sent.length;
  expect(n).toBeGreaterThan(2);
  expect(r.content[0]!.text).toBe(`sent ${n} parts (ids: ${tg.sent.map((_, i) => 701 + i).join(", ")})`);
  for (const [i, m] of tg.sent.entries()) {
    expect(m.parse_mode).toBe("MarkdownV2");
    expect(m.text.length).toBeLessThanOrEqual(4096);
    expect(checkMarkdownV2(m.text)).toBeNull();
    if (i > 0) expect(m.text.startsWith("```\n")).toBe(true);
    if (i < n - 1) expect(m.text.endsWith("\n```")).toBe(true);
    if (i === 0) expect(m.reply_parameters).toEqual({ message_id: 42 });
    else expect(m.reply_parameters).toBeUndefined();
  }
  expect(tg.sent[0]!.text.startsWith("Ini *skripnya*:\n\n```\n")).toBe(true);
  expect(tg.sent.at(-1)!.text.endsWith("Selesai\\. _Semoga_ membantu\\!")).toBe(true);
  // Urutan dan isi kode utuh.
  const lines = tg.sent.flatMap((m) => m.text.split("\n")).filter((l) => l.startsWith("print("));
  expect(lines).toHaveLength(300);
  expect(lines[0]).toBe('print("baris 0.") # (x+y)=z!');
  expect(lines[299]).toBe('print("baris 299.") # (x+y)=z!');
}, 30_000);

test.skipIf(!hasDeps)("reply: replyToMode 'all' dan textChunkLimit di access.json tetap dihormati", async () => {
  const { tg, srv } = setup({ replyToMode: "all", textChunkLimit: 300 });
  await waitFor(() => srv.stderr().includes("polling as @uji_fmt_bot"), "polling");
  const text = Array.from({ length: 40 }, (_, i) => `Baris ${i}: a.b (c)!`).join("\n");
  await srv.call("reply", { chat_id: OWNER, text, reply_to: "9" });
  expect(tg.sent.length).toBeGreaterThan(2);
  for (const m of tg.sent) {
    expect(m.text.length).toBeLessThanOrEqual(300);
    expect(m.reply_parameters).toEqual({ message_id: 9 });
    expect(m.parse_mode).toBe("MarkdownV2");
  }
}, 30_000);
