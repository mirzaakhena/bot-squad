import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261114101204: album diteruskan sebagai satu pesan, diuji pada server
 * plugin sungguhan (bun server.ts) terhadap Telegram tiruan di 127.0.0.1.
 * Token palsu. Dilewati kalau plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`album-server.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5008:AAFakeTokenForAlbumServerTest_gggggggg";
const OWNER = 111444;
const STRANGER = 999555;
const MB = 1024 * 1024;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

// Foto: file_id "p<n>" -> file_path photos/p<n>.jpg berisi "foto <n>".
// "pfail" ada di getFile tetapi berkasnya 404; "pbad" ditolak getFile.
function fakeTelegram() {
  let pending: unknown[] = [];
  const calls: Array<{ method: string; params: Record<string, unknown>; at: number }> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const f = /^\/file\/bot([^/]+)\/photos\/(\w+)\.jpg$/.exec(url.pathname);
      if (f) {
        if (decodeURIComponent(f[1]!) !== TOKEN || f[2] === "pfail") return new Response("no", { status: 404 });
        return new Response(`foto ${f[2]}`);
      }
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(url.pathname);
      if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      const method = m[2]!;
      const params = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (method !== "getUpdates") calls.push({ method, params, at: Date.now() });
      let result: unknown = true;
      if (method === "getMe") result = { id: 5008, is_bot: true, first_name: "uji", username: "uji_album_bot" };
      else if (method === "getUpdates") {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        result = batch;
      } else if (method === "getFile") {
        const id = String(params.file_id);
        if (id === "pbad") return Response.json({ ok: false, error_code: 400, description: "Bad Request: invalid file_id" }, { status: 400 });
        result = { file_id: id, file_unique_id: `U${id}`, file_size: 10, file_path: `photos/${id}.jpg` };
      }
      return Response.json({ ok: true, result });
    },
  });
  cleanups.push(() => server.stop(true));
  return {
    apiRoot: `http://127.0.0.1:${server.port}`,
    push: (...u: unknown[]) => pending.push(...u),
    calls,
    count: (method: string) => calls.filter((c) => c.method === method).length,
  };
}

function msg(id: number, fields: Record<string, unknown>, from = OWNER) {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from, type: "private", first_name: "p" },
      from: { id: from, is_bot: false, first_name: "p", username: from === OWNER ? "pemilik" : "asing" },
      ...fields,
    },
  };
}
const photo = (fileId: string) => ({ photo: [{ file_id: `${fileId}s`, file_unique_id: `s${fileId}`, width: 90, height: 90 }, { file_id: fileId, file_unique_id: `U${fileId}`, width: 800, height: 800 }] });

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
      NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
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
  const send = (m: unknown) => {
    p.stdin!.write(JSON.stringify(m) + "\n");
    p.stdin!.flush();
  };
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "uji", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  // Waktu tiba tiap notifikasi di stdout, untuk mengukur jeda.
  const arrivals: number[] = [];
  const messages = () =>
    out.join("").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const notes = () => {
    const n = messages().filter((m: any) => m.method === "notifications/claude/channel").map((m: any) => m.params as { content: string; meta: Record<string, string> });
    while (arrivals.length < n.length) arrivals.push(Date.now());
    return n;
  };
  return { p, messages, notes, arrivals, stderr: () => err.join("") };
}

async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(10);
  }
}

async function setup() {
  const tg = fakeTelegram();
  const root = mkdtempSync(join(tmpdir(), "bot-squad-album-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const state = join(root, "state");
  Bun.spawnSync(["mkdir", "-p", state]);
  writeFileSync(join(state, "access.json"), JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} }));
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_album_bot"), "polling");
  return { tg, srv, state };
}

test.skipIf(!hasDeps)("album 3 foto tiba acak: satu pesan, urut album, kapsi berlabel, sekali typing dan reaksi", async () => {
  const { tg, srv, state } = await setup();
  const init = srv.messages().find((m: any) => m.id === 1) as any;
  expect(init.result.instructions).toContain("album_size");

  // Tiba tidak berurutan dan terpisah waktu (seperti beberapa getUpdates).
  tg.push(msg(503, { ...photo("p3"), media_group_id: "g1", caption: "ketiga" }));
  await Bun.sleep(400);
  tg.push(msg(501, { ...photo("p1"), media_group_id: "g1", caption: "pertama" }));
  await Bun.sleep(400);
  tg.push(msg(502, { ...photo("p2"), media_group_id: "g1" }));

  await waitFor(() => srv.notes().length >= 1, "notifikasi album");
  await Bun.sleep(2000); // tidak ada notifikasi susulan
  const n = srv.notes();
  expect(n.length).toBe(1);
  const a = n[0]!;
  expect(a.content).toBe("(album of 3 items)\nPhoto 1: pertama\nPhoto 2\nPhoto 3: ketiga");
  expect(a.meta).toMatchObject({ album_size: "3", album_message_ids: "501,502,503", message_id: "501", user: "pemilik", chat_id: String(OWNER) });
  expect(a.meta).not.toHaveProperty("album_failed");
  expect(readFileSync(a.meta.image_path_1!, "utf8")).toBe("foto p1");
  expect(readFileSync(a.meta.image_path_2!, "utf8")).toBe("foto p2");
  expect(readFileSync(a.meta.image_path_3!, "utf8")).toBe("foto p3");
  expect(a.meta.image_path).toBe(a.meta.image_path_1);
  // Unduhan foto terbesar saja, satu per foto.
  expect(tg.calls.filter((c) => c.method === "getFile").map((c) => c.params.file_id).sort()).toEqual(["p1", "p2", "p3"]);

  // Reaksi sekali, di item pertama album.
  const reactions = tg.calls.filter((c) => c.method === "setMessageReaction");
  expect(reactions.length).toBe(1);
  expect(reactions[0]!.params.message_id).toBe(501);
  expect(tg.count("sendChatAction")).toBeGreaterThanOrEqual(1);

  // plugin.log: satu baris per item, semua diteruskan, dengan album=.
  const log = readFileSync(join(state, "plugin.log"), "utf8").split("\n").filter((l) => l.includes(" pesan "));
  expect(log.length).toBe(3);
  for (const l of log) {
    expect(l).toContain("hasil=diteruskan");
    expect(l).toContain("album=g1");
  }
}, 30_000);

test.skipIf(!hasDeps)("album dengan foto gagal: foto lain sampai, Claude diberi tahu", async () => {
  const { tg, srv } = await setup();
  tg.push(
    msg(601, { ...photo("p1"), media_group_id: "g2", caption: "satu" }),
    msg(602, { ...photo("pfail"), media_group_id: "g2", caption: "dua" }),
    msg(603, { ...photo("pbad"), media_group_id: "g2" }),
    msg(604, { ...photo("p4"), media_group_id: "g2" }),
  );
  await waitFor(() => srv.notes().length >= 1, "notifikasi album");
  await Bun.sleep(1800);
  expect(srv.notes().length).toBe(1);
  const a = srv.notes()[0]!;
  expect(a.meta.album_failed).toBe("2,3");
  expect(a.meta).not.toHaveProperty("image_path_2");
  expect(a.meta).not.toHaveProperty("image_path_3");
  expect(readFileSync(a.meta.image_path_1!, "utf8")).toBe("foto p1");
  expect(readFileSync(a.meta.image_path_4!, "utf8")).toBe("foto p4");
  expect(a.content).toContain("Photo 2 (download failed): dua");
  expect(a.content).toContain("(photos 2, 3 could not be downloaded");
  expect(JSON.stringify(srv.messages())).not.toContain(TOKEN);
}, 30_000);

test.skipIf(!hasDeps)("foto tunggal dan teks tidak ditunda; format foto tunggal tidak berubah", async () => {
  const { tg, srv } = await setup();
  const t0 = Date.now();
  tg.push(msg(701, { ...photo("p7"), caption: "sendiri" }));
  await waitFor(() => srv.notes().length >= 1, "foto tunggal");
  const photoDelay = srv.arrivals[0]! - t0;
  const t1 = Date.now();
  tg.push(msg(702, { text: "halo" }));
  await waitFor(() => srv.notes().length >= 2, "teks");
  const textDelay = srv.arrivals[1]! - t1;
  // Jeda album 1,5 detik; tanpa penundaan keduanya jauh di bawahnya.
  expect(photoDelay).toBeLessThan(1000);
  expect(textDelay).toBeLessThan(1000);
  const [p, t] = srv.notes();
  expect(p!.content).toBe("sendiri");
  expect(readFileSync(p!.meta.image_path!, "utf8")).toBe("foto p7");
  expect(p!.meta).not.toHaveProperty("album_size");
  expect(t!.content).toBe("halo");
  expect(t!.meta).not.toHaveProperty("album_size");
}, 30_000);

test.skipIf(!hasDeps)("album campuran (foto + video) dan album dokumen: satu pesan masing-masing, lampiran bernomor", async () => {
  const { tg, srv } = await setup();
  tg.push(
    msg(801, { ...photo("p1"), media_group_id: "g3" }),
    msg(802, { video: { file_id: "vid", file_unique_id: "Uvid", width: 1, height: 1, duration: 1, file_size: 5000, mime_type: "video/mp4", file_name: "klip.mp4" }, media_group_id: "g3", caption: "videonya" }),
    msg(803, { video: { file_id: "bigvid", file_unique_id: "Ubig", width: 1, height: 1, duration: 1, file_size: 30 * MB, file_name: "../besar.mp4" }, media_group_id: "g3" }),
  );
  tg.push(
    msg(811, { document: { file_id: "d1", file_unique_id: "Ud1", file_name: "a.pdf", file_size: 10 }, media_group_id: "g4" }),
    msg(812, { document: { file_id: "d2", file_unique_id: "Ud2", file_name: "b[x].pdf", file_size: 10 }, media_group_id: "g4", caption: "dua dokumen" }),
  );
  await waitFor(() => srv.notes().length >= 2, "dua notifikasi album");
  await Bun.sleep(1800);
  expect(srv.notes().length).toBe(2);
  const mixed = srv.notes().find((x) => x.meta.album_message_ids === "801,802,803")!;
  const docs = srv.notes().find((x) => x.meta.album_message_ids === "811,812")!;

  expect(mixed.content.split("\n").slice(0, 4)).toEqual(["(album of 3 items)", "Photo 1", 'Video 2 "klip.mp4": videonya', 'Video 3 "besar.mp4"']);
  expect(mixed.content).toContain("20 MB");
  expect(readFileSync(mixed.meta.image_path_1!, "utf8")).toBe("foto p1");
  expect(mixed.meta).toMatchObject({ attachment_2_kind: "video", attachment_2_file_id: "vid", attachment_2_name: "klip.mp4", attachment_3_too_large: "true" });
  expect(mixed.meta).not.toHaveProperty("attachment_3_file_id");
  // Video tidak diunduh sendiri oleh plugin; hanya foto.
  expect(tg.calls.filter((c) => c.method === "getFile").map((c) => c.params.file_id)).toEqual(["p1"]);

  expect(docs.content).toBe('(album of 2 items)\nDocument 1 "a.pdf"\nDocument 2 "bx.pdf": dua dokumen');
  expect(docs.meta).toMatchObject({ attachment_1_file_id: "d1", attachment_2_file_id: "d2", attachment_2_name: "bx.pdf" });

  // Lampiran album bisa diunduh lewat download_attachment.
  const p = srv.p;
  p.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 50, method: "tools/call", params: { name: "download_attachment", arguments: { file_id: "bigvid" } } }) + "\n");
  p.stdin!.flush();
  await waitFor(() => srv.messages().some((m: any) => m.id === 50), "jawaban download_attachment");
  const r = (srv.messages().find((m: any) => m.id === 50) as any).result;
  expect(r.isError).toBe(true);
  expect(r.content[0].text).toContain("20 MB");
}, 30_000);

test.skipIf(!hasDeps)("album dari pengirim tak diizinkan dibuang tanpa diunduh", async () => {
  const { tg, srv, state } = await setup();
  tg.push(
    msg(901, { ...photo("p1"), media_group_id: "g5" }, STRANGER),
    msg(902, { ...photo("p2"), media_group_id: "g5" }, STRANGER),
  );
  await waitFor(() => {
    try { return readFileSync(join(state, "plugin.log"), "utf8").split("hasil=dibuang").length === 3; } catch { return false; }
  }, "dua baris dibuang");
  await Bun.sleep(2000);
  expect(srv.notes().length).toBe(0);
  expect(tg.count("getFile")).toBe(0);
  expect(tg.count("setMessageReaction")).toBe(0);
  expect(tg.count("sendChatAction")).toBe(0);
  expect(existsSync(join(state, "inbox"))).toBe(false);
}, 30_000);

test.skipIf(!hasDeps)("album yang masih ditahan saat plugin berhenti dibuang dan dicatat", async () => {
  const { tg, srv, state } = await setup();
  tg.push(msg(951, { ...photo("p1"), media_group_id: "g6" }), msg(952, { ...photo("p2"), media_group_id: "g6" }));
  await waitFor(() => tg.count("sendChatAction") >= 1, "item album diterima");
  srv.p.stdin!.end();
  await srv.p.exited;
  expect(srv.notes().length).toBe(0);
  expect(tg.count("getFile")).toBe(0);
  const log = readFileSync(join(state, "plugin.log"), "utf8").split("\n").filter((l) => l.includes(" pesan "));
  expect(log.length).toBe(2);
  for (const l of log) expect(l).toContain('hasil=gagal');
  expect(log[0]).toContain("plugin berhenti sebelum album diteruskan");
}, 30_000);
