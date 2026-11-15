import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Update } from "grammy/types";
import { ALLOW_USAGE, REVOKE_USAGE } from "../src/allow.ts";
import { createMasterBot, DELETE_CONFIRM_MS, deleteQuestion, HELP_PICKER_NOTE, helpText, newQuestion, STOP_USAGE } from "../src/bot.ts";
import { KEYS_USAGE } from "../src/keys.ts";
import type { ConversationMode } from "../src/launch.ts";
import { LOGS_USAGE } from "../src/logs.ts";
import {
  nothingToRevokeText,
  PICK_COMMANDS,
  PICK_DATA,
  PICK_EXPIRED,
  PICK_NO_BOTS,
  pickBotQuestion,
  pickCancelledText,
  pickedBotText,
  pickedUserText,
  pickKeyboard,
  pickUserQuestion,
  type PickCommand,
} from "../src/picker.ts";
import { USAGE as REGISTER_USAGE } from "../src/register.ts";
import { readRegistry, writeRegistry, type BotStatus } from "../src/registry.ts";
import type { StopResult } from "../src/stop.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm, STRANGER } from "./updates.ts";

// Tiket 261115202403: perintah tanpa nama menampilkan bot terdaftar sebagai
// tombol. Token palsu saja. Nama bot di file ini unik (pk-*).
const MASTER = "123456789:AAFakeMasterTokenForPickerTests_abcdefg";
const BOTTOKEN = "5030:AAFakeBotTokenForPickerTests_bbbbbbbbbbb";
const T0 = new Date(2026, 10, 15, 9, 8, 7).getTime();
const LONG = "pk-" + "x".repeat(29); // 32 karakter, nama terpanjang yang sah
const OTHER_A = "7001";
const OTHER_B = "9007199254740991"; // user_id terpanjang yang sah

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let logs: string[];
let clock: number;
const homes: string[] = [];
const servers: Array<ReturnType<typeof startFakeTelegram>> = [];

/** Folder data dan Telegram tiruan baru; bisa dipanggil lagi di tengah tes untuk dunia pembanding. */
function fresh(handlers: Parameters<typeof startFakeTelegram>[1] = {}) {
  home = mkdtempSync(join(tmpdir(), "bot-squad-pick-"));
  homes.push(home);
  logs = [];
  clock = T0;
  tg = startFakeTelegram(MASTER, handlers);
  servers.push(tg);
}
beforeEach(() => fresh());
afterEach(() => {
  for (const s of servers.splice(0)) s.stop();
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

const CLEAN: StopResult = { wasRunning: true, killed: [], sessionLeft: false, pidsLeft: [] };
const accessFile = (name: string) => join(home, "bots", name, "state", "access.json");
const allowFrom = (name: string): string[] => JSON.parse(readFileSync(accessFile(name), "utf8")).allowFrom;

function seed(bots: Record<string, BotStatus>, access: Record<string, string[]> = {}) {
  const reg = { bots: {} as Record<string, any> };
  let id = 7300;
  for (const [name, status] of Object.entries(bots)) {
    reg.bots[name] = { telegramId: id++, username: `${name.replace(/-/g, "_")}_bot`, status, createdAt: "2026-11-13T00:00:00.000Z" };
    const dir = join(home, "bots", name);
    mkdirSync(join(dir, "state"), { recursive: true });
    mkdirSync(join(dir, "workspace"), { recursive: true });
    writeFileSync(join(dir, "state", ".env"), `TELEGRAM_BOT_TOKEN=${BOTTOKEN}\n`, { mode: 0o600 });
    writeFileSync(
      accessFile(name),
      JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(OWNER), ...(access[name] ?? [])], groups: {} }, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
  writeRegistry(home, reg);
}

function makeBot(o: { stopGate?: Promise<void> } = {}) {
  const calls: Array<["stop" | "launch" | "capture", string]> = [];
  const modes: ConversationMode[] = [];
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
      await o.stopGate;
      return CLEAN;
    },
    launch: async (name, mode) => {
      calls.push(["launch", name]);
      modes.push(mode);
      return { kind: "active", pid: 4242, conversation: mode === "new" ? { kind: "new", why: "requested" } : { kind: "continued" } };
    },
    onLaunch: (p) => pending.push(p),
    // Bot pk-hidup punya sesi tmux; yang lain mati.
    probe: { tmux: { hasSession: async (n) => n === "pk-hidup" }, isAlive: () => false },
    capture: async (name) => {
      calls.push(["capture", name]);
      return Array.from({ length: 30 }, (_, i) => `baris ${i + 1}`).join("\n");
    },
  });
  return { bot, calls, modes, settle: () => Promise.all(pending) };
}

type Button = { text: string; callback_data: string };
const sent = () => tg.calls.filter((c) => c.method === "sendMessage");
const texts = () => sent().map((c) => String(c.params.text));
const edits = () => tg.calls.filter((c) => c.method === "editMessageText").map((c) => String(c.params.text));
/** Keyboard pesan bertombol terakhir. */
function keyboard(): Button[][] {
  const withKb = sent().filter((c) => c.params.reply_markup);
  const last = withKb[withKb.length - 1];
  if (!last) throw new Error("tidak ada pesan bertombol");
  return (last.params.reply_markup as any).inline_keyboard;
}
const button = (label: string) => keyboard().flat().find((b) => b.text === label)!.callback_data;

let nextUpdate = 970_000;
function press(data: string, from = OWNER, chat: { id: number; type: string } = { id: OWNER, type: "private" }): Update {
  return {
    update_id: nextUpdate++,
    callback_query: {
      id: `cb${nextUpdate}`,
      from: { id: from, is_bot: false, first_name: "u" },
      chat_instance: "ci",
      data,
      message: { message_id: 5, date: 0, chat: chat as any, from: { id: ME.id, is_bot: true, first_name: "m" }, text: "?" } as any,
    },
  };
}

/** Potret seluruh folder data: path relatif -> isi (folder ditandai "/"). */
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
  walk(home, "");
  return out;
}
const status = (name: string) => readRegistry(home).bots[name]?.status;

const FOUR = { "pk-c": "active", "pk-a": "stopped", [LONG]: "failed", "pk-b": "registered" } as Record<string, BotStatus>;

describe("perintah tanpa argumen menampilkan pemilih bot", () => {
  for (const cmd of PICK_COMMANDS) {
    test(`/${cmd}: semua bot terdaftar urut nama, tiga per baris, cancel di baris terakhir`, async () => {
      seed(FOUR);
      const before = snapshot();
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      await settle();
      expect(calls).toEqual([]);
      expect(texts()).toEqual([pickBotQuestion(cmd, 4, 4)]);
      expect(texts()[0]).toContain(`/${cmd}`);
      expect(keyboard().map((row) => row.map((b) => b.text))).toEqual([["pk-a", "pk-b", "pk-c"], [LONG], ["cancel"]]);
      for (const b of keyboard().flat()) {
        expect(b.callback_data).toMatch(PICK_DATA);
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
        // Nama bot tidak pernah ada di data tombol.
        expect(b.callback_data).not.toContain("pk-");
      }
      expect(snapshot()).toEqual(before);
    });

    test(`/${cmd}: tanpa bot terdaftar dijawab belum ada bot, tanpa tombol`, async () => {
      const { bot } = makeBot();
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      expect(texts()).toEqual([PICK_NO_BOTS]);
      expect(texts()[0]).toContain("Belum ada bot terdaftar");
      expect(texts()[0]).toContain("/register <nama> <token>");
      expect(sent()[0]!.params.reply_markup).toBeUndefined();
    });
  }

  test("spasi saja dianggap tanpa argumen; registry rusak dijawab pesan tanpa tombol", async () => {
    seed({ "pk-a": "active" });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/stop   "));
    expect(texts()).toEqual([pickBotQuestion("stop", 1, 1)]);
    writeFileSync(join(home, "registry.json"), "{rusak");
    await bot.handleUpdate(ownerDm("/stop"));
    expect(texts()[1]).toEndWith("Tidak ada yang diubah.");
    expect(sent()[1]!.params.reply_markup).toBeUndefined();
  });

  test("susunan baris: 1, 3, 6, dan 7 pilihan", () => {
    const shape = (n: number) => pickKeyboard("0".repeat(16), Array.from({ length: n }, (_, i) => `b${i}`)).map((r) => r.length);
    expect(shape(1)).toEqual([1, 1]);
    expect(shape(3)).toEqual([3, 1]);
    expect(shape(6)).toEqual([3, 3, 1]);
    expect(shape(7)).toEqual([3, 3, 1, 1]);
  });

  test("lebih dari 99 bot: 99 tombol plus cancel, dan pesannya menyebut sisanya", async () => {
    const many: Record<string, BotStatus> = {};
    for (let i = 0; i < 101; i++) many[`pk-${String(i).padStart(3, "0")}`] = "stopped";
    seed(many);
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/logs"));
    expect(keyboard().flat().length).toBe(100);
    expect(texts()[0]).toContain("Hanya 99 dari 101 bot");
    for (const b of keyboard().flat()) expect(b.callback_data).toMatch(PICK_DATA);
  });
});

/**
 * Menjalankan `/cmd <nama>` yang diketik di dunia baru, lalu `/cmd` + tombol
 * di dunia baru lain yang isinya sama, dan mengembalikan keduanya.
 */
async function typedAndPicked(cmd: PickCommand, name: string) {
  const run = async (picked: boolean) => {
    fresh();
    seed({ "pk-hidup": "active", "pk-mati": "active", "pk-lain": "active" });
    const before = snapshot();
    const { bot, calls, modes, settle } = makeBot();
    if (picked) {
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      await bot.handleUpdate(press(button(name)));
    } else {
      await bot.handleUpdate(ownerDm(`/${cmd} ${name}`));
    }
    await settle();
    const after = sent().slice(picked ? 1 : 0);
    return {
      texts: after.map((c) => String(c.params.text)),
      parseModes: after.map((c) => c.params.parse_mode),
      labels: after.map((c) => ((c.params.reply_markup as any)?.inline_keyboard ?? []).map((r: Button[]) => r.map((b) => b.text))),
      calls,
      modes,
      changed: JSON.stringify(snapshot()) !== JSON.stringify(before),
      snapshot: snapshot(),
      edits: edits(),
      editCalls: tg.calls.filter((c) => c.method === "editMessageText"),
      bot,
      settle,
    };
  };
  return { typed: await run(false), picked: await run(true) };
}

describe("menekan nama bot = mengetik perintah dengan nama", () => {
  test("/stop langsung jalan", async () => {
    const { typed, picked } = await typedAndPicked("stop", "pk-hidup");
    expect(picked.texts).toEqual(typed.texts);
    expect(picked.texts[0]).toBe("Menghentikan 'pk-hidup'...");
    expect(picked.calls).toEqual([["stop", "pk-hidup"]]);
    expect(picked.calls).toEqual(typed.calls);
    expect(picked.snapshot).toEqual(typed.snapshot);
    expect(status("pk-hidup")).toBe("stopped");
    expect(status("pk-lain")).toBe("active");
    // Pesan pertanyaan menyebut pilihan dan tombolnya hilang.
    expect(picked.edits).toEqual([pickedBotText("stop", "pk-hidup")]);
    expect(picked.editCalls[0]!.params.reply_markup).toBeUndefined();
  });

  test("/restart langsung jalan, melanjutkan percakapan", async () => {
    const { typed, picked } = await typedAndPicked("restart", "pk-mati");
    expect(picked.texts).toEqual(typed.texts);
    expect(picked.calls).toEqual([["stop", "pk-mati"], ["launch", "pk-mati"]]);
    expect(picked.calls).toEqual(typed.calls);
    expect(picked.modes).toEqual(["continue"]);
    expect(picked.edits).toEqual([pickedBotText("restart", "pk-mati")]);
  });

  test("/logs menampilkan 20 baris; bot yang tidak hidup dijawab perintahnya sendiri", async () => {
    const live = await typedAndPicked("logs", "pk-hidup");
    expect(live.picked.texts).toEqual(live.typed.texts);
    expect(live.picked.parseModes).toEqual(["HTML"]);
    expect(live.picked.texts[0]).toContain("20 baris terakhir");
    expect(live.picked.texts[0]).toContain("<pre>baris 11\n");
    expect(live.picked.calls).toEqual([["capture", "pk-hidup"]]);
    expect(live.picked.changed).toBe(false);
    const dead = await typedAndPicked("logs", "pk-mati");
    expect(dead.picked.texts).toEqual(dead.typed.texts);
    expect(dead.picked.texts[0]).toContain("tidak hidup");
    expect(dead.picked.calls).toEqual([]);
  });

  test("/access langsung jalan", async () => {
    const { typed, picked } = await typedAndPicked("access", "pk-lain");
    expect(picked.texts).toEqual(typed.texts);
    expect(picked.texts[0]).toStartWith("Akses ke @pk_lain_bot ('pk-lain'): 1 orang");
    expect(picked.changed).toBe(false);
  });

  test("/delete menampilkan konfirmasinya; tidak ada yang berubah sebelum Hapus", async () => {
    const { typed, picked } = await typedAndPicked("delete", "pk-mati");
    expect(picked.texts).toEqual(typed.texts);
    expect(picked.texts).toEqual([deleteQuestion("pk-mati", "pk_mati_bot")]);
    expect(picked.labels).toEqual([[["Hapus", "Batal"]]]);
    expect(picked.labels).toEqual(typed.labels);
    expect(picked.parseModes).toEqual(typed.parseModes);
    expect(picked.calls).toEqual([]);
    expect(picked.changed).toBe(false);
    // Konfirmasi yang sama: Hapus benar-benar menghapus bot itu saja.
    await picked.bot.handleUpdate(press(button("Hapus")));
    await picked.settle();
    expect(Object.keys(readRegistry(home).bots).sort()).toEqual(["pk-hidup", "pk-lain"]);
    expect(existsSync(join(home, "bots", "pk-mati"))).toBe(false);
  });

  test("/delete lewat pemilih lalu Batal: tidak ada yang berubah", async () => {
    seed({ "pk-a": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete"));
    await bot.handleUpdate(press(button("pk-a")));
    await bot.handleUpdate(press(button("Batal")));
    await settle();
    expect(texts()[2]).toBe("Penghapusan 'pk-a' dibatalkan. Tidak ada yang diubah.");
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test("/new menampilkan konfirmasinya; tidak ada yang berubah sebelum Mulai baru", async () => {
    const { typed, picked } = await typedAndPicked("new", "pk-hidup");
    expect(picked.texts).toEqual(typed.texts);
    expect(picked.texts).toEqual([newQuestion("pk-hidup", "pk_hidup_bot")]);
    expect(picked.labels).toEqual([[["Mulai baru", "Batal"]]]);
    expect(picked.calls).toEqual([]);
    expect(picked.changed).toBe(false);
    await picked.bot.handleUpdate(press(button("Mulai baru")));
    await picked.settle();
    expect(picked.calls).toEqual([["stop", "pk-hidup"], ["launch", "pk-hidup"]]);
    expect(picked.modes).toEqual(["new"]);
  });

  test("bot yang sedang diproses: jawaban sibuk yang sama dengan perintah bernama", async () => {
    seed({ "pk-a": "active" });
    let open!: () => void;
    const { bot, settle } = makeBot({ stopGate: new Promise<void>((r) => (open = r)) });
    await bot.handleUpdate(ownerDm("/stop"));
    const stopData = button("pk-a");
    await bot.handleUpdate(ownerDm("/restart"));
    const restartData = button("pk-a");
    await bot.handleUpdate(press(stopData));
    await bot.handleUpdate(press(restartData));
    await bot.handleUpdate(ownerDm("/restart pk-a"));
    const busy = texts().filter((t) => t.includes("sedang"));
    expect(busy.length).toBe(2);
    expect(busy[0]).toBe(busy[1]!);
    expect(busy[0]).toBe("'pk-a' sedang dihentikan, coba lagi setelah selesai.");
    open();
    await settle();
  });
});

describe("/revoke tanpa argumen bertanya dua kali", () => {
  test("bot, lalu user_id tanpa pemilik; hanya orang itu di bot itu yang dicabut", async () => {
    const access = { "pk-a": [OTHER_A, OTHER_B, "7003", "7004"], "pk-b": [OTHER_A, OTHER_B] };
    // Dunia pembanding: perintah diketik lengkap.
    seed({ "pk-a": "active", "pk-b": "stopped" }, access);
    const typedBot = makeBot();
    await typedBot.bot.handleUpdate(ownerDm(`/revoke pk-a ${OTHER_B}`));
    const typedTexts = texts();
    const typedSnapshot = snapshot();

    fresh();
    seed({ "pk-a": "active", "pk-b": "stopped" }, access);
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    const before = snapshot();
    await bot.handleUpdate(press(button("pk-a")));
    expect(edits()).toEqual([pickedBotText("revoke", "pk-a")]);
    expect(texts()[1]).toBe(pickUserQuestion("pk-a", "pk_a_bot", 4, 4));
    expect(keyboard().map((r) => r.map((b) => b.text))).toEqual([[OTHER_A, OTHER_B, "7003"], ["7004"], ["cancel"]]);
    for (const b of keyboard().flat()) {
      expect(b.callback_data).toMatch(PICK_DATA);
      expect(b.callback_data).not.toContain(OTHER_B);
    }
    expect(snapshot()).toEqual(before);

    await bot.handleUpdate(press(button(OTHER_B)));
    expect(texts().slice(2)).toEqual(typedTexts);
    expect(texts()[2]).toBe(`Akses dicabut: pesan ${OTHER_B} ke @pk_a_bot ('pk-a') mulai sekarang diabaikan.`);
    expect(edits()[1]).toBe(pickedUserText("pk-a", OTHER_B));
    expect(allowFrom("pk-a")).toEqual([String(OWNER), OTHER_A, "7003", "7004"]);
    expect(allowFrom("pk-b")).toEqual([String(OWNER), OTHER_A, OTHER_B]);
    expect(snapshot()).toEqual(typedSnapshot);
    // Selesai: tidak ada pertanyaan lanjutan.
    expect(sent().length).toBe(3);
  });

  test("tanpa user_id selain pemilik: tidak ada yang bisa dicabut, tanpa tombol", async () => {
    seed({ "pk-a": "active", "pk-b": "active" }, { "pk-b": [OTHER_A] });
    const before = snapshot();
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-a")));
    expect(texts()[1]).toBe(nothingToRevokeText("pk-a", "pk_a_bot"));
    expect(texts()[1]).toContain("Tidak ada yang bisa dicabut");
    expect(sent()[1]!.params.reply_markup).toBeUndefined();
    expect(snapshot()).toEqual(before);
  });

  test("access.json rusak atau tidak ada: dijelaskan, tanpa tombol, tidak ditimpa", async () => {
    seed({ "pk-a": "active", "pk-b": "active" });
    writeFileSync(accessFile("pk-a"), "{rusak");
    rmSync(accessFile("pk-b"));
    const before = snapshot();
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-a")));
    expect(texts()[1]).toContain("access.json 'pk-a' rusak");
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-b")));
    expect(texts()[3]).toContain("access.json 'pk-b' belum ada");
    expect(sent().filter((c) => c.params.reply_markup).length).toBe(2);
    expect(snapshot()).toEqual(before);
  });

  test("orang itu sudah dicabut sebelum tombolnya ditekan: jawaban /revoke biasa, tidak ada yang ditulis", async () => {
    seed({ "pk-a": "active" }, { "pk-a": [OTHER_A, OTHER_B] });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-a")));
    const data = button(OTHER_A);
    await bot.handleUpdate(ownerDm(`/revoke pk-a ${OTHER_A}`));
    const before = snapshot();
    await bot.handleUpdate(press(data));
    expect(texts()[3]).toBe(`${OTHER_A} memang tidak punya akses ke @pk_a_bot ('pk-a'). Tidak ada yang diubah.`);
    expect(snapshot()).toEqual(before);
  });

  test("bot didaftarkan ulang di antara dua pertanyaan: tombol user_id kedaluwarsa", async () => {
    seed({ "pk-a": "active" }, { "pk-a": [OTHER_A] });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-a")));
    const data = button(OTHER_A);
    const reg = readRegistry(home);
    reg.bots["pk-a"] = { ...reg.bots["pk-a"]!, telegramId: 99, createdAt: "2026-11-15T00:00:00.000Z" };
    writeRegistry(home, reg);
    const before = snapshot();
    await bot.handleUpdate(press(data));
    expect(texts()[2]).toBe(PICK_EXPIRED);
    expect(allowFrom("pk-a")).toEqual([String(OWNER), OTHER_A]);
    expect(snapshot()).toEqual(before);
  });
});

describe("cancel", () => {
  for (const cmd of PICK_COMMANDS) {
    test(`/${cmd}: cancel membatalkan tanpa mengubah apa pun, tombol hilang`, async () => {
      seed({ "pk-a": "active", "pk-b": "active" }, { "pk-a": [OTHER_A] });
      const before = snapshot();
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      const pick = button("pk-a");
      await bot.handleUpdate(press(button("cancel")));
      await settle();
      const edit = tg.calls.filter((c) => c.method === "editMessageText");
      expect(edit.map((c) => c.params.text)).toEqual([pickCancelledText(cmd)]);
      // editMessageText tanpa reply_markup mencopot keyboard pesan itu.
      expect(edit[0]!.params.reply_markup).toBeUndefined();
      expect(edit[0]!.params.message_id).toBe(5);
      expect(texts().length).toBe(1);
      // Tombol bot di pesan yang sudah dibatalkan tidak berlaku lagi.
      await bot.handleUpdate(press(pick));
      await settle();
      expect(texts()[1]).toBe(PICK_EXPIRED);
      expect(calls).toEqual([]);
      expect(snapshot()).toEqual(before);
    });
  }

  test("/revoke: cancel di pertanyaan user_id", async () => {
    seed({ "pk-a": "active" }, { "pk-a": [OTHER_A] });
    const before = snapshot();
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-a")));
    const user = button(OTHER_A);
    await bot.handleUpdate(press(button("cancel")));
    expect(edits()[1]).toBe(pickCancelledText("revoke"));
    await bot.handleUpdate(press(user));
    expect(texts()[2]).toBe(PICK_EXPIRED);
    expect(snapshot()).toEqual(before);
  });

  test("pesan gagal diubah: tombol tetap dicopot dan pilihan dikirim sebagai pesan", async () => {
    fresh({ editMessageText: () => ({ status: 400, body: { ok: false, error_code: 400, description: "Bad Request: message can't be edited" } }) });
    seed({ "pk-a": "active" });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/stop"));
    await bot.handleUpdate(press(button("cancel")));
    expect(tg.calls.filter((c) => c.method === "editMessageReplyMarkup").map((c) => (c.params.reply_markup as any).inline_keyboard)).toEqual([[]]);
    expect(texts()[1]).toBe(pickCancelledText("stop"));
    expect(logs.some((l) => l.includes("pesan pemilih gagal diubah"))).toBe(true);
  });
});

describe("aturan tombol pemilih", () => {
  const expectExpired = (before: Record<string, string>, calls: unknown[]) => {
    expect(texts()[texts().length - 1]).toBe(PICK_EXPIRED);
    expect(PICK_EXPIRED).toContain("kedaluwarsa");
    const answers = tg.calls.filter((c) => c.method === "answerCallbackQuery");
    expect(answers[answers.length - 1]!.params.text).toBe("Kedaluwarsa");
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  };

  test("sekali pakai: ketukan kedua pada pesan yang sama kedaluwarsa, juga tombol bot lain", async () => {
    seed({ "pk-a": "active", "pk-b": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/stop"));
    const a = button("pk-a");
    const b = button("pk-b");
    await bot.handleUpdate(press(a));
    await settle();
    expect(calls).toEqual([["stop", "pk-a"]]);
    const before = snapshot();
    calls.length = 0;
    await bot.handleUpdate(press(a));
    await settle();
    expectExpired(before, calls);
    await bot.handleUpdate(press(b));
    await settle();
    expectExpired(before, calls);
    expect(status("pk-b")).toBe("active");
  });

  test("berlaku 5 menit: tepat di batas kedaluwarsa, sedetik sebelumnya masih berlaku", async () => {
    expect(DELETE_CONFIRM_MS).toBe(5 * 60_000);
    seed({ "pk-a": "active" });
    const { bot, calls, settle } = makeBot();
    const before = snapshot();
    await bot.handleUpdate(ownerDm("/stop"));
    const late = button("pk-a");
    clock = T0 + DELETE_CONFIRM_MS;
    await bot.handleUpdate(press(late));
    await settle();
    expectExpired(before, calls);
    expect(tg.calls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);

    clock = T0;
    await bot.handleUpdate(ownerDm("/stop"));
    const intime = button("pk-a");
    clock = T0 + DELETE_CONFIRM_MS - 1000;
    await bot.handleUpdate(press(intime));
    await settle();
    expect(calls).toEqual([["stop", "pk-a"]]);
  });

  test("pertanyaan user_id /revoke juga kedaluwarsa setelah 5 menit", async () => {
    seed({ "pk-a": "active" }, { "pk-a": [OTHER_A] });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/revoke"));
    await bot.handleUpdate(press(button("pk-a")));
    const before = snapshot();
    clock = T0 + DELETE_CONFIRM_MS;
    await bot.handleUpdate(press(button(OTHER_A)));
    expectExpired(before, []);
  });

  test("tombol tak dikenal: id asing, nomor di luar daftar, bentuk lain", async () => {
    seed({ "pk-a": "active" });
    const { bot, calls, settle } = makeBot();
    const before = snapshot();
    await bot.handleUpdate(press(`pick:${"ab".repeat(8)}:0`));
    expectExpired(before, calls);
    await bot.handleUpdate(ownerDm("/stop"));
    const id = button("pk-a").split(":")[1]!;
    await bot.handleUpdate(press(`pick:${id}:7`));
    await settle();
    expectExpired(before, calls);
    // Bentuk yang bukan milik pemilih: dijawab Kedaluwarsa tanpa pesan dan tanpa perubahan.
    const n = sent().length;
    for (const data of ["pick:xyz:0", `pick:${id}:-1`, `pick:${id}:100`, "pick:", "stop:pk-a"]) await bot.handleUpdate(press(data));
    await settle();
    expect(sent().length).toBe(n);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test("hanya pemilik di chat pribadinya: akun lain dan grup tidak dilayani, tombol tetap berlaku untuk pemilik", async () => {
    seed({ "pk-a": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/stop"));
    const data = button("pk-a");
    const before = snapshot();
    const n = tg.calls.length;
    await bot.handleUpdate(press(data, STRANGER, { id: STRANGER, type: "private" }));
    await bot.handleUpdate(press(data, OWNER, { id: -100123, type: "supergroup" }));
    await bot.handleUpdate(press(data, STRANGER, { id: OWNER, type: "private" }));
    await settle();
    expect(tg.calls.length).toBe(n);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
    await bot.handleUpdate(press(data));
    await settle();
    expect(calls).toEqual([["stop", "pk-a"]]);
  });

  for (const cmd of PICK_COMMANDS) {
    test(`/${cmd}: bot yang dihapus, atau didaftarkan ulang dengan nama yang sama, tidak dikenai`, async () => {
      seed({ "pk-a": "active", "pk-b": "active" }, { "pk-a": [OTHER_A] });
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      const first = button("pk-a");
      await bot.handleUpdate(ownerDm(`/${cmd}`));
      const second = button("pk-a");
      // Nama yang sama kini milik bot lain.
      const reg = readRegistry(home);
      reg.bots["pk-a"] = { ...reg.bots["pk-a"]!, telegramId: 4321, createdAt: "2026-11-15T01:02:03.000Z" };
      writeRegistry(home, reg);
      let before = snapshot();
      await bot.handleUpdate(press(first));
      await settle();
      expectExpired(before, calls);
      expect(logs.some((l) => l.includes("tombol pemilih untuk bot yang sudah tidak terdaftar atau sudah didaftarkan ulang"))).toBe(true);
      // Bot itu dihapus sama sekali.
      delete reg.bots["pk-a"];
      writeRegistry(home, reg);
      before = snapshot();
      await bot.handleUpdate(press(second));
      await settle();
      expectExpired(before, calls);
    });
  }
});

describe("yang tidak berubah", () => {
  test("/allow tanpa argumen tetap cara pakai; /keys dan /register juga", async () => {
    seed({ "pk-a": "active" });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/allow"));
    await bot.handleUpdate(ownerDm("/keys"));
    await bot.handleUpdate(ownerDm("/register"));
    expect(texts()).toEqual([ALLOW_USAGE, KEYS_USAGE, REGISTER_USAGE]);
    expect(sent().some((c) => c.params.reply_markup)).toBe(false);
  });

  test("argumen salah bentuk tetap cara pakai, tanpa tombol", async () => {
    seed({ "pk-a": "active" }, { "pk-a": [OTHER_A] });
    const before = snapshot();
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/stop pk-a pk-b"));
    await bot.handleUpdate(ownerDm("/stop PK"));
    await bot.handleUpdate(ownerDm("/revoke pk-a"));
    await bot.handleUpdate(ownerDm("/logs pk-a 99"));
    await bot.handleUpdate(ownerDm("/logs PK"));
    await bot.handleUpdate(ownerDm("/stop pk-zzz"));
    expect(texts()).toEqual([STOP_USAGE, STOP_USAGE, REVOKE_USAGE, LOGS_USAGE, LOGS_USAGE, "Bot 'pk-zzz' tidak terdaftar. Tidak ada yang dihentikan."]);
    expect(sent().some((c) => c.params.reply_markup)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  test("/list dan /quota tanpa argumen tidak menampilkan pemilih", async () => {
    seed({ "pk-a": "stopped" });
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/list"));
    await bot.handleUpdate(ownerDm("/quota"));
    expect(sent().length).toBe(2);
    expect(sent().some((c) => c.params.reply_markup)).toBe(false);
    expect(texts()[0]).toContain("pk-a");
  });

  test("/help menyebut nama boleh dikosongkan", () => {
    expect(helpText()).toContain(HELP_PICKER_NOTE);
    expect(HELP_PICKER_NOTE).toContain("Nama boleh dikosongkan");
    for (const cmd of PICK_COMMANDS) expect(HELP_PICKER_NOTE).toContain(`/${cmd}`);
    expect(HELP_PICKER_NOTE).not.toContain("/allow");
  });
});
