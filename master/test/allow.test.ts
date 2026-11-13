import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Update } from "grammy/types";
import { COMMANDS, createMasterBot, helpText } from "../src/bot.ts";
import { accessPath, changeAccess, isUserId, readAccess } from "../src/allow.ts";
import { listReport } from "../src/list.ts";
import { registryPath } from "../src/registry.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm, STRANGER } from "./updates.ts";

/**
 * Tiket 261112225307: /allow, /revoke, /access, dan jumlah akses di /list.
 * Token palsu; folder data sementara.
 */
const MASTER = "123456789:AAFakeMasterTokenForAllowCommand_abcd";
const FRIEND = 777888999;

let home: string;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-allow-"));
  logs = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const rec = (username: string, status = "active") => ({ telegramId: 1, username, status, createdAt: "2026-11-13T00:00:00Z" });
function writeReg(bots: Record<string, unknown>) {
  writeFileSync(registryPath(home), JSON.stringify({ bots }, null, 2));
}
/** Folder bot dengan access.json seperti hasil /register, ditambah kolom lain yang harus dipertahankan. */
function botFolder(name: string, access: unknown = { dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {}, ackReaction: "👀" }) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true });
  if (access !== null) writeFileSync(join(state, "access.json"), typeof access === "string" ? access : JSON.stringify(access, null, 2) + "\n", { mode: 0o600 });
}
const accessOf = (name: string) => JSON.parse(readFileSync(accessPath(home, name), "utf8"));
const rawAccess = (name: string) => readFileSync(accessPath(home, name), "utf8");

describe("isUserId", () => {
  const good = ["1", "777888999", "9007199254740991"];
  const bad = ["0", "-5", "01", "1.5", "abc", "12a", "", "9007199254740993", "99999999999999999", "+5", " 5"];
  for (const s of good) test(`sah: ${s}`, () => expect(isUserId(s)).toBe(true));
  for (const s of bad) test(`ditolak: ${JSON.stringify(s)}`, () => expect(isUserId(s)).toBe(false));
});

describe("changeAccess", () => {
  test("allow menambah ID sebagai teks, kolom lain dipertahankan, mode 0600, tanpa berkas sementara tersisa", async () => {
    botFolder("bot-01", { dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: { "-100": { requireMention: true, allowFrom: [] } }, pending: {}, ackReaction: "👀", textChunkLimit: 1000 });
    const res = await changeAccess(home, "bot-01", String(FRIEND), "allow", OWNER);
    expect(res.kind).toBe("added");
    expect(accessOf("bot-01")).toEqual({
      dmPolicy: "allowlist",
      allowFrom: [String(OWNER), String(FRIEND)],
      groups: { "-100": { requireMention: true, allowFrom: [] } },
      pending: {},
      ackReaction: "👀",
      textChunkLimit: 1000,
    });
    expect(statSync(accessPath(home, "bot-01")).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(home, "bots", "bot-01", "state"))).toEqual(["access.json"]);
  });

  test("revoke menghapus ID; ID lain dan kolom lain tetap", async () => {
    botFolder("bot-01", { dmPolicy: "allowlist", allowFrom: [String(OWNER), String(FRIEND), "555"], groups: {}, pending: {} });
    expect((await changeAccess(home, "bot-01", String(FRIEND), "revoke", OWNER)).kind).toBe("removed");
    expect(accessOf("bot-01").allowFrom).toEqual([String(OWNER), "555"]);
  });

  test("pemilik tidak bisa dicabut: berkas tidak disentuh", async () => {
    botFolder("bot-01");
    const before = rawAccess("bot-01");
    const mtime = statSync(accessPath(home, "bot-01")).mtimeMs;
    expect((await changeAccess(home, "bot-01", String(OWNER), "revoke", OWNER)).kind).toBe("owner");
    expect(rawAccess("bot-01")).toBe(before);
    expect(statSync(accessPath(home, "bot-01")).mtimeMs).toBe(mtime);
  });

  test("allow ID yang sudah ada dan revoke ID yang tidak ada: tidak menulis", async () => {
    botFolder("bot-01", { dmPolicy: "allowlist", allowFrom: [String(OWNER), String(FRIEND)] });
    const before = rawAccess("bot-01");
    expect((await changeAccess(home, "bot-01", String(FRIEND), "allow", OWNER)).kind).toBe("already");
    expect((await changeAccess(home, "bot-01", "555", "revoke", OWNER)).kind).toBe("absent");
    expect(rawAccess("bot-01")).toBe(before);
  });

  const broken: Array<[string, string, string]> = [
    ["bukan JSON", "{rusak", "bukan JSON yang sah"],
    ["array", "[]", "bukan objek JSON"],
    ["null", "null", "bukan objek JSON"],
    ["allowFrom bukan array", JSON.stringify({ allowFrom: "111" }), "allowFrom bukan daftar teks"],
    ["allowFrom berisi angka", JSON.stringify({ allowFrom: [111] }), "allowFrom bukan daftar teks"],
  ];
  for (const [label, content, reason] of broken) {
    for (const op of ["allow", "revoke"] as const) {
      test(`${op} pada access.json rusak (${label}): ditolak, berkas tidak ditimpa`, async () => {
        botFolder("bot-01", content);
        const res = await changeAccess(home, "bot-01", "555", op, OWNER);
        expect(res.kind).toBe("error");
        expect(res.kind === "error" && res.reason).toContain(reason);
        expect(rawAccess("bot-01")).toBe(content);
      });
    }
  }

  test("access.json tidak ada: ditolak, tidak dibuat", async () => {
    botFolder("bot-01", null);
    const res = await changeAccess(home, "bot-01", "555", "allow", OWNER);
    expect(res.kind).toBe("error");
    expect(existsSync(accessPath(home, "bot-01"))).toBe(false);
  });

  test("gagal di tengah penulisan (sebelum rename): berkas lama utuh, berkas sementara dihapus", async () => {
    botFolder("bot-01");
    const before = rawAccess("bot-01");
    let tmpSeen = "";
    const res = await changeAccess(home, "bot-01", "555", "allow", OWNER, {
      beforeRename: (tmp) => {
        tmpSeen = tmp;
        expect(JSON.parse(readFileSync(tmp, "utf8")).allowFrom).toContain("555");
        throw new Error("disk penuh");
      },
    }).catch((e) => ({ kind: "thrown", e }));
    expect(tmpSeen).not.toBe("");
    expect(existsSync(tmpSeen)).toBe(false);
    expect(rawAccess("bot-01")).toBe(before);
    expect(res.kind).toBe("error");
  });

  test("allow bersamaan untuk banyak ID: tidak ada yang hilang", async () => {
    botFolder("bot-01");
    await Promise.all(["1", "2", "3", "4", "5"].map((id) => changeAccess(home, "bot-01", id, "allow", OWNER)));
    expect([...accessOf("bot-01").allowFrom].sort()).toEqual([String(OWNER), "1", "2", "3", "4", "5"].sort());
  });
});

describe("/allow, /revoke, /access lewat master-bot", () => {
  let tg: ReturnType<typeof startFakeTelegram>;
  beforeEach(() => (tg = startFakeTelegram(MASTER)));
  afterEach(() => tg.stop());

  const makeBot = () => {
    let touched = 0;
    const bot = createMasterBot({
      token: MASTER,
      ownerId: OWNER,
      log: (m) => logs.push(m),
      client: { apiRoot: tg.apiRoot },
      botInfo: ME,
      dataDir: home,
      launch: async () => {
        touched++;
        return { kind: "active", pid: 1 };
      },
      stop: async () => {
        touched++;
        return { wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [] };
      },
      probe: { tmux: { hasSession: async () => false }, isAlive: () => false },
    });
    return { bot, touched: () => touched };
  };
  const replies = () => tg.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
  const last = () => replies().at(-1)!;
  const say = async (bot: ReturnType<typeof makeBot>["bot"], text: string) => {
    await bot.handleUpdate(ownerDm(text));
    return last();
  };

  beforeEach(() => {
    writeReg({ "bot-01": rec("satu_bot"), "bot-02": rec("dua_bot"), "bot-stop": rec("stop_bot", "stopped") });
    botFolder("bot-01");
    botFolder("bot-02");
    botFolder("bot-stop");
  });

  test("/allow: hanya access.json bot itu yang berubah; peringatan Q2 ada di balasan; tidak ada yang dinyalakan", async () => {
    const { bot, touched } = makeBot();
    const other = rawAccess("bot-02");
    const reg = readFileSync(registryPath(home), "utf8");
    const text = await say(bot, `/allow bot-01 ${FRIEND}`);
    expect(accessOf("bot-01").allowFrom).toEqual([String(OWNER), String(FRIEND)]);
    expect(accessOf("bot-01").ackReaction).toBe("👀");
    expect(accessOf("bot-01").dmPolicy).toBe("allowlist");
    expect(rawAccess("bot-02")).toBe(other);
    expect(readFileSync(registryPath(home), "utf8")).toBe(reg);
    expect(touched()).toBe(0);

    expect(text).toContain(`Akses diberikan: ${FRIEND} sekarang bisa mengobrol dengan @satu_bot ('bot-01')`);
    expect(text).toContain("Bot lain dan master-bot tetap menolaknya");
    expect(text).toContain("menjalankan perintah apa pun di server");
    expect(text).toContain("/context (menampilkan kuota akun Claude pemilik)");
    expect(text).toContain("/status");
    expect(text).toContain("sama dengan pemilik");
    expect(text).toContain(`/revoke bot-01 ${FRIEND}`);
    expect(logs.join("\n")).toContain(`/allow 'bot-01': akses ditambahkan untuk ${FRIEND}`);
  });

  test("/allow untuk bot berstatus stopped juga berlaku (A2)", async () => {
    const { bot } = makeBot();
    await say(bot, `/allow bot-stop ${FRIEND}`);
    expect(accessOf("bot-stop").allowFrom).toContain(String(FRIEND));
  });

  test("/allow ID yang sudah ada: dijawab, berkas tidak berubah", async () => {
    const { bot } = makeBot();
    await say(bot, `/allow bot-01 ${FRIEND}`);
    const before = rawAccess("bot-01");
    expect(await say(bot, `/allow bot-01 ${FRIEND}`)).toContain("sudah punya akses");
    expect(await say(bot, `/allow bot-01 ${OWNER}`)).toContain("sudah punya akses");
    expect(rawAccess("bot-01")).toBe(before);
  });

  test("/revoke mencabut; /revoke lagi dijawab 'memang tidak punya akses'", async () => {
    const { bot } = makeBot();
    await say(bot, `/allow bot-01 ${FRIEND}`);
    expect(await say(bot, `/revoke bot-01 ${FRIEND}`)).toBe(`Akses dicabut: pesan ${FRIEND} ke @satu_bot ('bot-01') mulai sekarang diabaikan.`);
    expect(accessOf("bot-01").allowFrom).toEqual([String(OWNER)]);
    const before = rawAccess("bot-01");
    expect(await say(bot, `/revoke bot-01 ${FRIEND}`)).toContain("memang tidak punya akses");
    expect(rawAccess("bot-01")).toBe(before);
  });

  test("/revoke pemilik ditolak di setiap bot, berkas tidak disentuh", async () => {
    const { bot } = makeBot();
    for (const name of ["bot-01", "bot-02", "bot-stop"]) {
      const before = rawAccess(name);
      const text = await say(bot, `/revoke ${name} ${OWNER}`);
      expect(text).toContain("Pemilik tidak bisa mencabut aksesnya sendiri");
      expect(rawAccess(name)).toBe(before);
      expect(accessOf(name).allowFrom).toContain(String(OWNER));
    }
  });

  const badArgs = ["", "bot-01", `bot-01 ${FRIEND} lagi`, "Bot-01 5", "-bot 5", "bot-01 abc", "bot-01 -5", "bot-01 0", "bot-01 05", "bot-01 1.5", "../x 5"];
  for (const cmd of ["allow", "revoke"]) {
    for (const args of badArgs) {
      test(`/${cmd} ${JSON.stringify(args)}: cara pakai, tidak ada yang berubah`, async () => {
        const { bot } = makeBot();
        const before = rawAccess("bot-01");
        expect(await say(bot, `/${cmd} ${args}`.trim())).toStartWith(`Cara pakai: /${cmd} <nama> <user_id>`);
        expect(rawAccess("bot-01")).toBe(before);
      });
    }
    test(`/${cmd} untuk bot tidak terdaftar (walau foldernya ada): ditolak, berkas tidak disentuh`, async () => {
      const { bot } = makeBot();
      botFolder("liar");
      const before = rawAccess("liar");
      expect(await say(bot, `/${cmd} liar ${FRIEND}`)).toBe("Bot 'liar' tidak terdaftar. Tidak ada yang diubah.");
      expect(rawAccess("liar")).toBe(before);
    });
    test(`/${cmd} dengan access.json rusak: alasan dijelaskan, berkas tidak ditimpa`, async () => {
      const { bot } = makeBot();
      writeFileSync(accessPath(home, "bot-01"), "{rusak");
      expect(await say(bot, `/${cmd} bot-01 ${FRIEND}`)).toBe("access.json 'bot-01' rusak (bukan JSON yang sah). Tidak ada yang diubah.");
      expect(rawAccess("bot-01")).toBe("{rusak");
    });
    test(`/${cmd} dengan registry rusak: ditolak`, async () => {
      const { bot } = makeBot();
      writeFileSync(registryPath(home), "{rusak");
      const before = rawAccess("bot-01");
      expect(await say(bot, `/${cmd} bot-01 ${FRIEND}`)).toContain("registry.json rusak");
      expect(rawAccess("bot-01")).toBe(before);
    });
  }

  test("/allow pada bot dengan dmPolicy selain allowlist: dmPolicy tidak diubah, pemilik diberi catatan", async () => {
    const { bot } = makeBot();
    botFolder("bot-02", { dmPolicy: "pairing", allowFrom: [String(OWNER)], groups: {}, pending: {} });
    const text = await say(bot, `/allow bot-02 ${FRIEND}`);
    expect(accessOf("bot-02").dmPolicy).toBe("pairing");
    expect(text).toContain("dmPolicy bot ini \"pairing\"");
  });

  test("/access: daftar user_id, pemilik ditandai; hanya membaca", async () => {
    const { bot } = makeBot();
    await say(bot, `/allow bot-01 ${FRIEND}`);
    await say(bot, "/allow bot-01 555");
    const before = rawAccess("bot-01");
    const mtime = statSync(accessPath(home, "bot-01")).mtimeMs;
    const text = await say(bot, "/access bot-01");
    expect(text).toBe(
      [
        "Akses ke @satu_bot ('bot-01'): 3 orang",
        `• ${OWNER} (pemilik)`,
        `• ${FRIEND}`,
        "• 555",
        "Tambah dengan /allow bot-01 <user_id>, cabut dengan /revoke bot-01 <user_id>.",
      ].join("\n"),
    );
    expect(rawAccess("bot-01")).toBe(before);
    expect(statSync(accessPath(home, "bot-01")).mtimeMs).toBe(mtime);
    expect(await say(bot, "/access bot-02")).toStartWith(`Akses ke @dua_bot ('bot-02'): 1 orang\n• ${OWNER} (pemilik)\n`);
  });

  test("/access: cara pakai, tidak terdaftar, access.json rusak atau tidak ada", async () => {
    const { bot } = makeBot();
    expect(await say(bot, "/access")).toStartWith("Cara pakai: /access <nama>");
    expect(await say(bot, "/access bot-01 bot-02")).toStartWith("Cara pakai: /access <nama>");
    expect(await say(bot, "/access liar")).toBe("Bot 'liar' tidak terdaftar.");
    writeFileSync(accessPath(home, "bot-01"), JSON.stringify({ allowFrom: [1] }));
    expect(await say(bot, "/access bot-01")).toBe("access.json 'bot-01' rusak (allowFrom bukan daftar teks).");
    rmSync(accessPath(home, "bot-02"));
    expect(await say(bot, "/access bot-02")).toContain("access.json 'bot-02' belum ada");
  });

  test("/list menampilkan jumlah orang yang punya akses per bot (Q1)", async () => {
    const { bot } = makeBot();
    await say(bot, `/allow bot-01 ${FRIEND}`);
    writeFileSync(accessPath(home, "bot-stop"), "{rusak");
    const text = await say(bot, "/list");
    const block = (name: string) => text.split(/\n(?=[•⚠])|\n\n/).find((b) => b.includes(`<b>${name}</b>`))!;
    expect(block("bot-01")).toContain("akses: 2 orang");
    expect(block("bot-02")).toContain("akses: 1 orang");
    expect(block("bot-stop")).toContain("akses: tidak bisa dibaca (lihat /access bot-stop)");
    // /list tetap hanya membaca.
    expect(rawAccess("bot-stop")).toBe("{rusak");
  });

  test("listReport: baris akses ada untuk setiap bot terdaftar", async () => {
    const text = await listReport({ dataDir: home, tmux: { hasSession: async () => false }, isAlive: () => false, log: () => {} });
    expect(text.match(/akses: 1 orang/g)).toHaveLength(3);
  });

  test("orang yang diizinkan tetap ditolak master-bot (semua perintah, tanpa balasan)", async () => {
    const { bot } = makeBot();
    await say(bot, `/allow bot-01 ${FRIEND}`);
    const sentBefore = replies().length;
    let id = 900000;
    const fromFriend = (text: string): Update => ({
      update_id: ++id,
      message: {
        message_id: id,
        date: 0,
        chat: { id: FRIEND, type: "private", first_name: "f" },
        from: { id: FRIEND, is_bot: false, first_name: "f" },
        text,
        entities: text.startsWith("/") ? [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] : undefined,
      },
    });
    for (const t of ["/start", "/list", "/access bot-01", `/allow bot-02 ${FRIEND}`, `/revoke bot-01 ${OWNER}`, "halo"]) {
      await bot.handleUpdate(fromFriend(t));
    }
    expect(replies().length).toBe(sentBefore);
    expect(accessOf("bot-02").allowFrom).toEqual([String(OWNER)]);
    expect(accessOf("bot-01").allowFrom).toContain(String(OWNER));
    expect(logs.filter((l) => l === `update diabaikan dari ${FRIEND}`)).toHaveLength(6);
  });

  test("akun lain tidak bisa memakai /allow, /revoke, /access", async () => {
    const { bot } = makeBot();
    const before = rawAccess("bot-01");
    const u = (text: string): Update => ({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1,
        date: 0,
        chat: { id: STRANGER, type: "private", first_name: "s" },
        from: { id: STRANGER, is_bot: false, first_name: "s" },
        text,
        entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
      },
    });
    await bot.handleUpdate(u(`/allow bot-01 ${STRANGER}`));
    await bot.handleUpdate(u(`/revoke bot-01 ${OWNER}`));
    await bot.handleUpdate(u("/access bot-01"));
    expect(replies()).toEqual([]);
    expect(rawAccess("bot-01")).toBe(before);
  });

  test("menu dan /help memuat allow, revoke, access", async () => {
    const names = COMMANDS.map((c) => c.command);
    expect(names).toEqual(expect.arrayContaining(["allow", "revoke", "access"]));
    expect(helpText()).toContain("/allow - ");
    expect(helpText()).toContain("/revoke - ");
    expect(helpText()).toContain("/access - ");
  });
});

/**
 * Bukti dari ujung ke ujung: access.json yang ditulis /allow dan /revoke
 * dibaca oleh server plugin sungguhan (bun server.ts) dua bot, terhadap
 * Telegram tiruan. Dilewati kalau plugin/node_modules belum dipasang.
 */
const PLUGIN = resolve(import.meta.dir, "..", "..", "plugin");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "grammy"));
if (!hasDeps) console.warn(`allow.test: uji server plugin dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

describe("server plugin sungguhan mengikuti /allow dan /revoke", () => {
  const TOKENS: Record<string, string> = {
    "bot-01": "5101:AAFakeTokenForAllowE2eBotOne_aaaaaaaaaaa",
    "bot-02": "5102:AAFakeTokenForAllowE2eBotTwo_bbbbbbbbbbb",
  };
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch {}
    }
  });

  /** Satu Telegram tiruan untuk beberapa token bot: antrean update per token. */
  function botTelegram() {
    const queues = new Map<string, unknown[]>(Object.values(TOKENS).map((t) => [t, []]));
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const m = /^\/bot([^/]+)\/(\w+)$/.exec(new URL(req.url).pathname);
        const token = m ? decodeURIComponent(m[1]!) : "";
        if (!m || !queues.has(token)) return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
        const method = m[2]!;
        const id = Number(token.split(":")[0]);
        let result: unknown = true;
        if (method === "getMe") result = { id, is_bot: true, first_name: "uji", username: `uji_${id}_bot` };
        else if (method === "getUpdates") {
          const batch = queues.get(token)!.splice(0);
          if (batch.length === 0) await Bun.sleep(20);
          result = batch;
        } else if (method === "sendMessage") result = { message_id: 1, date: 0, chat: { id: 1, type: "private" } };
        return Response.json({ ok: true, result });
      },
    });
    cleanups.push(() => server.stop(true));
    return { apiRoot: `http://127.0.0.1:${server.port}`, push: (name: string, u: unknown) => queues.get(TOKENS[name]!)!.push(u) };
  }

  function startPlugin(name: string, apiRoot: string) {
    const state = join(home, "bots", name, "state");
    const p = Bun.spawn(["bun", "server.ts"], {
      cwd: PLUGIN,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        TELEGRAM_STATE_DIR: state,
        TELEGRAM_BOT_TOKEN: TOKENS[name]!,
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
    /** Pengirim pesan yang sampai ke Claude (notifikasi channel), urut. */
    const delivered = () =>
      out
        .join("")
        .split("\n")
        .filter((l) => l.includes('"notifications/claude/channel"'))
        .map((l) => String(JSON.parse(l).params?.meta?.user_id ?? JSON.parse(l).params?.meta?.chat_id));
    const results = () => {
      try {
        return readFileSync(join(state, "plugin.log"), "utf8")
          .split("\n")
          .filter((l) => l.split(" ")[1] === "pesan")
          .map((l) => `${/chat=(\S+)/.exec(l)?.[1]} ${/hasil=(\S+)/.exec(l)?.[1]}`);
      } catch {
        return [];
      }
    };
    return { stderr: () => err.join(""), delivered, results };
  }

  let msgId = 7000;
  const textFrom = (from: number, text: string) => {
    ++msgId;
    return {
      update_id: msgId,
      message: {
        message_id: msgId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: from, type: "private", first_name: "u" },
        from: { id: from, is_bot: false, first_name: "u" },
        text,
      },
    };
  };
  async function waitFor(cond: () => boolean, what: string, ms = 15_000) {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error(`tidak terjadi dalam ${ms} ms: ${what}`);
      await Bun.sleep(50);
    }
  }

  test.skipIf(!hasDeps)("diizinkan: bisa mengobrol dengan bot itu saja; dicabut: pesannya diabaikan; pemilik tetap", async () => {
    writeReg({ "bot-01": rec("uji_5101_bot"), "bot-02": rec("uji_5102_bot") });
    for (const name of ["bot-01", "bot-02"]) botFolder(name, { dmPolicy: "allowlist", allowFrom: [String(OWNER)], groups: {}, pending: {} });
    const master = startFakeTelegram(MASTER);
    cleanups.push(() => master.stop());
    const mb = createMasterBot({
      token: MASTER,
      ownerId: OWNER,
      log: (m) => logs.push(m),
      client: { apiRoot: master.apiRoot },
      botInfo: ME,
      dataDir: home,
      launch: async () => ({ kind: "active", pid: 1 }),
      stop: async () => ({ wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [] }),
    });

    const tg = botTelegram();
    const one = startPlugin("bot-01", tg.apiRoot);
    const two = startPlugin("bot-02", tg.apiRoot);
    await waitFor(() => one.stderr().includes("polling as @uji_5101_bot") && two.stderr().includes("polling as @uji_5102_bot"), "polling");

    // Sebelum /allow: teman dibuang kedua bot.
    tg.push("bot-01", textFrom(FRIEND, "halo"));
    await waitFor(() => one.results().length === 1, "pesan pertama bot-01");
    expect(one.results()).toEqual([`${FRIEND} dibuang`]);

    // /allow bot-01 saja; tanpa restart server plugin.
    await mb.handleUpdate(ownerDm(`/allow bot-01 ${FRIEND}`));
    tg.push("bot-01", textFrom(FRIEND, "halo lagi"));
    tg.push("bot-02", textFrom(FRIEND, "halo dua"));
    tg.push("bot-02", textFrom(OWNER, "pemilik di dua"));
    await waitFor(() => one.results().length === 2 && two.results().length === 2, "pesan setelah /allow");
    expect(one.results()[1]).toBe(`${FRIEND} diteruskan`);
    expect(two.results()).toEqual([`${FRIEND} dibuang`, `${OWNER} diteruskan`]);
    await waitFor(() => one.delivered().length === 1, "notifikasi ke Claude bot-01");
    expect(one.delivered()).toEqual([String(FRIEND)]);
    expect(two.delivered()).toEqual([String(OWNER)]);

    // /revoke: pesan teman setelahnya diabaikan, pemilik tetap diteruskan.
    await mb.handleUpdate(ownerDm(`/revoke bot-01 ${FRIEND}`));
    tg.push("bot-01", textFrom(FRIEND, "masih bisa?"));
    tg.push("bot-01", textFrom(OWNER, "pemilik"));
    await waitFor(() => one.results().length === 4, "pesan setelah /revoke");
    expect(one.results().slice(2)).toEqual([`${FRIEND} dibuang`, `${OWNER} diteruskan`]);
    await waitFor(() => one.delivered().length === 2, "notifikasi pemilik bot-01");
    await Bun.sleep(300);
    expect(one.delivered()).toEqual([String(FRIEND), String(OWNER)]);

    // /revoke pemilik ditolak, pemilik tetap bisa mengobrol.
    await mb.handleUpdate(ownerDm(`/revoke bot-01 ${OWNER}`));
    tg.push("bot-01", textFrom(OWNER, "masih saya"));
    await waitFor(() => one.results().length === 5, "pesan pemilik setelah /revoke pemilik");
    expect(one.results()[4]).toBe(`${OWNER} diteruskan`);
    // Tidak ada access.json yang dipindahkan plugin sebagai rusak.
    for (const name of ["bot-01", "bot-02"]) {
      expect(readdirSync(join(home, "bots", name, "state")).filter((f) => f.includes("corrupt") || f.includes(".tmp"))).toEqual([]);
    }
  }, 60_000);
});
