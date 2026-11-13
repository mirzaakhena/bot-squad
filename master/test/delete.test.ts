import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Update } from "grammy/types";
import { COMMANDS, createMasterBot, DELETE_CONFIRM_MS, DELETE_EXPIRED } from "../src/bot.ts";
import { createBotLocks } from "../src/busy.ts";
import { archiveBot, archiveStamp, markStoppedForDelete } from "../src/delete.ts";
import { reviveAndReport } from "../src/revive.ts";
import type { LaunchResult } from "../src/launch.ts";
import { readRegistry, registryPath, writeRegistry, type BotStatus } from "../src/registry.ts";
import type { StopResult } from "../src/stop.ts";
import { ME, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm, STRANGER } from "./updates.ts";

// Token palsu saja. Nama bot di file ini unik (dl-*).
const MASTER = "123456789:AAFakeMasterTokenForDeleteTests_abcdef";
const BOTTOKEN = "5010:AAFakeBotTokenForDeleteTests_bbbbbbbbbb";
const NEWTOKEN = "5011:AANewFakeTokenForDeleteTests_cccccccccc";
// 2026-11-13 09:08:07 waktu lokal.
const T0 = new Date(2026, 10, 13, 9, 8, 7).getTime();

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let logs: string[];
let clock: number;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-delete-"));
  logs = [];
  clock = T0;
  tg = startFakeTelegram(MASTER, {}, { [NEWTOKEN]: () => ok({ id: 5011, is_bot: true, first_name: "b", username: "dl_baru_bot" }) });
});
afterEach(() => {
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

const CLEAN: StopResult = { wasRunning: true, killed: [], sessionLeft: false, pidsLeft: [] };

/** Bot terdaftar beserta foldernya, seperti hasil /register plus hasil kerja bot. */
function seed(bots: Record<string, BotStatus>, withFolders = true) {
  const reg = { bots: {} as Record<string, any> };
  let id = 7100;
  for (const [name, status] of Object.entries(bots)) {
    reg.bots[name] = { telegramId: id++, username: `${name.replace(/-/g, "_")}_bot`, status, createdAt: "2026-11-13T00:00:00.000Z" };
    if (!withFolders) continue;
    const dir = join(home, "bots", name);
    mkdirSync(join(dir, "state", "inbox"), { recursive: true });
    mkdirSync(join(dir, "workspace", "proyek"), { recursive: true });
    writeFileSync(join(dir, "state", ".env"), `TELEGRAM_BOT_TOKEN=${BOTTOKEN}\n`, { mode: 0o600 });
    writeFileSync(join(dir, "state", "access.json"), `{"dmPolicy":"allowlist","allowFrom":["${OWNER}"]}\n`);
    writeFileSync(join(dir, "state", "plugin.log"), "mulai pid=1\n");
    writeFileSync(join(dir, "workspace", "proyek", "hasil.txt"), `hasil kerja ${name}\n`);
  }
  writeRegistry(home, reg);
}

function makeBot(o: { stop?: (name: string) => Promise<StopResult>; failRegistryWrite?: () => boolean; locks?: ReturnType<typeof createBotLocks>; beforeArchive?: (from: string, to: string) => void } = {}) {
  const calls: Array<["stop" | "launch", string]> = [];
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
    beforeArchive: o.beforeArchive,
    registryHooks: o.failRegistryWrite
      ? {
          beforeRename: () => {
            if (o.failRegistryWrite!()) throw new Error("disk penuh");
          },
        }
      : undefined,
    stop: async (name) => {
      calls.push(["stop", name]);
      return o.stop ? o.stop(name) : CLEAN;
    },
    launch: async (name): Promise<LaunchResult> => {
      calls.push(["launch", name]);
      return { kind: "active", pid: 4242 };
    },
    onLaunch: (p) => pending.push(p),
  });
  return { bot, calls, settle: () => Promise.all(pending) };
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
const button = (label: "Hapus" | "Batal") => buttons().find((b) => b.text === label)!.callback_data;

let nextUpdate = 900_000;
function press(data: string, from = OWNER, chat: { id: number; type: string } = { id: OWNER, type: "private" }): Update {
  return {
    update_id: nextUpdate++,
    callback_query: {
      id: `cb${nextUpdate}`,
      from: { id: from, is_bot: false, first_name: "u" },
      chat_instance: "ci",
      data,
      message: { message_id: 5, date: 0, chat: chat as any, from: { id: ME.id, is_bot: true, first_name: "m" }, text: "Hapus?" } as any,
    },
  };
}

/** Potret seluruh folder data: path relatif -> isi (folder ditandai "/"). */
function snapshot(dir = home): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out[r] = "/";
        walk(p, r);
      } else out[r] = readFileSync(p, "utf8");
    }
  };
  walk(dir, "");
  return out;
}

const ARCHIVE = () => join(home, "archive", `dl-a-${archiveStamp(new Date(T0))}`);

describe("menu", () => {
  test("/delete ada di daftar perintah", () => {
    expect(COMMANDS.map((c) => c.command)).toContain("delete");
  });
  test("cap waktu arsip YYYYMMDD-HHMMSS waktu lokal", () => {
    expect(archiveStamp(new Date(T0))).toBe("20261113-090807");
    expect(archiveStamp(new Date(2027, 0, 2, 3, 4, 5))).toBe("20270102-030405");
  });
});

describe("/delete meminta konfirmasi", () => {
  test("pertanyaan dengan tombol Hapus dan Batal; tidak ada yang berubah", async () => {
    seed({ "dl-a": "active", "dl-lain": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await settle();
    expect(calls).toEqual([]);
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toContain("Hapus bot @dl_a_bot ('dl-a')?");
    expect(buttons().map((b) => b.text)).toEqual(["Hapus", "Batal"]);
    expect(snapshot()).toEqual(before);
  });

  test("Batal: tidak ada yang berubah, tombol Hapus yang sama tidak bisa dipakai lagi", async () => {
    seed({ "dl-a": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    const yes = button("Hapus");
    await bot.handleUpdate(press(button("Batal")));
    await settle();
    expect(texts()[1]).toBe("Penghapusan 'dl-a' dibatalkan. Tidak ada yang diubah.");
    await bot.handleUpdate(press(yes));
    await settle();
    expect(texts()[2]).toBe(DELETE_EXPIRED);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
    // Tombol dihapus dari pertanyaan.
    expect(tg.calls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);
  });

  test("tombol kedaluwarsa setelah 5 menit: tidak ada yang berubah", async () => {
    seed({ "dl-a": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    clock += DELETE_CONFIRM_MS;
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(texts()[1]).toBe(DELETE_EXPIRED);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test("tombol masih berlaku sesaat sebelum 5 menit", async () => {
    seed({ "dl-a": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    clock += DELETE_CONFIRM_MS - 1;
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(calls).toEqual([["stop", "dl-a"]]);
  });

  test("tombol palsu atau dari master-bot lain: kedaluwarsa, tidak ada yang berubah", async () => {
    seed({ "dl-a": "active" });
    const before = snapshot();
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(press("del:yes:0123456789abcdef"));
    await bot.handleUpdate(press("lain"));
    await settle();
    expect(texts()).toEqual([DELETE_EXPIRED]);
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  for (const [label, from, chat] of [
    ["akun lain di DM-nya", STRANGER, { id: STRANGER, type: "private" }],
    ["pemilik di grup", OWNER, { id: -100123, type: "supergroup" }],
  ] as const) {
    test(`tombol Hapus yang sah ditekan ${label}: diabaikan, tidak ada yang berubah`, async () => {
      seed({ "dl-a": "active" });
      const before = snapshot();
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm("/delete dl-a"));
      const yes = button("Hapus");
      await bot.handleUpdate(press(yes, from, chat));
      await settle();
      expect(texts()).toHaveLength(1);
      expect(calls).toEqual([]);
      expect(snapshot()).toEqual(before);
      // Tombol aslinya tetap berlaku untuk pemilik.
      await bot.handleUpdate(press(yes));
      await settle();
      expect(calls).toEqual([["stop", "dl-a"]]);
    });
  }

  for (const [label, arg, expected] of [
    ["tanpa nama", "", "Cara pakai: /delete <nama>"],
    ["nama tak sah", "Dl-A", "Cara pakai: /delete <nama>"],
    ["path", "../dl-a", "Cara pakai: /delete <nama>"],
    ["dua nama", "dl-a dl-b", "Cara pakai: /delete <nama>"],
    ["tak terdaftar", "dl-tidak-ada", "Bot 'dl-tidak-ada' tidak terdaftar. Tidak ada yang dihapus."],
  ] as const) {
    test(`/delete ${label}: ditolak tanpa tombol`, async () => {
      seed({ "dl-a": "active" });
      const before = snapshot();
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm(`/delete ${arg}`.trim()));
      await settle();
      expect(texts()).toHaveLength(1);
      expect(texts()[0]).toContain(expected);
      expect(sent()[0]!.params.reply_markup).toBeUndefined();
      expect(calls).toEqual([]);
      expect(snapshot()).toEqual(before);
    });
  }
});

describe("/delete setelah dikonfirmasi", () => {
  test("bot dimatikan, dihapus dari registry, folder dipindah utuh ke arsip tanpa token", async () => {
    seed({ "dl-a": "active", "dl-lain": "active" });
    const ino = statSync(join(home, "bots", "dl-a", "workspace", "proyek", "hasil.txt")).ino;
    let atMove: { envGone: boolean; srcHasAll: boolean; to: string } | undefined;
    const { bot, calls, settle } = makeBot({
      beforeArchive: (from, to) => {
        atMove = {
          envGone: !existsSync(join(from, "state", ".env")),
          srcHasAll: existsSync(join(from, "workspace", "proyek", "hasil.txt")) && existsSync(join(from, "state", "access.json")),
          to,
        };
      },
    });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(calls).toEqual([["stop", "dl-a"]]);
    // Token dihapus sebelum folder dipindah, dan saat itu folder masih utuh di tempatnya.
    expect(atMove).toEqual({ envGone: true, srcHasAll: true, to: ARCHIVE() });

    const reg = readRegistry(home).bots;
    expect(Object.hasOwn(reg, "dl-a")).toBe(false);
    expect(reg["dl-lain"]!.status).toBe("active");
    expect(existsSync(join(home, "bots", "dl-a"))).toBe(false);
    expect(existsSync(join(home, "bots", "dl-lain", "state", ".env"))).toBe(true);

    const arch = ARCHIVE();
    expect(snapshot(arch)).toEqual({
      state: "/",
      "state/inbox": "/",
      "state/access.json": `{"dmPolicy":"allowlist","allowFrom":["${OWNER}"]}\n`,
      "state/plugin.log": "mulai pid=1\n",
      workspace: "/",
      "workspace/proyek": "/",
      "workspace/proyek/hasil.txt": "hasil kerja dl-a\n",
    });
    // Dipindah (rename), bukan disalin.
    expect(statSync(join(arch, "workspace", "proyek", "hasil.txt")).ino).toBe(ino);
    expect(statSync(join(home, "archive")).mode & 0o777).toBe(0o700);
    // Token tidak ada di mana pun di arsip.
    expect(JSON.stringify(snapshot(join(home, "archive")))).not.toContain(BOTTOKEN);

    const t = texts();
    expect(t[1]).toBe("Menghapus 'dl-a'...");
    expect(t[2]).toContain("@dl_a_bot ('dl-a') dihapus dari daftar bot.");
    expect(t[2]).toContain(`<code>${arch}</code>`);
    expect(t[2]).toContain("Token tidak ikut diarsipkan");
    expect(t[2]).toContain("@BotFather");
    expect(logs.join("\n")).toContain(`/delete 'dl-a': dihapus, arsip ${arch}`);
  });

  test("nama yang sudah dihapus bisa didaftarkan lagi", async () => {
    seed({ "dl-a": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    await bot.handleUpdate(ownerDm(`/register dl-a ${NEWTOKEN}`));
    await settle();
    expect(texts().some((t) => t.includes("Bot @dl_baru_bot terdaftar sebagai 'dl-a'."))).toBe(true);
    expect(calls).toEqual([
      ["stop", "dl-a"],
      ["launch", "dl-a"],
    ]);
    expect(readRegistry(home).bots["dl-a"]!.username).toBe("dl_baru_bot");
    expect(readFileSync(join(home, "bots", "dl-a", "state", ".env"), "utf8")).toBe(`TELEGRAM_BOT_TOKEN=${NEWTOKEN}\n`);
    // Arsip yang lama tetap utuh.
    expect(readFileSync(join(ARCHIVE(), "workspace", "proyek", "hasil.txt"), "utf8")).toBe("hasil kerja dl-a\n");
  });

  test("dua penghapusan di detik yang sama: arsip kedua diberi akhiran, yang pertama tidak tertimpa", async () => {
    seed({ "dl-a": "active" });
    await archiveBot("dl-a", { dataDir: home, now: () => new Date(T0) });
    seed({ "dl-a": "active" });
    writeFileSync(join(home, "bots", "dl-a", "workspace", "proyek", "hasil.txt"), "kedua\n");
    const r = await archiveBot("dl-a", { dataDir: home, now: () => new Date(T0) });
    expect(r).toEqual({ ok: true, archivedTo: `${ARCHIVE()}-2` });
    expect(readFileSync(join(ARCHIVE(), "workspace", "proyek", "hasil.txt"), "utf8")).toBe("hasil kerja dl-a\n");
    expect(readFileSync(join(`${ARCHIVE()}-2`, "workspace", "proyek", "hasil.txt"), "utf8")).toBe("kedua\n");
  });

  /** Potret yang diharapkan setelah hanya status bot itu yang diubah menjadi 'stopped'. */
  function withStopped(before: Record<string, string>, name: string): Record<string, unknown> {
    const reg = JSON.parse(before["registry.json"]!);
    reg.bots[name].status = "stopped";
    return { ...before, "registry.json": reg };
  }
  /** Potret sekarang, dengan registry.json sebagai objek supaya bisa dibandingkan dengan withStopped. */
  const snapshotParsed = () => {
    const s = snapshot();
    return { ...s, "registry.json": JSON.parse(s["registry.json"]!) };
  };

  for (const prev of ["active", "registered", "failed", "stopped"] as const) {
    test(`bot (${prev}) tidak bisa dimatikan bersih: folder dan entri tetap, status 'stopped', saran /restart dan /delete`, async () => {
      for (const [i, res] of [
        { ...CLEAN, pidsLeft: [555] },
        { ...CLEAN, sessionLeft: true },
        { ...CLEAN, error: "ps keluar dengan kode 1" },
      ].entries()) {
        const name = `dl-u${i}`;
        seed({ [name]: prev, "dl-lain": "active" });
        const before = snapshot();
        let atStop: string | undefined;
        const { bot, settle } = makeBot({
          stop: async (n) => {
            atStop = readRegistry(home).bots[n]!.status;
            return res;
          },
        });
        await bot.handleUpdate(ownerDm(`/delete ${name}`));
        await bot.handleUpdate(press(button("Hapus")));
        await settle();
        // Status sudah 'stopped' saat bot dihentikan (Q1).
        expect(atStop).toBe("stopped");
        expect(snapshotParsed()).toEqual(withStopped(before, name));
        expect(readRegistry(home).bots["dl-lain"]!.status).toBe("active");
        const last = texts()[texts().length - 1]!;
        expect(last).toContain(`('${name}') tidak dihapus: bot tidak bisa dimatikan bersih`);
        expect(last).toContain("status tercatat 'stopped'");
        expect(last).toContain(`/restart ${name}`);
        expect(last).toContain(`/delete ${name}`);
      }
    });
  }

  test("stop melempar error: tidak dihapus, status 'stopped'", async () => {
    seed({ "dl-a": "active" });
    const before = snapshot();
    const { bot, settle } = makeBot({ stop: async () => { throw new Error("boom"); } });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(snapshotParsed()).toEqual(withStopped(before, "dl-a"));
    expect(texts()[2]).toContain("tidak dihapus");
    expect(texts()[2]).toContain("/restart dl-a");
  });

  test("status 'stopped' gagal dicatat: batal sebelum bot dihentikan, tidak ada yang diubah", async () => {
    seed({ "dl-a": "active" });
    const { bot, calls, settle } = makeBot({ failRegistryWrite: () => true });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    const before = snapshot();
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(texts()[1]).toBe("Menghapus 'dl-a'...");
    expect(texts()[2]).toContain("('dl-a') tidak dihapus: status 'stopped' gagal dicatat di daftar bot (registry.json gagal ditulis");
    expect(texts()[2]).toContain("Tidak ada yang diubah: bot tidak dihentikan");
    expect(logs.join("\n")).toContain("/delete 'dl-a' batal: status 'stopped' gagal dicatat");
  });

  test("markStoppedForDelete: registry rusak, entri hilang, atau identitas lain: tidak ada yang diubah", async () => {
    seed({ "dl-a": "active" });
    const id = { telegramId: 7100, createdAt: "2026-11-13T00:00:00.000Z" };
    const before = snapshot();
    expect((await markStoppedForDelete("dl-a", { dataDir: home, expect: { ...id, telegramId: 9999 } })).ok).toBe(false);
    expect((await markStoppedForDelete("dl-a", { dataDir: home, expect: { ...id, createdAt: "lain" } })).ok).toBe(false);
    expect((await markStoppedForDelete("dl-x", { dataDir: home })).ok).toBe(false);
    expect(snapshot()).toEqual(before);
    writeFileSync(registryPath(home), "{rusak");
    const r = await markStoppedForDelete("dl-a", { dataDir: home, expect: id });
    expect(r.ok).toBe(false);
    expect(readFileSync(registryPath(home), "utf8")).toBe("{rusak");
    seed({ "dl-a": "active" });
    expect(await markStoppedForDelete("dl-a", { dataDir: home, expect: id })).toEqual({ ok: true });
    expect(readRegistry(home).bots["dl-a"]!.status).toBe("stopped");
  });

  test("registry gagal ditulis: folder sudah diarsipkan, entri tetap; /delete lagi menyelesaikannya", async () => {
    seed({ "dl-a": "active" });
    let fail = true;
    // Tulisan pertama (status 'stopped') berhasil; yang gagal penghapusan entri.
    let writes = 0;
    const { bot, settle } = makeBot({ failRegistryWrite: () => fail && ++writes > 1 });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(Object.hasOwn(readRegistry(home).bots, "dl-a")).toBe(true);
    expect(existsSync(join(home, "bots", "dl-a"))).toBe(false);
    expect(existsSync(join(ARCHIVE(), "workspace", "proyek", "hasil.txt"))).toBe(true);
    expect(texts()[2]).toContain("gagal dihapus: entri registry gagal dihapus");
    expect(texts()[2]).toContain(`<code>${ARCHIVE()}</code>`);

    fail = false;
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(Object.hasOwn(readRegistry(home).bots, "dl-a")).toBe(false);
    expect(texts()[texts().length - 1]).toContain("Folder bot memang sudah tidak ada di disk");
    expect(readdirSync(join(home, "archive"))).toEqual([`dl-a-${archiveStamp(new Date(T0))}`]);
  });

  test("folder gagal dipindah: token sudah dihapus, entri dan folder tetap, laporan menyebutnya", async () => {
    seed({ "dl-a": "active" });
    const { bot, settle } = makeBot({
      beforeArchive: () => {
        throw Object.assign(new Error("tidak boleh"), { code: "EACCES" });
      },
    });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(Object.hasOwn(readRegistry(home).bots, "dl-a")).toBe(true);
    expect(existsSync(join(home, "bots", "dl-a", "workspace", "proyek", "hasil.txt"))).toBe(true);
    expect(existsSync(join(home, "bots", "dl-a", "state", ".env"))).toBe(false);
    expect(texts()[2]).toContain("folder gagal dipindah ke arsip (EACCES)");
    expect(texts()[2]).toContain("Token di state/.env sudah dihapus");
  });

  test("bots/<nama> berupa symlink: ditolak, tidak ada yang diubah, target tidak disentuh", async () => {
    seed({ "dl-a": "active" }, false);
    const target = mkdtempSync(join(tmpdir(), "bot-squad-delete-target-"));
    try {
      writeFileSync(join(target, "jangan.txt"), "x");
      mkdirSync(join(home, "bots"), { recursive: true });
      const { symlinkSync } = await import("node:fs");
      symlinkSync(target, join(home, "bots", "dl-a"));
      const r = await archiveBot("dl-a", { dataDir: home });
      expect(r.ok).toBe(false);
      expect(lstatSync(join(home, "bots", "dl-a")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(target, "jangan.txt"), "utf8")).toBe("x");
      expect(Object.hasOwn(readRegistry(home).bots, "dl-a")).toBe(true);
      expect(existsSync(join(home, "archive"))).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("tombol lama setelah nama dihapus lalu didaftarkan ulang: bot baru tidak disentuh", async () => {
    seed({ "dl-a": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    const old = button("Hapus");
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    await bot.handleUpdate(ownerDm(`/register dl-a ${NEWTOKEN}`));
    await settle();
    const before = snapshot();
    const n = texts().length;
    await bot.handleUpdate(press(old));
    await settle();
    expect(calls).toEqual([
      ["stop", "dl-a"],
      ["launch", "dl-a"],
    ]);
    expect(texts().slice(n)).toEqual([DELETE_EXPIRED]);
    expect(snapshot()).toEqual(before);
    expect(readRegistry(home).bots["dl-a"]!.username).toBe("dl_baru_bot");
    expect(readFileSync(join(home, "bots", "dl-a", "state", ".env"), "utf8")).toBe(`TELEGRAM_BOT_TOKEN=${NEWTOKEN}\n`);
  });

  test("setelah bot dihapus, tombol lain untuk bot itu kedaluwarsa", async () => {
    seed({ "dl-a": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    const other = button("Hapus");
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    await bot.handleUpdate(press(other));
    await settle();
    expect(calls).toEqual([["stop", "dl-a"]]);
    expect(texts()[texts().length - 1]).toBe(DELETE_EXPIRED);
  });

  for (const [label, change] of [
    ["telegramId lain (token bot lain)", { telegramId: 9999 }],
    ["createdAt lain (token sama didaftarkan ulang)", { createdAt: "2026-11-13T05:00:00.000Z" }],
  ] as const) {
    test(`entri registry diganti saat tombol masih berlaku (${label}): tidak ada yang berubah`, async () => {
      seed({ "dl-a": "active" });
      const { bot, calls, settle } = makeBot();
      await bot.handleUpdate(ownerDm("/delete dl-a"));
      const reg = readRegistry(home);
      reg.bots["dl-a"] = { ...reg.bots["dl-a"]!, ...change };
      writeRegistry(home, reg);
      const before = snapshot();
      await bot.handleUpdate(press(button("Hapus")));
      await settle();
      expect(calls).toEqual([]);
      expect(texts()[texts().length - 1]).toBe(DELETE_EXPIRED);
      expect(snapshot()).toEqual(before);
    });

    test(`archiveBot dengan identitas yang tidak cocok (${label}): tidak ada yang berubah`, async () => {
      seed({ "dl-a": "active" });
      const reg = readRegistry(home);
      const expect0 = { telegramId: reg.bots["dl-a"]!.telegramId, createdAt: reg.bots["dl-a"]!.createdAt };
      reg.bots["dl-a"] = { ...reg.bots["dl-a"]!, ...change };
      writeRegistry(home, reg);
      const before = snapshot();
      const r = await archiveBot("dl-a", { dataDir: home, expect: expect0 });
      expect(r.ok).toBe(false);
      expect(snapshot()).toEqual(before);
    });
  }

  test("entri hilang dari registry saat tombol masih berlaku: 'tidak terdaftar', tidak ada yang berubah", async () => {
    seed({ "dl-a": "active" });
    const { bot, calls, settle } = makeBot();
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    writeRegistry(home, { bots: {} });
    const before = snapshot();
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    expect(calls).toEqual([]);
    expect(texts()[texts().length - 1]).toContain("Bot 'dl-a' tidak terdaftar.");
    expect(snapshot()).toEqual(before);
  });
});

describe("bot yang sedang diproses", () => {
  function gate<T>() {
    let open!: (v: T) => void;
    const p = new Promise<T>((r) => (open = r));
    return { p, open };
  }

  test("/delete dan tombol Hapus saat bot sedang dinyalakan ulang: ditolak", async () => {
    seed({ "dl-a": "active" });
    const locks = createBotLocks();
    const before = snapshot();
    const { bot, calls, settle } = makeBot({ locks });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    const yes = button("Hapus");
    const release = locks.claim("dl-a", "dinyalakan ulang")!;
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(yes));
    await settle();
    expect(texts()[1]).toBe("'dl-a' sedang dinyalakan ulang, coba lagi setelah selesai.");
    expect(texts()[2]).toBe("'dl-a' sedang dinyalakan ulang, coba lagi setelah selesai.");
    expect(calls).toEqual([]);
    expect(snapshot()).toEqual(before);
    release();
  });

  test("/stop dan /restart saat bot sedang dihapus: ditolak", async () => {
    seed({ "dl-a": "active" });
    const g = gate<StopResult>();
    const { bot, calls, settle } = makeBot({ stop: () => g.p });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await bot.handleUpdate(ownerDm("/stop dl-a"));
    await bot.handleUpdate(ownerDm("/restart dl-a"));
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    expect(texts().slice(2)).toEqual([
      "'dl-a' sedang dihapus, coba lagi setelah selesai.",
      "'dl-a' sedang dihapus, coba lagi setelah selesai.",
      "'dl-a' sedang dihapus, coba lagi setelah selesai.",
    ]);
    g.open(CLEAN);
    await settle();
    expect(calls).toEqual([["stop", "dl-a"]]);
    expect(Object.hasOwn(readRegistry(home).bots, "dl-a")).toBe(false);
  });
});

describe("master-bot mati mendadak di tengah penghapusan (tiket 261113190701)", () => {
  /**
   * Master-bot yang menyala lagi di folder data yang sama: penyalaan otomatis
   * dengan kunci baru dan launch tiruan, membaca registry seperti yang
   * ditinggalkan proses yang mati.
   */
  async function restartMaster() {
    const launched: string[] = [];
    const summary: string[] = [];
    await reviveAndReport({
      dataDir: home,
      locks: createBotLocks(),
      log: (m) => logs.push(m),
      probe: { tmux: { hasSession: async () => false } as any, isAlive: () => false },
      launch: async (name) => {
        launched.push(name);
        return { kind: "active", pid: 4242 };
      },
      retry: { sleep: async () => {} },
      send: async (text) => {
        summary.push(text);
      },
    });
    return { launched, summary };
  }

  for (const prev of ["active", "registered"] as const) {
    test(`bot (${prev}) sudah dihentikan, belum diarsipkan: tidak dinyalakan lagi, ringkasan menyebutnya dihentikan`, async () => {
      seed({ "dl-a": prev, "dl-lain": prev });
      // Bot sudah mati, lalu master-bot mati sebelum langkah berikutnya:
      // stop tidak pernah kembali, jadi arsip dan registry tidak disentuh lagi.
      let stopped = false;
      const { bot, calls } = makeBot({
        stop: () => {
          stopped = true;
          return new Promise<StopResult>(() => {});
        },
      });
      await bot.handleUpdate(ownerDm("/delete dl-a"));
      await bot.handleUpdate(press(button("Hapus")));
      for (let i = 0; !stopped; i++) {
        if (i > 200) throw new Error("stop tidak dipanggil");
        await Bun.sleep(5);
      }
      expect(calls).toEqual([["stop", "dl-a"]]);
      expect(existsSync(join(home, "bots", "dl-a", "state", ".env"))).toBe(true);

      const { launched, summary } = await restartMaster();
      expect(launched).toEqual(["dl-lain"]);
      expect(readRegistry(home).bots["dl-a"]!.status).toBe("stopped");
      expect(summary).toHaveLength(1);
      expect(summary[0]).toContain("Dibiarkan:\n- @dl_a_bot ('dl-a'): dihentikan pemilik. Nyalakan dengan /restart dl-a");
      expect(summary[0]).toContain("Dinyalakan ulang:\n- @dl_lain_bot ('dl-lain')");
    });
  }

  test("mati tepat sebelum folder dipindah (token sudah dihapus): tidak dinyalakan lagi", async () => {
    seed({ "dl-a": "active" });
    let atMove: string | undefined;
    const { bot, settle } = makeBot({
      beforeArchive: () => {
        // Keadaan di disk saat proses mati di titik ini.
        atMove = readFileSync(registryPath(home), "utf8");
        throw new Error("master-bot mati");
      },
    });
    await bot.handleUpdate(ownerDm("/delete dl-a"));
    await bot.handleUpdate(press(button("Hapus")));
    await settle();
    writeFileSync(registryPath(home), atMove!);
    const { launched, summary } = await restartMaster();
    expect(launched).toEqual([]);
    expect(summary[0]).toContain("('dl-a'): dihentikan pemilik");
  });
});
