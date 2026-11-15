import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Update } from "grammy/types";
import { createMasterBot, DELETE_CONFIRM_MS, DELETE_EXPIRED, NEW_EXPIRED, NEW_USAGE, newQuestion } from "../src/bot.ts";
import { createBotLocks } from "../src/busy.ts";
import type { ConversationMode, LaunchResult } from "../src/launch.ts";
import { readRegistry, registryPath, writeRegistry, type BotStatus } from "../src/registry.ts";
import type { StopResult } from "../src/stop.ts";
import { ME, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm, STRANGER } from "./updates.ts";

// Tiket 261115202401: /new <nama> memulai percakapan kosong setelah
// dikonfirmasi, dengan aturan tombol yang sama seperti /delete.
// Token palsu saja. Nama bot di file ini unik (nw-*).
const MASTER = "123456789:AAFakeMasterTokenForNewTests_abcdefghi";
const BOTTOKEN = "5020:AAFakeBotTokenForNewTests_bbbbbbbbbbbbb";
const NEWTOKEN = "5021:AANewFakeTokenForNewTests_ccccccccccccc";
const T0 = new Date(2026, 10, 15, 9, 8, 7).getTime();

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let logs: string[];
let clock: number;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-new-"));
  logs = [];
  clock = T0;
  tg = startFakeTelegram(MASTER, {}, { [NEWTOKEN]: () => ok({ id: 5021, is_bot: true, first_name: "b", username: "nw_baru_bot" }) });
});
afterEach(() => {
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

const CLEAN: StopResult = { wasRunning: true, killed: [], sessionLeft: false, pidsLeft: [] };

function seed(bots: Record<string, BotStatus>) {
  const reg = { bots: {} as Record<string, any> };
  let id = 7200;
  for (const [name, status] of Object.entries(bots)) {
    reg.bots[name] = { telegramId: id++, username: `${name.replace(/-/g, "_")}_bot`, status, createdAt: "2026-11-13T00:00:00.000Z" };
    const dir = join(home, "bots", name);
    mkdirSync(join(dir, "state"), { recursive: true });
    mkdirSync(join(dir, "workspace"), { recursive: true });
    writeFileSync(join(dir, "state", ".env"), `TELEGRAM_BOT_TOKEN=${BOTTOKEN}\n`, { mode: 0o600 });
    writeFileSync(join(dir, "workspace", "hasil.txt"), `hasil kerja ${name}\n`);
  }
  writeRegistry(home, reg);
}

function makeBot(o: { stop?: (name: string) => Promise<StopResult>; launch?: (name: string) => Promise<LaunchResult>; locks?: ReturnType<typeof createBotLocks> } = {}) {
  const calls: Array<["stop" | "launch", string]> = [];
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
    locks: o.locks,
    stop: async (name) => {
      calls.push(["stop", name]);
      return o.stop ? o.stop(name) : CLEAN;
    },
    launch: async (name, mode) => {
      calls.push(["launch", name]);
      modes.push(mode);
      return o.launch ? o.launch(name) : { kind: "active", pid: 4242, conversation: mode === "new" ? { kind: "new", why: "requested" } : { kind: "continued" } };
    },
    onLaunch: (p) => pending.push(p),
  });
  return { bot, calls, modes, settle: () => Promise.all(pending) };
}

const sent = () => tg.calls.filter((c) => c.method === "sendMessage");
const texts = () => sent().map((c) => String(c.params.text));

/** Tombol di pertanyaan konfirmasi terakhir. */
function buttons(): Array<{ text: string; callback_data: string }> {
  const withKb = sent().filter((c) => c.params.reply_markup);
  const last = withKb[withKb.length - 1];
  if (!last) throw new Error("tidak ada pertanyaan konfirmasi");
  return (last.params.reply_markup as any).inline_keyboard[0];
}
const button = (label: string) => buttons().find((b) => b.text === label)!.callback_data;

let nextUpdate = 950_000;
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

describe("/new meminta konfirmasi", () => {
  test("pertanyaan dengan tombol lanjut dan batal; tidak ada yang berubah", async () => {
    seed({ "nw-a": "active", "nw-lain": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-a"));
    await settle();
    expect(calls).toEqual([]);
    expect(texts()).toEqual([newQuestion("nw-a", "nw_a_bot")]);
    expect(texts()[0]).toContain("Mulai percakapan baru di bot @nw_a_bot ('nw-a')?");
    expect(sent()[0]!.params.parse_mode).toBe("HTML");
    expect(buttons().map((b) => b.text)).toEqual(["Mulai baru", "Batal"]);
    for (const b of buttons()) expect(b.callback_data).toMatch(/^new:(yes|no):[0-9a-f]{16}$/);
    expect(snapshot()).toEqual(before);
  });

  test("Batal: tidak ada yang berubah, tombol lanjut yang sama tidak bisa dipakai lagi", async () => {
    seed({ "nw-a": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-a"));
    const yes = button("Mulai baru");
    await bot.handleUpdate(press(button("Batal")));
    await settle();
    expect(texts()[1]).toBe("Percakapan baru untuk 'nw-a' dibatalkan. Tidak ada yang diubah.");
    expect(tg.calls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);
    await bot.handleUpdate(press(yes));
    await settle();
    expect(texts()[2]).toBe(NEW_EXPIRED);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });
});

describe("/new setelah dikonfirmasi", () => {
  for (const from of ["active", "failed", "stopped", "registered"] as const) {
    test(`bot berstatus ${from}: dihentikan, dinyalakan dengan mode new, 'Percakapan baru dimulai.', status active`, async () => {
      seed({ "nw-b": from, "nw-lain": "failed" });
      const { bot, calls, modes, settle } = makeBot();
      await bot.handleUpdate(ownerDm("/new nw-b"));
      await bot.handleUpdate(press(button("Mulai baru")));
      await settle();
      expect(calls).toEqual([["stop", "nw-b"], ["launch", "nw-b"]]);
      expect(modes).toEqual(["new"]);
      const t = texts();
      expect(t).toHaveLength(3);
      expect(t[1]).toBe("Menyalakan ulang 'nw-b' dengan percakapan baru...");
      expect(t[2]).toContain("@nw_b_bot ('nw-b') aktif.");
      expect(t[2]).toContain("Percakapan baru dimulai.");
      expect(t[2]).not.toContain("dilanjutkan");
      expect(status("nw-b")).toBe("active");
      expect(status("nw-lain")).toBe("failed");
      expect(tg.calls.some((c) => c.method === "answerCallbackQuery")).toBe(true);
      expect(tg.calls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);
    });
  }

  test("hasil tanpa keterangan percakapan: laporan tetap menyebut percakapan baru", async () => {
    seed({ "nw-b": "active" });
    const { bot, settle } = makeBot({ launch: async () => ({ kind: "active", pid: 1 }) });
    await bot.handleUpdate(ownerDm("/new nw-b"));
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(texts()[2]).toContain("Percakapan baru dimulai.");
  });

  test("gagal menyala: laporan gagal biasa tanpa kalimat percakapan, status failed", async () => {
    seed({ "nw-b": "active" });
    const { bot, settle } = makeBot({ launch: async () => ({ kind: "failed", reason: "x", sessionAlive: false }) });
    await bot.handleUpdate(ownerDm("/new nw-b"));
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(texts()[2]).toContain("gagal dinyalakan: x.");
    expect(texts()[2]).not.toContain("Percakapan");
    expect(texts()[2]).toContain("Coba lagi dengan /restart nw-b");
    expect(status("nw-b")).toBe("failed");
  });

  test("bot lama tidak bersih dimatikan: tidak dinyalakan, status tidak diubah", async () => {
    seed({ "nw-b": "active" });
    const { bot, calls, settle } = makeBot({ stop: async () => ({ wasRunning: true, killed: [], sessionLeft: true, pidsLeft: [] }) });
    await bot.handleUpdate(ownerDm("/new nw-b"));
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(calls).toEqual([["stop", "nw-b"]]);
    expect(texts()[2]).toContain("tidak dinyalakan ulang: bot lama tidak bisa dimatikan bersih");
    expect(status("nw-b")).toBe("active");
    expect(logs).toContain("/new 'nw-b' batal: bot lama tidak bersih dimatikan");
  });

  test("bot bernama 'new' bisa diberi percakapan baru", async () => {
    seed({ new: "active" });
    const { bot, calls, modes, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new new"));
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(calls).toEqual([["stop", "new"], ["launch", "new"]]);
    expect(modes).toEqual(["new"]);
  });
});

describe("tombol /new: sekali pakai, 5 menit, hanya pemilik, terikat pada bot", () => {
  test("sekali pakai: tekanan kedua pada tombol lanjut dijawab kedaluwarsa", async () => {
    seed({ "nw-c": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-c"));
    const yes = button("Mulai baru");
    await bot.handleUpdate(press(yes));
    await settle();
    await bot.handleUpdate(press(yes));
    await settle();
    expect(calls).toEqual([["stop", "nw-c"], ["launch", "nw-c"]]);
    expect(texts().at(-1)).toBe(NEW_EXPIRED);
  });

  test("kedaluwarsa tepat 5 menit: tidak ada yang berubah", async () => {
    seed({ "nw-c": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-c"));
    clock += DELETE_CONFIRM_MS;
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(texts()[1]).toBe(NEW_EXPIRED);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test("masih berlaku sesaat sebelum 5 menit", async () => {
    seed({ "nw-c": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-c"));
    clock += DELETE_CONFIRM_MS - 1;
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(calls).toEqual([["stop", "nw-c"], ["launch", "nw-c"]]);
  });

  test("tombol tak dikenal: kedaluwarsa, tidak ada yang berubah", async () => {
    seed({ "nw-c": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(press("new:yes:0123456789abcdef"));
    await bot.handleUpdate(press("new:no:0123456789abcdef"));
    await bot.handleUpdate(press("new:yes:bukan-id"));
    await settle();
    expect(texts()).toEqual([NEW_EXPIRED, NEW_EXPIRED]);
    expect(tg.calls.filter((c) => c.method === "answerCallbackQuery")).toHaveLength(3);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test("id tombol /new tidak berlaku sebagai tombol /delete, dan sebaliknya", async () => {
    seed({ "nw-c": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-c"));
    const newId = button("Mulai baru").split(":")[2]!;
    await bot.handleUpdate(ownerDm("/delete nw-c"));
    const delId = button("Hapus").split(":")[2]!;
    await bot.handleUpdate(press(`del:yes:${newId}`));
    await bot.handleUpdate(press(`new:yes:${delId}`));
    await settle();
    expect(texts().slice(2)).toEqual([DELETE_EXPIRED, NEW_EXPIRED]);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  for (const [label, from, chat] of [
    ["akun lain di DM-nya", STRANGER, { id: STRANGER, type: "private" }],
    ["akun lain di chat ber-ID pemilik", STRANGER, { id: OWNER, type: "private" }],
    ["pemilik di grup", OWNER, { id: -100123, type: "supergroup" }],
  ] as const) {
    test(`tombol ditekan oleh ${label}: dibuang, tidak ada yang berubah, tombol tetap berlaku untuk pemilik`, async () => {
      seed({ "nw-c": "active" });
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm("/new nw-c"));
      const yes = button("Mulai baru");
      const before = snapshot();
      const n = tg.calls.length;
      await bot.handleUpdate(press(yes, from, chat));
      await settle();
      expect(tg.calls.length).toBe(n);
      expect(calls).toEqual([]);
      expect(snapshot()).toEqual(before);
      expect(logs.at(-1)).toStartWith("update diabaikan dari ");
      await bot.handleUpdate(press(yes));
      await settle();
      expect(calls).toEqual([["stop", "nw-c"], ["launch", "nw-c"]]);
    });
  }

  test("tombol lama setelah nama dihapus lalu didaftarkan ulang: bot baru tidak disentuh", async () => {
    seed({ "nw-d": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-d"));
    const old = button("Mulai baru");
    await bot.handleUpdate(ownerDm("/delete nw-d"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    await bot.handleUpdate(ownerDm(`/register nw-d ${NEWTOKEN}`));
    await settle();
    expect(readRegistry(home).bots["nw-d"]!.username).toBe("nw_baru_bot");
    const before = snapshot();
    const n = texts().length;
    const c = calls.length;
    await bot.handleUpdate(press(old));
    await settle();
    expect(calls.length).toBe(c);
    expect(texts().slice(n)).toEqual([NEW_EXPIRED]);
    expect(snapshot()).toEqual(before);
  });

  for (const [label, change] of [
    ["telegramId lain", { telegramId: 9999 }],
    ["createdAt lain", { createdAt: "2026-11-15T05:00:00.000Z" }],
  ] as const) {
    test(`entri registry diganti saat tombol masih berlaku (${label}): tidak ada yang berubah`, async () => {
      seed({ "nw-d": "active" });
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm("/new nw-d"));
      const reg = readRegistry(home);
      reg.bots["nw-d"] = { ...reg.bots["nw-d"]!, ...change };
      writeRegistry(home, reg);
      const before = snapshot();
      await bot.handleUpdate(press(button("Mulai baru")));
      await settle();
      expect(calls).toEqual([]);
      expect(texts().at(-1)).toBe(NEW_EXPIRED);
      expect(snapshot()).toEqual(before);
    });
  }

  test("bot dihapus dari registry sebelum tombol ditekan: 'tidak terdaftar'", async () => {
    seed({ "nw-d": "active", "nw-e": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-d"));
    const reg = readRegistry(home);
    delete reg.bots["nw-d"];
    writeRegistry(home, reg);
    await bot.handleUpdate(press(button("Mulai baru")));
    await settle();
    expect(calls).toEqual([]);
    expect(texts().at(-1)).toBe("Bot 'nw-d' tidak terdaftar. Tidak ada yang dinyalakan ulang.");
  });
});

describe("/new ditolak seperti /restart", () => {
  for (const [label, arg] of [
    ["tanpa nama", ""],
    ["nama tak sah", "Nw-F"],
    ["path", "../nw-f"],
    ["dua kata", "nw-f nw-g"],
    ["nama lalu new", "nw-f new"],
  ] as const) {
    test(`/new ${label}: cara pakai, tanpa tombol`, async () => {
      seed({ "nw-f": "active" });
      const before = snapshot();
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm(`/new ${arg}`.trim()));
      await settle();
      expect(calls).toEqual([]);
      expect(texts()).toEqual([NEW_USAGE]);
      expect(sent()[0]!.params.reply_markup).toBeUndefined();
      expect(snapshot()).toEqual(before);
    });
  }

  test("nama tidak terdaftar: ditolak tanpa tombol", async () => {
    seed({ "nw-f": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-tidak-ada"));
    await settle();
    expect(calls).toEqual([]);
    expect(texts()).toEqual(["Bot 'nw-tidak-ada' tidak terdaftar. Tidak ada yang dinyalakan ulang."]);
    expect(sent()[0]!.params.reply_markup).toBeUndefined();
  });

  test("registry rusak: ditolak dengan alasan", async () => {
    await Bun.write(registryPath(home), "{rusak");
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/new nw-f"));
    await settle();
    expect(calls).toEqual([]);
    expect(texts()[0]).toContain("registry.json rusak");
  });

  for (const label of ["dinyalakan", "dinyalakan ulang", "dihentikan", "dihapus", "dikirimi tombol"] as const) {
    test(`bot sedang ${label}: /new ditolak tanpa tombol, juga tombol yang sudah ada`, async () => {
      seed({ "nw-g": "active" });
      const locks = createBotLocks();
      const { bot, calls, settle } = makeBot({ locks });
      // Tombol dibuat saat bot masih bebas.
      await bot.handleUpdate(ownerDm("/new nw-g"));
      const yes = button("Mulai baru");
      const release = locks.claim("nw-g", label)!;
      await bot.handleUpdate(ownerDm("/new nw-g"));
      expect(texts().at(-1)).toBe(`'nw-g' sedang ${label}, coba lagi setelah selesai.`);
      expect(sent().at(-1)!.params.reply_markup).toBeUndefined();
      await bot.handleUpdate(press(yes));
      await settle();
      expect(texts().at(-1)).toBe(`'nw-g' sedang ${label}, coba lagi setelah selesai.`);
      expect(calls).toEqual([]);
      release();
    });
  }

  test("selama /new berjalan, /restart, /stop, dan /new untuk bot itu ditolak", async () => {
    seed({ "nw-h": "active" });
    let finish!: (r: LaunchResult) => void;
    const { bot, calls, settle } = makeBot({ launch: () => new Promise((r) => (finish = r)) });
    await bot.handleUpdate(ownerDm("/new nw-h"));
    await bot.handleUpdate(press(button("Mulai baru")));
    await Bun.sleep(10);
    for (const cmd of ["/restart nw-h", "/stop nw-h", "/new nw-h"]) {
      await bot.handleUpdate(ownerDm(cmd));
      expect(texts().at(-1)).toBe("'nw-h' sedang dinyalakan ulang, coba lagi setelah selesai.");
    }
    finish({ kind: "active", pid: 1 });
    await settle();
    expect(calls.filter((c) => c[0] === "launch")).toHaveLength(1);
  });
});
