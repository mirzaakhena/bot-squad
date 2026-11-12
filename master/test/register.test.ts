import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMasterBot } from "../src/bot.ts";
import { checkToken, registerBot } from "../src/register.ts";
import { readRegistry, writeRegistry, type Registry } from "../src/registry.ts";
import type { WriteHooks } from "../src/registry.ts";
import { fail, ME, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Semua token di sini palsu; tidak ada token asli yang dipakai.
const MASTER = "123456789:AAFakeMasterTokenForRegisterTests_abc";
const GOOD = "5001:AAGoodFakeTokenForRegister_aaaaaaaaaa";
const GOOD_REVOKED = "5001:AANewTokenAfterRevokeSameBot_bbbbbbbb";
const GOOD2 = "5002:AASecondFakeTokenForRegister_cccccccc";
const GOOD3 = "5003:AAThirdFakeTokenForRegister_dddddddddd";
const BAD401 = "6001:AATokenRejected401_eeeeeeeeeeeeeeeeeee";
const BAD404 = "6002:AATokenRejected404_fffffffffffffffffff";
const ERR500 = "6003:AATelegramDown500_ggggggggggggggggggg";
const ERR429 = "6004:AATelegramRateLimited_hhhhhhhhhhhhhhh";
const SLOW = "6005:AATelegramTooSlow_iiiiiiiiiiiiiiiiiiii";
const MASTER_OTHER = "999000:AAOtherTokenOfMasterBot_jjjjjjjjjjjjjj";
const ALL_TOKENS = [MASTER, GOOD, GOOD_REVOKED, GOOD2, GOOD3, BAD401, BAD404, ERR500, ERR429, SLOW, MASTER_OTHER];

const botMe = (id: number, username: string) => ok({ id, is_bot: true, first_name: username, username });
const OTHER_BOTS = {
  [GOOD]: () => botMe(5001, "uji_satu_bot"),
  [GOOD_REVOKED]: () => botMe(5001, "uji_satu_bot"),
  [GOOD2]: () => botMe(5002, "uji_dua_bot"),
  [GOOD3]: () => botMe(5003, "uji_tiga_bot"),
  [BAD401]: () => fail(401, "Unauthorized"),
  [BAD404]: () => fail(404, "Not Found"),
  [ERR500]: () => fail(500, "Internal Server Error"),
  [ERR429]: () => fail(429, "Too Many Requests: retry after 5"),
  [SLOW]: async () => {
    await Bun.sleep(400);
    return botMe(6005, "lambat_bot");
  },
  [MASTER_OTHER]: () => ok({ ...ME }),
};

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let deleteHandler: (() => ReturnType<typeof ok>) | undefined;
let hooks: WriteHooks = {};
let logs: string[] = [];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-register-"));
  deleteHandler = undefined;
  hooks = {};
  logs = [];
  tg = startFakeTelegram(MASTER, { deleteMessage: () => (deleteHandler ? deleteHandler() : ok(true)) }, OTHER_BOTS);
});
afterEach(() => {
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

function makeBot() {
  return createMasterBot({
    token: MASTER,
    ownerId: OWNER,
    log: (m) => logs.push(m),
    client: { apiRoot: tg.apiRoot },
    botInfo: ME,
    dataDir: home,
    getMeTimeoutMs: 100,
    registryHooks: hooks,
  });
}

/** Mengirim satu pesan pemilik, mengembalikan balasan dan panggilan API yang terjadi. */
async function send(text: string) {
  const before = tg.calls.length;
  const update = ownerDm(text);
  await makeBot().handleUpdate(update);
  const calls = tg.calls.slice(before);
  const replies = calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
  const deletes = calls.filter((c) => c.method === "deleteMessage");
  expect(replies).toHaveLength(1);
  for (const c of calls) {
    for (const t of ALL_TOKENS) expect(JSON.stringify(c.params)).not.toContain(t);
  }
  for (const l of logs) for (const t of ALL_TOKENS) expect(l).not.toContain(t);
  return {
    reply: replies[0]!,
    deleted: deletes.length === 1 && deletes[0]!.params.message_id === update.message!.message_id,
    deleteCount: deletes.length,
    calls,
  };
}

/** Isi folder data (nama file dan isinya), untuk memastikan tidak ada yang berubah. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out[r + "/"] = "";
        walk(p, r);
      } else out[r] = readFileSync(p, "utf8");
    }
  };
  walk(home, "");
  return out;
}

const mode = (p: string) => statSync(p).mode & 0o777;

async function registerOk(name: string, token: string) {
  const r = await send(`/register ${name} ${token}`);
  expect(r.reply).toContain("terdaftar");
  expect(existsSync(join(home, "bots", name))).toBe(true);
  return r;
}

describe("nama ditolak sesuai aturan, tanpa jejak", () => {
  const bad: Array<[string, string]> = [
    ["huruf besar", "Bot-01"],
    ["diawali '-'", "-bot"],
    ["garis bawah", "bot_01"],
    ["titik", "bot.01"],
    ["path traversal", "../x"],
    ["garis miring", "a/b"],
    ["33 karakter", "a".repeat(33)],
    ["huruf non-ASCII", "bót"],
  ];
  for (const [label, name] of bad) {
    test(label, async () => {
      const before = snapshot();
      const r = await send(`/register ${name} ${GOOD}`);
      expect(r.reply).toContain("Nama tidak sesuai aturan");
      expect(r.deleted).toBe(true);
      expect(snapshot()).toEqual(before);
      expect(tg.otherCalls).toEqual([]);
    });
  }

  test("'master' dicadangkan", async () => {
    const r = await send(`/register master ${GOOD}`);
    expect(r.reply).toContain("dicadangkan");
    expect(r.deleted).toBe(true);
    expect(snapshot()).toEqual({});
    expect(tg.otherCalls).toEqual([]);
  });

  for (const name of ["a", "0", "a".repeat(32), "bot-01", "x-", "9-a-"]) {
    test(`nama sah diterima: ${name}`, async () => {
      await registerOk(name, GOOD);
    });
  }
});

describe("perintah salah bentuk dibalas contoh pemakaian", () => {
  test("hanya /register: dibalas, tidak dihapus", async () => {
    const r = await send("/register");
    expect(r.reply).toContain("Pemakaian: /register <nama> <token>");
    expect(r.deleteCount).toBe(0);
    expect(snapshot()).toEqual({});
  });
  for (const text of [`/register ${GOOD}`, "/register bot-01", `/register bot-01 ${GOOD} lagi`, `/register bot 01 ${GOOD}`]) {
    test(`ada argumen, dihapus: ${text.replace(/\d+:AA\w+/, "<token>")}`, async () => {
      const r = await send(text);
      expect(r.reply).toContain("Pemakaian: /register <nama> <token>");
      expect(r.deleted).toBe(true);
      expect(snapshot()).toEqual({});
      expect(tg.otherCalls).toEqual([]);
    });
  }
  test("/register@username dengan argumen tetap diproses", async () => {
    const r = await send(`/register@${ME.username} bot-01 ${GOOD}`);
    expect(r.deleted).toBe(true);
    expect(r.reply).toContain("@uji_satu_bot");
  });
});

describe("token ditolak dengan alasan yang jelas, tanpa jejak", () => {
  const cases: Array<[string, string, string]> = [
    ["401 dari Telegram", BAD401, "Token tidak valid"],
    ["404 dari Telegram", BAD404, "Token tidak valid"],
    ["5xx dari Telegram", ERR500, "Tidak bisa menghubungi Telegram"],
    ["429 dari Telegram", ERR429, "Tidak bisa menghubungi Telegram"],
    ["getMe melewati batas waktu", SLOW, "Tidak bisa menghubungi Telegram"],
    ["bentuk bukan token", "bukan-token", "Token tidak valid"],
    ["token dengan karakter URL", "5001:AA/../../getUpdates?x=aaaaaaaaaaaa", "Token tidak valid"],
  ];
  for (const [label, token, reason] of cases) {
    test(label, async () => {
      const r = await send(`/register bot-01 ${token}`);
      expect(r.reply).toContain(reason);
      expect(r.deleted).toBe(true);
      expect(snapshot()).toEqual({});
      expect(r.reply).not.toContain(token);
    });
  }

  test("jaringan putus", async () => {
    expect(await checkToken(GOOD, "http://127.0.0.1:1", 1000)).toEqual({ kind: "unreachable" });
  });

  test("token master-bot sendiri ditolak tanpa getMe", async () => {
    const r = await send(`/register bot-01 ${MASTER}`);
    expect(r.reply).toContain("milik master-bot");
    expect(r.deleted).toBe(true);
    expect(snapshot()).toEqual({});
    expect(tg.otherCalls).toEqual([]);
  });

  test("token lain milik master-bot (ID sama) ditolak", async () => {
    const r = await send(`/register bot-01 ${MASTER_OTHER}`);
    expect(r.reply).toContain("milik master-bot");
    expect(snapshot()).toEqual({});
  });
});

describe("duplikat ditolak", () => {
  test("nama yang sudah terdaftar", async () => {
    await registerOk("bot-01", GOOD);
    const before = snapshot();
    const r = await send(`/register bot-01 ${GOOD2}`);
    expect(r.reply).toContain("sudah terdaftar");
    expect(r.deleted).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  test("token yang sama untuk nama lain", async () => {
    await registerOk("bot-01", GOOD);
    const before = snapshot();
    const r = await send(`/register bot-02 ${GOOD}`);
    expect(r.reply).toContain("sudah terdaftar sebagai 'bot-01'");
    expect(snapshot()).toEqual(before);
  });

  test("token baru hasil revoke untuk bot yang sama", async () => {
    await registerOk("bot-01", GOOD);
    const before = snapshot();
    const r = await send(`/register bot-02 ${GOOD_REVOKED}`);
    expect(r.reply).toContain("sudah terdaftar sebagai 'bot-01'");
    expect(snapshot()).toEqual(before);
  });

  test("folder sudah ada tanpa catatan: ditolak tanpa mengubah apa pun", async () => {
    mkdirSync(join(home, "bots", "uji-01", "state"), { recursive: true });
    writeFileSync(join(home, "bots", "uji-01", "state", ".env"), "TELEGRAM_BOT_TOKEN=lama\n");
    const before = snapshot();
    const r = await send(`/register uji-01 ${GOOD}`);
    expect(r.reply).toContain("sudah ada di disk");
    expect(snapshot()).toEqual(before);
    expect(tg.otherCalls).toEqual([]);
  });

  test("registry rusak: ditolak, file tidak ditimpa", async () => {
    writeFileSync(join(home, "registry.json"), "{ rusak");
    const r = await send(`/register bot-01 ${GOOD}`);
    expect(r.reply).toContain("registry.json rusak");
    expect(snapshot()).toEqual({ "registry.json": "{ rusak" });
  });
});

describe("registrasi berhasil", () => {
  test("folder, izin, .env, access.json, registry, balasan", async () => {
    const r = await registerOk("bot-01", GOOD);
    expect(r.deleted).toBe(true);
    expect(r.reply).toContain("@uji_satu_bot");
    expect(r.reply).toContain("'bot-01'");

    const dir = join(home, "bots", "bot-01");
    for (const d of [dir, join(dir, "state"), join(dir, "workspace")]) {
      expect(statSync(d).isDirectory()).toBe(true);
      expect(mode(d)).toBe(0o700);
    }
    const env = join(dir, "state", ".env");
    expect(mode(env)).toBe(0o600);
    expect(readFileSync(env, "utf8")).toBe(`TELEGRAM_BOT_TOKEN=${GOOD}\n`);

    const access = join(dir, "state", "access.json");
    expect(mode(access)).toBe(0o600);
    expect(JSON.parse(readFileSync(access, "utf8"))).toEqual({
      dmPolicy: "allowlist",
      allowFrom: [String(OWNER)],
      groups: {},
      pending: {},
    });

    const regText = readFileSync(join(home, "registry.json"), "utf8");
    expect(regText).not.toContain(GOOD);
    const reg = JSON.parse(regText) as Registry;
    expect(Object.keys(reg)).toEqual(["bots"]);
    const rec = reg.bots["bot-01"]!;
    expect(rec).toEqual({ telegramId: 5001, username: "uji_satu_bot", status: "registered", createdAt: expect.any(String) });
    expect(Number.isNaN(Date.parse(rec.createdAt))).toBe(false);
    expect(readdirSync(home).sort()).toEqual(["bots", "registry.json"]);
  });

  test("bot kedua ditambahkan tanpa menghapus yang pertama", async () => {
    await registerOk("bot-01", GOOD);
    await registerOk("bot-02", GOOD2);
    expect(Object.keys(readRegistry(home).bots).sort()).toEqual(["bot-01", "bot-02"]);
  });

  test("penghapusan gagal: registrasi tetap jalan dan pemilik diperingatkan", async () => {
    deleteHandler = () => fail(400, "Bad Request: message can't be deleted");
    const r = await send(`/register bot-01 ${GOOD}`);
    expect(r.reply).toContain("@uji_satu_bot");
    expect(r.reply).toContain("gagal dihapus");
    expect(existsSync(join(home, "bots", "bot-01"))).toBe(true);
  });

  test("penghapusan gagal saat ditolak: tetap diperingatkan", async () => {
    deleteHandler = () => fail(400, "Bad Request: message can't be deleted");
    const r = await send(`/register Bot ${GOOD}`);
    expect(r.reply).toContain("Nama tidak sesuai");
    expect(r.reply).toContain("gagal dihapus");
    const u = await send(`/register bot-01`);
    expect(u.reply).toContain("Pemakaian");
    expect(u.reply).toContain("gagal dihapus");
  });

  test("dua registrasi bersamaan sama-sama tercatat", async () => {
    const deps = { dataDir: home, ownerId: OWNER, masterToken: MASTER, masterBotId: ME.id, apiRoot: tg.apiRoot };
    const [a, b, c] = await Promise.all([
      registerBot("bot-01", GOOD, deps),
      registerBot("bot-02", GOOD2, deps),
      registerBot("bot-03", GOOD3, deps),
    ]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(Object.keys(readRegistry(home).bots).sort()).toEqual(["bot-01", "bot-02", "bot-03"]);
  });

  test("dua registrasi bersamaan dengan nama sama: hanya satu yang tercatat", async () => {
    const deps = { dataDir: home, ownerId: OWNER, masterToken: MASTER, masterBotId: ME.id, apiRoot: tg.apiRoot };
    const res = await Promise.all([registerBot("bot-01", GOOD, deps), registerBot("bot-01", GOOD2, deps)]);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(readRegistry(home).bots["bot-01"]!.telegramId).toBe(5001);
  });
});

describe("registry tidak rusak walaupun penulisan terhenti", () => {
  test("gagal sebelum rename: registry lama utuh, folder bot dibersihkan", async () => {
    await registerOk("bot-01", GOOD);
    const regBefore = readFileSync(join(home, "registry.json"), "utf8");
    hooks.beforeRename = () => {
      throw new Error("disk penuh (simulasi)");
    };
    const r = await send(`/register bot-02 ${GOOD2}`);
    expect(r.reply).toContain("Registrasi gagal");
    expect(readFileSync(join(home, "registry.json"), "utf8")).toBe(regBefore);
    expect(existsSync(join(home, "bots", "bot-02"))).toBe(false);
    expect(readdirSync(home).sort()).toEqual(["bots", "registry.json"]);
  });

  test("proses dibunuh (SIGKILL) sebelum rename: registry lama tetap terbaca", async () => {
    const original: Registry = { bots: { "bot-01": { telegramId: 5001, username: "uji_satu_bot", status: "registered", createdAt: "2026-11-12T00:00:00.000Z" } } };
    writeRegistry(home, original);
    const script = join(home, "kill.ts");
    writeFileSync(
      script,
      `import { writeRegistry } from ${JSON.stringify(join(import.meta.dir, "..", "src", "registry.ts"))};\n` +
        `writeRegistry(process.argv[2]!, { bots: {} }, { beforeRename: () => process.kill(process.pid, "SIGKILL") });\n`,
    );
    const proc = Bun.spawn(["bun", script, home], { stdout: "ignore", stderr: "ignore" });
    expect(await proc.exited).not.toBe(0);
    expect(proc.signalCode).toBe("SIGKILL");
    rmSync(script);
    expect(readRegistry(home)).toEqual(original);
    // Yang tertinggal paling banyak sebuah file sementara, bukan registry setengah jadi.
    const leftovers = readdirSync(home).filter((f) => f !== "registry.json");
    expect(leftovers.every((f) => f.startsWith("registry.json.tmp-"))).toBe(true);
  });
});
