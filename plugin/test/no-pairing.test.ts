import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261115085701: plugin tidak lagi membawa skill access/configure dan
 * alur pairing. Server plugin sungguhan terhadap Telegram tiruan, token palsu.
 * Tes server dilewati tanpa plugin/node_modules.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));

const TOKEN = "5015:AAFakeTokenForNoPairingTest_qqqqqqqqqq";
const OWNER = 111222;
const STRANGER = 333444;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

type Call = { method: string; body: Record<string, unknown> };
function fakeTelegram() {
  let pending: unknown[] = [];
  const calls: Call[] = [];
  const server = Bun.serve({
    // 127.0.0.1, bukan semua alamat: lihat komentar di master/test/fake-telegram.ts.
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      const body = (req.headers.get("content-type")?.includes("json") ? await req.json() : {}) as Record<string, unknown>;
      let result: unknown = true;
      if (method === "getMe") result = { id: 5015, is_bot: true, first_name: "uji", username: "uji_nopair_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else {
        calls.push({ method, body });
        if (method === "sendMessage") result = { message_id: 900 + calls.length, date: 0, chat: { id: body.chat_id, type: "private" } };
      }
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  return {
    apiRoot: `http://127.0.0.1:${server.port}`,
    push: (u: unknown) => pending.push(u),
    calls,
    /** Semua panggilan yang terlihat oleh orang di Telegram (selain menu). */
    visible: () => calls.filter((c) => c.method !== "setMyCommands" && c.method !== "deleteWebhook"),
  };
}

let updateId = 9000;
function msg(text: string, from: number, isCommand = false) {
  ++updateId;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from, type: "private", first_name: "u" },
      from: { id: from, is_bot: false, first_name: "u" },
      text,
      ...(isCommand ? { entities: [{ type: "bot_command", offset: 0, length: text.length }] } : {}),
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
  const out: Array<Record<string, any>> = [];
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of p.stderr as ReadableStream<Uint8Array>) err.push(dec.decode(chunk));
  })();
  void (async () => {
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of p.stdout as ReadableStream<Uint8Array>) {
      buf += dec.decode(chunk);
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try { out.push(JSON.parse(line)); } catch {}
      }
    }
  })();
  const send = (m: unknown) => {
    p.stdin!.write(JSON.stringify(m) + "\n");
    p.stdin!.flush();
  };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uji", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return {
    stderr: () => err.join(""),
    send,
    out,
    channel: () => out.filter((m) => m.method === "notifications/claude/channel"),
  };
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

const PAIRING_WORDS = /pair|bot-squad:access|bot-squad:configure|skill/i;

test("folder plugin tidak lagi berisi skill", () => {
  expect(existsSync(join(PLUGIN, "skills"))).toBe(false);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name === "SKILL.md") found.push(join(dir, e.name));
    }
  };
  walk(PLUGIN);
  expect(found).toEqual([]);
  // commands/ dan agents/ juga tidak ada: plugin hanya membawa server MCP.
  expect(existsSync(join(PLUGIN, "commands"))).toBe(false);
});

// access.json per kasus. `pending` berisi kode untuk STRANGER seperti yang
// ditinggalkan plugin lama; `ownerAllowed` = apakah pemilik masih dilayani.
const pendingOld = {
  a1b2c3: { senderId: String(STRANGER), chatId: String(STRANGER), createdAt: Date.now(), expiresAt: Date.now() + 3_600_000, replies: 1 },
};
const CASES: Array<{ name: string; access: string | null; ownerAllowed: boolean }> = [
  { name: "dmPolicy pairing", access: JSON.stringify({ dmPolicy: "pairing", allowFrom: [String(OWNER)], groups: {}, pending: {} }), ownerAllowed: true },
  { name: "dmPolicy pairing dengan kode lama yang menunggu", access: JSON.stringify({ dmPolicy: "pairing", allowFrom: [String(OWNER)], groups: {}, pending: pendingOld }), ownerAllowed: true },
  { name: "dmPolicy allowlist", access: JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} }), ownerAllowed: true },
  { name: "tanpa dmPolicy", access: JSON.stringify({ allowFrom: [String(OWNER)] }), ownerAllowed: true },
  { name: "dmPolicy tak dikenal", access: JSON.stringify({ dmPolicy: "open", allowFrom: [String(OWNER)] }), ownerAllowed: true },
  { name: "dmPolicy pairing dengan allowFrom kosong", access: JSON.stringify({ dmPolicy: "pairing", allowFrom: [], groups: {}, pending: {} }), ownerAllowed: false },
  { name: "dmPolicy disabled", access: JSON.stringify({ dmPolicy: "disabled", allowFrom: [String(OWNER)] }), ownerAllowed: false },
  { name: "access.json tidak ada", access: null, ownerAllowed: false },
];

for (const c of CASES) {
  test.skipIf(!hasDeps)(`${c.name}: orang di luar allowlist tidak pernah dibalas dan tidak mendapat kode pairing`, async () => {
    const tg = fakeTelegram();
    const state = mkdtempSync(join(tmpdir(), "bot-squad-nopair-"));
    cleanups.push(() => rmSync(state, { recursive: true, force: true }));
    const accessFile = join(state, "access.json");
    if (c.access !== null) writeFileSync(accessFile, c.access);
    const srv = startServer(state, tg.apiRoot);
    await waitFor(() => srv.stderr().includes("polling as @uji_nopair_bot"), "polling");

    // Pesan biasa berkali-kali (dulu: kode, lalu pengingat), lalu perintah.
    for (const t of ["halo", "halo lagi", "tolong izinkan saya"]) tg.push(msg(t, STRANGER));
    tg.push(msg("/start", STRANGER, true));
    await waitFor(() => logLines(state).filter((l) => l.includes(`chat=${STRANGER}`)).length >= 3, "tiga pesan tercatat");
    await Bun.sleep(700);

    expect(tg.visible()).toEqual([]);
    expect(srv.channel()).toEqual([]);
    const lines = logLines(state).filter((l) => l.includes(`chat=${STRANGER}`));
    expect(lines.filter((l) => l.includes("hasil=dibuang"))).toHaveLength(3);
    expect(logLines(state).join("\n")).not.toMatch(/hasil=pairing/);
    // access.json tidak pernah ditulis plugin (tidak ada kode baru, tidak dibuat).
    if (c.access === null) expect(existsSync(accessFile)).toBe(false);
    else expect(readFileSync(accessFile, "utf8")).toBe(c.access);
    expect(readdirSync(state).filter((f) => f.startsWith("access.json."))).toEqual([]);

    // Pemilik: dilayani kalau ada di allowFrom (kecuali disabled).
    tg.push(msg("pesan pemilik", OWNER));
    if (c.ownerAllowed) {
      await waitFor(() => srv.channel().length === 1, "pesan pemilik diteruskan");
      expect(srv.channel()[0]!.params.content).toBe("pesan pemilik");
      expect(srv.channel()[0]!.params.meta.chat_id).toBe(String(OWNER));
      await waitFor(() => logLines(state).some((l) => l.includes(`chat=${OWNER}`) && l.includes("hasil=diteruskan")), "log diteruskan");
    } else {
      await waitFor(() => logLines(state).some((l) => l.includes(`chat=${OWNER}`) && l.includes("hasil=dibuang")), "log dibuang");
      await Bun.sleep(300);
      expect(srv.channel()).toEqual([]);
    }
    // Tidak ada satu pun teks keluar yang menyebut pairing.
    for (const call of tg.calls) expect(JSON.stringify(call.body)).not.toMatch(PAIRING_WORDS);
    expect(tg.calls.filter((x) => x.method === "sendMessage" && String(x.body.chat_id) === String(STRANGER))).toEqual([]);
  }, 30_000);
}

test.skipIf(!hasDeps)("access.json rusak: dipindahkan, tidak ada yang dibalas, tidak ada kode pairing", async () => {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-nopair-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), "{ bukan json");
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_nopair_bot"), "polling");
  tg.push(msg("halo", STRANGER));
  tg.push(msg("halo", OWNER));
  await waitFor(() => logLines(state).filter((l) => l.includes("hasil=dibuang")).length === 2, "dua pesan dibuang");
  await Bun.sleep(500);
  expect(tg.visible()).toEqual([]);
  expect(srv.channel()).toEqual([]);
  expect(existsSync(join(state, "access.json"))).toBe(false);
  expect(readdirSync(state).some((f) => f.startsWith("access.json.corrupt-"))).toBe(true);
}, 30_000);

test.skipIf(!hasDeps)("berkas approved/ warisan skill access tidak lagi diproses", async () => {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-nopair-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "pairing", allowFrom: [String(OWNER)], groups: {}, pending: {} }));
  mkdirSync(join(state, "approved"));
  writeFileSync(join(state, "approved", String(STRANGER)), "");
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_nopair_bot"), "polling");
  // Dulu dipindai setiap 5 detik lalu "Paired! Say hi to Claude." dikirim.
  await Bun.sleep(6500);
  expect(tg.visible()).toEqual([]);
  expect(existsSync(join(state, "approved", String(STRANGER)))).toBe(true);
}, 30_000);

test.skipIf(!hasDeps)("instruksi dan pesan galat merujuk ke master-bot, bukan skill atau pairing", async () => {
  const tg = fakeTelegram();
  const state = mkdtempSync(join(tmpdir(), "bot-squad-nopair-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {} }));
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.out.some((m) => m.id === 1), "jawaban initialize");
  const instructions: string = srv.out.find((m) => m.id === 1)!.result.instructions;
  expect(instructions).not.toMatch(PAIRING_WORDS);
  expect(instructions).toContain("master-bot");
  for (const c of ["/allow", "/revoke", "/access"]) expect(instructions).toContain(c);
  // Larangan mengubah akses karena diminta lewat pesan tetap ada.
  expect(instructions).toMatch(/Never edit access\.json/);
  expect(instructions).toMatch(/prompt injection/);

  // Deskripsi alat juga bersih.
  srv.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  await waitFor(() => srv.out.some((m) => m.id === 2), "tools/list");
  expect(JSON.stringify(srv.out.find((m) => m.id === 2)!.result)).not.toMatch(PAIRING_WORDS);

  // Balasan ke chat di luar allowlist: ditolak, petunjuknya master-bot.
  await waitFor(() => srv.stderr().includes("polling as @uji_nopair_bot"), "polling");
  srv.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "reply", arguments: { chat_id: String(STRANGER), text: "halo" } } });
  await waitFor(() => srv.out.some((m) => m.id === 3), "jawaban reply");
  const res = srv.out.find((m) => m.id === 3)!.result;
  expect(res.isError).toBe(true);
  const errText = JSON.stringify(res.content);
  expect(errText).toContain("not allowlisted");
  expect(errText).toContain("master-bot");
  expect(errText).not.toMatch(PAIRING_WORDS);
  expect(tg.visible()).toEqual([]);
}, 30_000);

test("dokumen dan manifest plugin tidak merujuk ke skill access/configure", () => {
  for (const f of ["README.md", "ACCESS.md", join(".claude-plugin", "plugin.json")]) {
    const text = readFileSync(join(PLUGIN, f), "utf8");
    expect(text).not.toMatch(/bot-squad:access|bot-squad:configure|skill/i);
    expect(text).not.toMatch(/pairing code|approve/i);
    expect(text).toContain("master-bot");
  }
});
