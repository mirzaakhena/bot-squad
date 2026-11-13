import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261112230301: server plugin sungguhan (bun server.ts) dijalankan
 * terhadap Telegram tiruan di 127.0.0.1, dengan pipa stdio seperti Claude.
 * Token di sini palsu; tidak ada panggilan ke Telegram sungguhan.
 */

const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`plugin-log.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const TOKEN = "5003:AAFakeTokenForPluginLogTest_cccccccccccc";
const OWNER = 111222;
const STRANGER = 333444;
const SECRET_TEXT = "ISI-RAHASIA-JANGAN-DICATAT";

type Reply = { status?: number; body: unknown };
const ok = (result: unknown): Reply => ({ body: { ok: true, result } });
const fail = (status: number, description: string, parameters?: unknown): Reply => ({
  status,
  body: { ok: false, error_code: status, description, ...(parameters ? { parameters } : {}) },
});

/** Telegram tiruan kecil yang bisa dimatikan lalu dinyalakan lagi di port yang sama. */
function fakeTelegram() {
  let pending: unknown[] = [];
  const failures: Reply[] = [];
  const handler = async (req: Request) => {
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
    if (!m || decodeURIComponent(m[1]!) !== TOKEN) return Response.json(fail(404, "Not Found").body, { status: 404 });
    const method = m[2]!;
    let r: Reply;
    if (method === "getMe") r = ok({ id: 5003, is_bot: true, first_name: "uji", username: "uji_log_bot" });
    else if (method === "getUpdates") {
      const f = failures.shift();
      if (f) r = f;
      else {
        const batch = pending;
        pending = [];
        if (batch.length === 0) await Bun.sleep(20);
        r = ok(batch);
      }
    } else r = ok(true);
    return Response.json(r.body, { status: r.status ?? 200 });
  };
  // 127.0.0.1, bukan semua alamat: lihat komentar di master/test/fake-telegram.ts.
  let server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  const port = server.port;
  return {
    apiRoot: `http://127.0.0.1:${port}`,
    push: (u: unknown) => pending.push(u),
    failNext: (...r: Reply[]) => failures.push(...r),
    down: () => server.stop(true),
    up: () => (server = Bun.serve({ hostname: "127.0.0.1", port, fetch: handler })),
    stop: () => server.stop(true),
  };
}

let updateId = 1000;
const textUpdate = (from: number, text: string, date: number) => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date,
    chat: { id: from, type: "private", first_name: "u" },
    from: { id: from, is_bot: false, first_name: "u" },
    text,
  },
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) {
    try { c(); } catch {}
  }
});

function makeState() {
  const state = mkdtempSync(join(tmpdir(), "bot-squad-plugin-log-"));
  cleanups.push(() => rmSync(state, { recursive: true, force: true }));
  writeFileSync(
    join(state, "access.json"),
    JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} }),
  );
  return state;
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
      // Apa pun yang lolos ke luar akan mati di proxy ini.
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

const logOf = (state: string) => {
  try { return readFileSync(join(state, "plugin.log"), "utf8"); } catch { return ""; }
};
async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
    await Bun.sleep(50);
  }
}
const lines = (state: string, event: string) => logOf(state).split("\n").filter((l) => l.split(" ")[1] === event);
const field = (line: string, k: string) => new RegExp(` ${k}=("(?:[^"\\\\]|\\\\.)*"|\\S+)`).exec(line)?.[1];
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/;

test.skipIf(!hasDeps)("plugin.log merekam pesan masuk, gangguan getUpdates, mulai dan berhenti", async () => {
  const tg = fakeTelegram();
  cleanups.push(() => tg.stop());
  const state = makeState();
  // Sisa log dari proses sebelumnya yang hampir 1 MB, dengan izin longgar.
  writeFileSync(join(state, "plugin.log"), "lama ".repeat(199_998) + "\n", { mode: 0o644 });
  const srv = startServer(state, tg.apiRoot);

  await waitFor(() => lines(state, "polling-mulai").length === 1, "polling-mulai");
  expect(lines(state, "polling-mulai")[0]).toContain("bot=@uji_log_bot");
  expect(lines(state, "mulai")[0]).toContain(`pid=${srv.p.pid}`);
  // Diputar: isi lama pindah ke plugin.log.1, file baru 0600.
  expect(statSync(join(state, "plugin.log.1")).size).toBe(999_991);
  expect(statSync(join(state, "plugin.log")).mode & 0o777).toBe(0o600);

  // 1. Pesan dari pemilik, bertanggal 5 detik lalu: diteruskan ke Claude.
  const sentSec = Math.floor(Date.now() / 1000) - 5;
  const u1 = textUpdate(OWNER, SECRET_TEXT, sentSec);
  tg.push(u1);
  await waitFor(() => srv.stdout().includes("notifications/claude/channel\""), "notifikasi ke Claude");
  await waitFor(() => lines(state, "pesan").length === 1, "baris pesan");
  const l1 = lines(state, "pesan")[0]!;
  expect(field(l1, "hasil")).toBe("diteruskan");
  expect(field(l1, "chat")).toBe(String(OWNER));
  expect(field(l1, "msg")).toBe(String(u1.message.message_id));
  expect(field(l1, "jenis")).toBe("text");
  for (const k of ["tanggal", "diterima", "diteruskan"]) expect(field(l1, k)).toMatch(ISO);
  expect(new Date(field(l1, "tanggal")!).getTime()).toBe(sentSec * 1000);
  const telatTerima = parseFloat(field(l1, "telat_terima")!);
  const telatTeruskan = parseFloat(field(l1, "telat_teruskan")!);
  const total = parseFloat(field(l1, "total")!);
  expect(telatTerima).toBeGreaterThanOrEqual(4.9);
  expect(telatTerima).toBeLessThan(10);
  expect(telatTeruskan).toBeGreaterThanOrEqual(0);
  expect(telatTeruskan).toBeLessThan(1);
  expect(Math.abs(total - (telatTerima + telatTeruskan))).toBeLessThan(0.0015);
  expect(new Date(field(l1, "diteruskan")!).getTime()).toBeGreaterThanOrEqual(new Date(field(l1, "diterima")!).getTime());

  // 2. Pesan dari orang asing: dibuang, tetap tercatat satu baris.
  tg.push(textUpdate(STRANGER, SECRET_TEXT, Math.floor(Date.now() / 1000)));
  await waitFor(() => lines(state, "pesan").length === 2, "baris pesan dibuang");
  const l2 = lines(state, "pesan")[1]!;
  expect(field(l2, "hasil")).toBe("dibuang");
  expect(field(l2, "diteruskan")).toBe("-");
  expect(field(l2, "total")).toBe("-");

  // 3. Perintah plugin (/start) tidak diteruskan, tetap satu baris.
  const cmd = textUpdate(OWNER, "/start", Math.floor(Date.now() / 1000));
  Object.assign(cmd.message, { entities: [{ type: "bot_command", offset: 0, length: 6 }] });
  tg.push(cmd);
  await waitFor(() => lines(state, "pesan").length === 3, "baris /start");
  expect(field(lines(state, "pesan")[2]!, "hasil")).toBe("tidak-diteruskan");

  // 4. Percobaan ulang internal grammY: 500 lalu 429 (retry_after 1).
  tg.failNext(fail(500, "Internal Server Error"), fail(429, "Too Many Requests: retry after 1", { retry_after: 1 }));
  await waitFor(() => lines(state, "getUpdates-pulih").length === 1, "pulih setelah 500/429", 20_000);
  const g = lines(state, "getUpdates-gagal");
  expect(g.length).toBe(2);
  expect(field(g[0]!, "ke")).toBe("1");
  expect(field(g[0]!, "ulang")).toBe("3s");
  expect(field(g[0]!, "alasan")).toContain("500: Internal Server Error");
  expect(field(g[1]!, "ke")).toBe("2");
  expect(field(g[1]!, "ulang")).toBe("1s");
  const p1 = lines(state, "getUpdates-pulih")[0]!;
  expect(field(p1, "gagal")).toBe("2");
  expect(field(p1, "sejak")).toMatch(ISO);
  expect(parseFloat(field(p1, "lama")!)).toBeGreaterThanOrEqual(3.9);

  // 5. Jaringan putus (koneksi ditolak) lalu pulih.
  tg.down();
  await waitFor(() => lines(state, "getUpdates-gagal").length >= 3, "gagal jaringan");
  const net = lines(state, "getUpdates-gagal")[2]!;
  expect(field(net, "alasan")).toContain("HttpError: Network request for 'getUpdates' failed!");
  expect(field(net, "ulang")).toBe("3s");
  tg.up();
  await waitFor(() => lines(state, "getUpdates-pulih").length === 2, "pulih setelah jaringan", 20_000);

  // 6. 409: grammY melempar ke loop plugin; dua-duanya tercatat, lalu polling mulai lagi.
  tg.failNext(fail(409, "Conflict: terminated by other getUpdates request"));
  await waitFor(() => lines(state, "polling-mulai").length === 2, "polling mulai lagi setelah 409", 20_000);
  const c409 = lines(state, "getUpdates-gagal").at(-1)!;
  expect(field(c409, "ulang")).toBe("oleh-plugin");
  expect(field(c409, "alasan")).toContain("409");
  const pg = lines(state, "polling-gagal")[0]!;
  // onStart mengatur attempt = 0 (warisan upstream), jadi ulang pertama langsung.
  expect(field(pg, "ulang")).toBe("0s");
  expect(field(pg, "alasan")).toContain("GrammyError");

  // 7. Pesan setelah gangguan tetap diteruskan.
  tg.push(textUpdate(OWNER, SECRET_TEXT, Math.floor(Date.now() / 1000)));
  await waitFor(() => lines(state, "pesan").length === 4, "pesan setelah gangguan");
  expect(field(lines(state, "pesan")[3]!, "hasil")).toBe("diteruskan");

  // 8. Claude menutup pipa: berhenti tercatat dengan waktu.
  srv.p.stdin!.end();
  await srv.p.exited;
  await waitFor(() => lines(state, "berhenti").length === 1, "berhenti");
  expect(field(lines(state, "berhenti")[0]!, "alasan")).toMatch(/^stdin-(end|close|tertutup)$/);
  expect(lines(state, "polling-berhenti").length).toBe(1);

  const log = logOf(state);
  for (const l of log.trimEnd().split("\n")) expect(l.slice(0, l.indexOf(" "))).toMatch(ISO);
  expect(log).not.toContain(SECRET_TEXT);
  expect(log).not.toContain("/start");
  expect(log).not.toContain(TOKEN);
  expect(log).not.toContain(TOKEN.split(":")[1]!);
  expect(statSync(join(state, "plugin.log")).mode & 0o777).toBe(0o600);
}, 90_000);

test.skipIf(!hasDeps)("log yang tidak bisa ditulis tidak menghambat penerusan pesan", async () => {
  const tg = fakeTelegram();
  cleanups.push(() => tg.stop());
  const state = makeState();
  mkdirSync(join(state, "plugin.log")); // menulis ke sini selalu gagal (EISDIR)
  const srv = startServer(state, tg.apiRoot);
  await waitFor(() => srv.stderr().includes("polling as @uji_log_bot"), "polling");
  expect(srv.stderr()).toContain("cannot write plugin.log");
  tg.failNext(fail(500, "Internal Server Error"));
  tg.push(textUpdate(OWNER, "halo", Math.floor(Date.now() / 1000)));
  await waitFor(() => srv.stdout().includes("notifications/claude/channel\""), "notifikasi ke Claude", 20_000);
  expect(srv.stdout()).toContain("halo");
  expect(srv.p.exitCode).toBeNull();
  expect(srv.stderr().match(/cannot write plugin\.log/g)!.length).toBe(1);
}, 30_000);

test.skipIf(!hasDeps)("alamat Telegram tiruan di luar mesin lokal ditolak tanpa mencetak token", async () => {
  for (const bad of ["http://example.com:8081", "http://localhost.evil.com", "http://localhost@evil.com", "ftp://127.0.0.1", "bukan url"]) {
    const state = makeState();
    const srv = startServer(state, bad);
    expect(await srv.p.exited).toBe(1);
    await Bun.sleep(50);
    expect(srv.stderr()).toContain("must point to localhost");
    expect(srv.stderr()).not.toContain(TOKEN);
    expect(lines(state, "berhenti")[0]).toContain("bukan alamat lokal");
    expect(logOf(state)).not.toContain(TOKEN);
  }
}, 30_000);
