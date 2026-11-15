import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Update } from "grammy/types";
import { ACCESS_USAGE, ALLOW_USAGE, REVOKE_USAGE } from "../src/allow.ts";
import { createMasterBot, DELETE_USAGE, NEW_USAGE, RESTART_USAGE, STOP_USAGE, withNameRule } from "../src/bot.ts";
import { LOGS_USAGE } from "../src/logs.ts";
import {
  createPicker,
  PICK_COMMANDS,
  PICK_EXPIRED,
  PICK_NO_BOTS,
  pickBotQuestion,
  pickedBotText,
  pickUserQuestion,
  type PickCommand,
  type PickContext,
} from "../src/picker.ts";
import { NAME_RULE } from "../src/register.ts";
import { registryPath } from "../src/registry.ts";
import type { StopResult } from "../src/stop.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Tiket 261115210901: nama di registry yang tidak lolos aturan nama bot
// (registry diedit tangan atau rusak) tidak pernah menjadi tombol pemilih dan
// tidak pernah dijalankan lewat tombol. Token palsu saja; nama sah berawalan pn-.
const MASTER = "123456789:AAFakeMasterTokenForPickNames_abcdefgh";
const T0 = new Date(2026, 10, 15, 21, 9, 1).getTime();
const GUEST = "7001";
const OUTSIDER = "8002"; // hanya ada di access.json milik nama tidak sah

/** Nama yang tidak lolos aturan nama, satu per jenis pelanggaran. */
const BAD = [
  "../luar",
  "../../jauh",
  "a/b",
  "Pn-Besar",
  "PN",
  "",
  "pn-" + "x".repeat(30), // 33 karakter
  "-pn",
  "pn_a",
  "pn a",
  "pn.a",
  ".",
  "..",
  "pn-a\n",
  "/tmp/pn",
];
const USAGE: Record<PickCommand, string> = {
  stop: STOP_USAGE,
  restart: RESTART_USAGE,
  new: NEW_USAGE,
  logs: LOGS_USAGE,
  access: ACCESS_USAGE,
  delete: DELETE_USAGE,
  revoke: REVOKE_USAGE,
};

let root: string;
let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let logs: string[];
let clock: number;
const roots: string[] = [];
const servers: Array<ReturnType<typeof startFakeTelegram>> = [];

/** Folder data ada dua tingkat di dalam `root`, supaya `../luar` dan `../../jauh` tetap di dalam folder uji. */
function fresh() {
  root = mkdtempSync(join(tmpdir(), "bot-squad-pn-"));
  roots.push(root);
  home = join(root, "induk", "data");
  mkdirSync(home, { recursive: true });
  logs = [];
  clock = T0;
  tg = startFakeTelegram(MASTER);
  servers.push(tg);
}
beforeEach(() => fresh());
afterEach(() => {
  for (const s of servers.splice(0)) s.stop();
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const accessFile = (name: string) => join(home, "bots", name, "state", "access.json");

/**
 * Registry ditulis mentah (seperti diedit tangan). Setiap nama, sah atau
 * tidak, diberi access.json di tempat yang akan dibaca kalau nama itu dipakai
 * sebagai nama folder; milik nama tidak sah memuat OUTSIDER.
 */
function seed(names: string[]) {
  const bots: Record<string, unknown> = {};
  names.forEach((name, i) => {
    bots[name] = { telegramId: 7400 + i, username: `u${i}_bot`, status: "stopped", createdAt: "2026-11-15T00:00:00.000Z" };
    if (name.includes("\0")) return;
    mkdirSync(dirname(accessFile(name)), { recursive: true });
    const allowFrom = NAME_RULE.test(name) ? [String(OWNER), GUEST] : [String(OWNER), OUTSIDER];
    writeFileSync(accessFile(name), JSON.stringify({ dmPolicy: "allowlist", allowFrom }, null, 2) + "\n", { mode: 0o600 });
  });
  writeFileSync(registryPath(home), JSON.stringify({ bots }, null, 2));
}

const CLEAN: StopResult = { wasRunning: true, killed: [], sessionLeft: false, pidsLeft: [] };
function makeBot() {
  const calls: Array<[string, string]> = [];
  const pending: Promise<void>[] = [];
  const bot = createMasterBot({
    token: MASTER,
    ownerId: OWNER,
    log: (m) => logs.push(m),
    client: { apiRoot: tg.apiRoot },
    botInfo: ME,
    dataDir: home,
    getMeTimeoutMs: 200,
    now: () => clock,
    stop: async (name) => {
      calls.push(["stop", name]);
      return CLEAN;
    },
    launch: async (name, mode) => {
      calls.push(["launch", name]);
      return { kind: "active", pid: 4242, conversation: mode === "new" ? { kind: "new", why: "requested" } : { kind: "continued" } };
    },
    onLaunch: (p) => pending.push(p),
    probe: {
      tmux: {
        hasSession: async (n) => {
          calls.push(["hasSession", n]);
          return false;
        },
      },
      isAlive: () => false,
    },
    capture: async (name) => {
      calls.push(["capture", name]);
      return "layar";
    },
  });
  return { bot, calls, settle: () => Promise.all(pending) };
}

type Button = { text: string; callback_data: string };
const sent = () => tg.calls.filter((c) => c.method === "sendMessage");
const texts = () => sent().map((c) => String(c.params.text));
const labelsOf = (i: number): string[][] => ((sent()[i]!.params.reply_markup as any)?.inline_keyboard ?? []).map((r: Button[]) => r.map((b) => b.text));
const dataOf = (i: number, label: string): string =>
  ((sent()[i]!.params.reply_markup as any).inline_keyboard as Button[][]).flat().find((b) => b.text === label)!.callback_data;

let nextUpdate = 990_000;
const press = (data: string, messageId = 5): Update => ({
  update_id: nextUpdate++,
  callback_query: {
    id: `cb${nextUpdate}`,
    from: { id: OWNER, is_bot: false, first_name: "u" },
    chat_instance: "ci",
    data,
    message: { message_id: messageId, date: 0, chat: { id: OWNER, type: "private", first_name: "u" }, from: { id: ME.id, is_bot: true, first_name: "m" }, text: "?" } as any,
  },
});

/** Potret seluruh folder uji (juga di luar folder data): path relatif -> isi. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out[r] = "/";
        walk(join(d, e.name), r);
      } else out[r] = readFileSync(join(d, e.name), "utf8");
    }
  };
  walk(root, "");
  return out;
}

describe("pemilih hanya menampilkan nama yang lolos aturan nama", () => {
  test("daftar uji memang tidak sah, dan access.json '../luar' ada di luar bots/", () => {
    for (const name of BAD) expect(NAME_RULE.test(name)).toBe(false);
    seed(["../luar", "../../jauh"]);
    expect(Object.keys(snapshot())).toContain("induk/data/luar/state/access.json");
    expect(Object.keys(snapshot())).toContain("induk/jauh/state/access.json");
  });

  for (const cmd of PICK_COMMANDS) {
    test(`/${cmd}: nama tidak sah bukan tombol dan tidak dihitung; nama sah tetap tampil`, async () => {
      // `master` dan nama 32 karakter lolos aturan nama, jadi tampil seperti saat diketik.
      const long = "pn-" + "x".repeat(29);
      seed([...BAD, "pn-b", "master", long, "pn-a"]);
      const before = snapshot();
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      await settle();
      expect(texts()).toEqual([pickBotQuestion(cmd, 4, 4)]);
      expect(texts()[0]).not.toContain("Hanya");
      expect(labelsOf(0)).toEqual([["master", "pn-a", "pn-b"], [long], ["cancel"]]);
      expect(calls).toEqual([]);
      expect(snapshot()).toEqual(before);
    });

    test(`/${cmd}: registry hanya berisi nama tidak sah dijawab seperti belum ada bot, tanpa tombol`, async () => {
      seed(BAD);
      const before = snapshot();
      const { bot, calls } = makeBot();
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      expect(texts()).toEqual([PICK_NO_BOTS]);
      expect(sent()[0]!.params.reply_markup).toBeUndefined();
      expect(calls).toEqual([]);
      expect(snapshot()).toEqual(before);
    });

    for (const name of BAD) {
      test(`/${cmd}: satu-satunya entri ${JSON.stringify(name)} tidak menjadi tombol`, async () => {
        seed([name]);
        const { bot } = makeBot();
        await bot.handleUpdate(ownerDm(`/${cmd}`));
        expect(texts()).toEqual([PICK_NO_BOTS]);
        expect(sent()[0]!.params.reply_markup).toBeUndefined();
      });
    }
  }

  test("batas 99 tombol dihitung dari nama sah saja", async () => {
    const good = Array.from({ length: 99 }, (_, i) => `pn-${String(i).padStart(3, "0")}`);
    seed([...BAD, ...good]);
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/stop"));
    expect(texts()).toEqual([pickBotQuestion("stop", 99, 99)]);
    expect(labelsOf(0).flat()).toEqual([...good, "cancel"]);
  });
});

describe("/access dan /revoke lewat tombol tidak keluar dari bots/", () => {
  test("/access: hanya bot sah yang bisa dipilih; berkas di luar bots/ tidak tampil dan tidak berubah", async () => {
    seed(["../luar", "../../jauh", "a/b", "pn-a"]);
    const before = snapshot();
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/access"));
    expect(labelsOf(0)).toEqual([["pn-a"], ["cancel"]]);
    await bot.handleUpdate(press(dataOf(0, "pn-a")));
    expect(texts()[1]).toStartWith("Akses ke @u3_bot ('pn-a'): 2 orang");
    expect(texts()[1]).toContain(GUEST);
    // Nomor di luar daftar (tempat `../luar` dulu tampil) tidak membuka apa pun.
    await bot.handleUpdate(ownerDm("/access"));
    const id = dataOf(2, "pn-a").split(":")[1]!;
    await bot.handleUpdate(press(`pick:${id}:1`));
    expect(texts()[3]).toBe(PICK_EXPIRED);
    expect(texts().join("\n")).not.toContain(OUTSIDER);
    expect(texts().join("\n")).not.toContain("luar");
    expect(snapshot()).toEqual(before);
  });

  test("/revoke: user_id milik nama tidak sah tidak pernah ditawarkan, dan hanya access.json bot sah yang ditulis", async () => {
    seed(["../luar", "../../jauh", "a/b", "pn-a"]);
    const before = snapshot();
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    expect(labelsOf(0)).toEqual([["pn-a"], ["cancel"]]);
    await bot.handleUpdate(press(dataOf(0, "pn-a")));
    expect(texts()[1]).toBe(pickUserQuestion("pn-a", "u3_bot", 1, 1));
    expect(labelsOf(1)).toEqual([[GUEST], ["cancel"]]);
    await bot.handleUpdate(press(dataOf(1, GUEST)));
    expect(texts()[2]).toBe(`Akses dicabut: pesan ${GUEST} ke @u3_bot ('pn-a') mulai sekarang diabaikan.`);
    const after = snapshot();
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
    expect(changed).toEqual(["induk/data/bots/pn-a/state/access.json"]);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(JSON.parse(after["induk/data/luar/state/access.json"]!).allowFrom).toEqual([String(OWNER), OUTSIDER]);
  });

  test("yang diketik tidak berubah: nama tidak sah tetap cara pakai, tanpa menyentuh apa pun", async () => {
    seed(["../luar", "Pn-Besar", "pn-a"]);
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    const typed: Array<[string, string]> = [
      ["/access ../luar", ACCESS_USAGE],
      ["/access Pn-Besar", ACCESS_USAGE],
      [`/revoke ../luar ${OUTSIDER}`, REVOKE_USAGE],
      [`/allow ../luar 9009`, ALLOW_USAGE],
      [`/allow Pn-Besar 9009`, ALLOW_USAGE],
      ["/stop ../luar", STOP_USAGE],
      ["/restart ../luar", RESTART_USAGE],
      ["/new ../luar", NEW_USAGE],
      ["/delete ../luar", DELETE_USAGE],
      ["/logs ../luar", LOGS_USAGE],
      ["/logs Pn-Besar 5", LOGS_USAGE],
      ["/stop pn-a pn-b", STOP_USAGE],
      ["/revoke pn-a abc", REVOKE_USAGE],
      ["/revoke pn-a", REVOKE_USAGE],
      ["/allow pn-a", ALLOW_USAGE],
    ];
    for (const [text] of typed) await bot.handleUpdate(ownerDm(text));
    await settle();
    expect(texts()).toEqual(typed.map(([, usage]) => usage));
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
    // Nama sah yang diketik tetap bekerja.
    await bot.handleUpdate(ownerDm("/access pn-a"));
    await bot.handleUpdate(ownerDm("/allow pn-a 9009"));
    await bot.handleUpdate(ownerDm("/revoke pn-a 9009"));
    await bot.handleUpdate(ownerDm("/stop pn-a"));
    await settle();
    expect(texts()[typed.length]).toStartWith("Akses ke @u2_bot ('pn-a'): 2 orang");
    expect(texts()[typed.length + 1]).toStartWith("Akses diberikan: 9009");
    expect(texts()[typed.length + 2]).toStartWith("Akses dicabut: pesan 9009");
    expect(texts()[typed.length + 3]).toBe("Menghentikan 'pn-a'...");
    expect(calls).toEqual([["stop", "pn-a"]]);
  });

  test("bot sah di registry yang sama: tombol menjalankan perintahnya seperti biasa", async () => {
    seed([...BAD, "pn-a"]);
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/stop"));
    await bot.handleUpdate(press(dataOf(0, "pn-a")));
    await settle();
    expect(texts()[1]).toBe("Menghentikan 'pn-a'...");
    expect(calls).toEqual([["stop", "pn-a"]]);
    await bot.handleUpdate(ownerDm("/logs"));
    await bot.handleUpdate(press(dataOf(3, "pn-a")));
    expect(texts()[4]).toContain("tidak hidup");
    await bot.handleUpdate(ownerDm("/delete"));
    await bot.handleUpdate(press(dataOf(5, "pn-a")));
    expect(labelsOf(6)).toEqual([["Hapus", "Batal"]]);
  });
});

describe("gerbang aturan nama di pekerjaan perintah (withNameRule)", () => {
  for (const name of [...BAD, "pn\0a", undefined as unknown as string, 7 as unknown as string]) {
    test(`${JSON.stringify(name) ?? "undefined"}: dijawab cara pakai, pekerjaannya tidak dipanggil`, async () => {
      const ran: unknown[] = [];
      const replies: string[] = [];
      const run = withNameRule("CARA PAKAI", async (_chat, n: string, extra: number) => void ran.push([n, extra]));
      await run({ reply: async (t) => void replies.push(t) }, name, 3);
      expect(ran).toEqual([]);
      expect(replies).toEqual(["CARA PAKAI"]);
    });
  }

  test("nama sah diteruskan apa adanya, dengan argumen lain", async () => {
    const ran: unknown[] = [];
    const replies: string[] = [];
    const run = withNameRule("CARA PAKAI", async (_chat, n: string, extra: number) => void ran.push([n, extra]));
    for (const name of ["a", "0", "pn-a", "master", "a".repeat(32), "a--"]) await run({ reply: async (t) => void replies.push(t) }, name, 3);
    expect(ran).toEqual([["a", 3], ["0", 3], ["pn-a", 3], ["master", 3], ["a".repeat(32), 3], ["a--", 3]]);
    expect(replies).toEqual([]);
  });
});

describe("ketukan tombol yang merujuk nama tidak sah", () => {
  /**
   * Pemilih dipakai langsung, dengan aturan nama yang bisa dilonggarkan saat
   * pertanyaan dikirim: satu-satunya cara tombol untuk nama tidak sah bisa ada.
   */
  function loosePicker() {
    const state = { loose: true };
    const ran: string[] = [];
    const out: string[] = [];
    const keyboards: Button[][][] = [];
    const record = (label: string) => async (_ctx: PickContext, name: string) => void ran.push(`${label}:${name}`);
    const picker = createPicker({
      dataDir: home,
      ownerId: OWNER,
      log: (m) => logs.push(m),
      now: () => clock,
      ttlMs: 300_000,
      actions: {
        stop: record("stop"),
        restart: record("restart"),
        new: record("new"),
        logs: record("logs"),
        access: record("access"),
        delete: record("delete"),
      },
      revoke: async (_ctx, name, userId) => void ran.push(`revoke:${name}:${userId}`),
      isBotName: (name) => state.loose || NAME_RULE.test(name),
    });
    const reply = async (text: string, other?: any) => {
      out.push(text);
      if (other?.reply_markup) keyboards.push(other.reply_markup.inline_keyboard);
    };
    const answers: Array<string | undefined> = [];
    const tap = (label: string) => {
      const data = keyboards[keyboards.length - 1]!.flat().find((b) => b.text === label)!.callback_data;
      return picker.handle({
        match: data.match(/^pick:([0-9a-f]{16}):(x|[0-9]{1,2})$/),
        answerCallbackQuery: async (o) => void answers.push(o?.text),
        editMessageText: async (t) => void out.push(`edit:${t}`),
        editMessageReplyMarkup: async () => {},
        reply,
      });
    };
    return { state, ran, out, answers, picker, reply, tap };
  }

  for (const cmd of PICK_COMMANDS) {
    for (const name of ["../luar", "a/b", "Pn-Besar", ""]) {
      test(`/${cmd} ${JSON.stringify(name)}: kedaluwarsa sebelum registry atau berkas dibaca`, async () => {
        seed([name, "pn-a"]);
        const p = loosePicker();
        await p.picker.ask(p.reply, cmd);
        p.state.loose = false;
        // Registry dirusak: kalau ketukan itu membacanya, log mencatatnya.
        writeFileSync(registryPath(home), "{rusak");
        const before = snapshot();
        const label = name;
        await p.tap(label);
        expect(p.out[p.out.length - 1]).toBe(PICK_EXPIRED);
        expect(p.answers).toEqual(["Kedaluwarsa"]);
        expect(p.ran).toEqual([]);
        expect(logs.some((l) => l.includes("registry tidak bisa dibaca"))).toBe(false);
        expect(logs).toEqual([`/${cmd} ditolak: tombol pemilih merujuk nama bot yang tidak sesuai aturan nama`]);
        expect(snapshot()).toEqual(before);
      });
    }
  }

  test("/revoke langkah kedua: tombol user_id untuk nama tidak sah juga ditolak, access.json di luar bots/ utuh", async () => {
    seed(["../luar", "pn-a"]);
    const p = loosePicker();
    await p.picker.ask(p.reply, "revoke");
    await p.tap("../luar");
    // Dengan aturan dilonggarkan, pertanyaan kedua memang menawarkan OUTSIDER.
    expect(p.out[p.out.length - 1]).toBe(pickUserQuestion("../luar", "u0_bot", 1, 1));
    p.state.loose = false;
    const before = snapshot();
    await p.tap(OUTSIDER);
    expect(p.out[p.out.length - 1]).toBe(PICK_EXPIRED);
    expect(p.ran).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test("nama sah di pertanyaan yang sama tetap dijalankan", async () => {
    seed(["../luar", "pn-a"]);
    const p = loosePicker();
    await p.picker.ask(p.reply, "access");
    p.state.loose = false;
    await p.tap("pn-a");
    expect(p.out[p.out.length - 1]).toBe(`edit:${pickedBotText("access", "pn-a")}`);
    expect(p.ran).toEqual(["access:pn-a"]);
  });

  test("pekerjaan perintah di master-bot menolak nama tidak sah walau pemilih meloloskannya", async () => {
    // Lapis kedua: fungsi yang dipanggil tombol adalah fungsi yang sama dengan
    // perintah yang diketik, dan fungsi itu sendiri memeriksa aturan nama.
    seed(["../luar", "pn-a"]);
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    for (const cmd of PICK_COMMANDS) {
      await bot.handleUpdate(ownerDm(cmd === "revoke" ? `/revoke ../luar ${OUTSIDER}` : `/${cmd} ../luar`));
    }
    await settle();
    expect(texts()).toEqual(PICK_COMMANDS.map((c) => USAGE[c]));
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });
});

/**
 * Langkah "How to reproduce" tiket, di proses master-bot sungguhan terhadap
 * Telegram tiruan. HOME dan BOT_SQUAD_HOME sementara, server tmux terpisah
 * (TMUX_TMPDIR; tidak ada sesi yang dibuat).
 */
describe("proses master-bot sungguhan dengan registry berisi '../luar'", () => {
  test("/access dan /revoke tanpa argumen: tombol '../luar' tidak ada, berkas di luar bots/ utuh", async () => {
    const MAIN = join(import.meta.dir, "..", "src", "main.ts");
    const tmuxDir = join(root, "tmux");
    mkdirSync(join(tmuxDir, `tmux-${process.getuid!()}`), { recursive: true, mode: 0o700 });
    mkdirSync(join(home, "master"));
    writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
    const proc = Bun.spawn([process.execPath, MAIN], {
      env: {
        PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
        HOME: root,
        BOT_SQUAD_HOME: home,
        TMUX_TMPDIR: tmuxDir,
        MASTER_BOT_API_ROOT: tg.apiRoot,
        HTTPS_PROXY: "http://127.0.0.1:9",
        NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    let before: Record<string, string> = {};
    try {
      const until = async (cond: () => boolean, what: string) => {
        for (const end = Date.now() + 10_000; !cond(); await Bun.sleep(50)) {
          if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
        }
      };
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      // Ditulis setelah polling berjalan, supaya penyalaan otomatis tidak ikut campur.
      seed(["../luar", "a/b", "Pn-Besar", "pn-a"]);
      before = snapshot();

      tg.push(ownerDm("/access"));
      await until(() => sent().length >= 1, "pemilih /access");
      expect(texts()[0]).toBe(pickBotQuestion("access", 1, 1));
      expect(labelsOf(0)).toEqual([["pn-a"], ["cancel"]]);
      const id = dataOf(0, "pn-a").split(":")[1]!;
      // Nomor tempat nama tidak sah dulu tampil: tidak ada lagi.
      tg.push(press(`pick:${id}:1`, 201));
      await until(() => sent().length >= 2, "kedaluwarsa");
      expect(texts()[1]).toBe(PICK_EXPIRED);

      tg.push(ownerDm("/access"));
      await until(() => sent().length >= 3, "pemilih /access kedua");
      tg.push(press(dataOf(2, "pn-a"), 202));
      await until(() => sent().length >= 4, "akses pn-a");
      expect(texts()[3]).toStartWith("Akses ke @u3_bot ('pn-a'): 2 orang");

      tg.push(ownerDm("/revoke"));
      await until(() => sent().length >= 5, "pemilih /revoke");
      expect(labelsOf(4)).toEqual([["pn-a"], ["cancel"]]);
      tg.push(press(dataOf(4, "pn-a"), 203));
      await until(() => sent().length >= 6, "pemilih user_id");
      expect(labelsOf(5)).toEqual([[GUEST], ["cancel"]]);
      tg.push(press(dataOf(5, GUEST), 204));
      await until(() => sent().length >= 7, "akses dicabut");
      expect(texts()[6]).toStartWith(`Akses dicabut: pesan ${GUEST}`);

      tg.push(ownerDm("/access ../luar"));
      await until(() => sent().length >= 8, "cara pakai");
      expect(texts()[7]).toBe(ACCESS_USAGE);
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }
    expect(texts().join("\n")).not.toContain(OUTSIDER);
    const after = snapshot();
    const changed = Object.keys(after).filter((k) => after[k] !== before[k] && !k.startsWith("induk/data/master/"));
    expect(changed).toEqual(["induk/data/bots/pn-a/state/access.json"]);
    expect(Object.keys(after).filter((k) => !(k in before) && !k.startsWith("tmux"))).toEqual([]);
  }, 30_000);
});
