import { describe, expect, test } from "bun:test";
import { isOwnerUpdate } from "../src/access.ts";
import { createMasterBot } from "../src/bot.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { ignoredUpdates, OWNER, ownerDm } from "./updates.ts";

const TOKEN = "123456789:AAFakeTokenForTestsOnly_abcdefghijklmn";

function setup() {
  const tg = startFakeTelegram(TOKEN);
  const logs: string[] = [];
  const bot = createMasterBot({
    token: TOKEN,
    ownerId: OWNER,
    log: (m) => logs.push(m),
    client: { apiRoot: tg.apiRoot },
    botInfo: ME,
    // Tes ini tidak pernah menulis data; folder ini tidak dibuat.
    dataDir: "/nonexistent/bot-squad-access-test",
    launch: () => Promise.reject(new Error("tidak boleh dipanggil di tes akses")),
    stop: () => Promise.reject(new Error("tidak boleh dipanggil di tes akses")),
  });
  return { tg, logs, bot };
}

describe("isOwnerUpdate", () => {
  test("DM pemilik diterima", () => {
    expect(isOwnerUpdate(ownerDm("/start"), OWNER)).toBe(true);
  });
  for (const [name, update] of ignoredUpdates()) {
    test(`ditolak: ${name}`, () => {
      expect(isOwnerUpdate(update, OWNER)).toBe(false);
    });
  }
});

describe("master-bot tidak membalas akun lain", () => {
  for (const [name, update] of ignoredUpdates()) {
    test(`tanpa panggilan API apa pun: ${name}`, async () => {
      const { tg, logs, bot } = setup();
      try {
        await bot.handleUpdate(update);
        expect(tg.calls).toEqual([]);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toStartWith("update diabaikan dari ");
        // Log tidak memuat isi pesan.
        expect(logs[0]).not.toContain("/start");
        expect(logs[0]).not.toContain("halo");
      } finally {
        tg.stop();
      }
    });
  }
});

describe("pemilik dilayani", () => {
  // Tiket 261115202401: /start bukan perintah master-bot lagi; ditelan diam-diam.
  for (const cmd of ["/start", "/start apa-saja"]) {
    test(`${cmd} dari pemilik: tidak dibalas, tidak ada panggilan Telegram, tidak dicatat sebagai diabaikan`, async () => {
      const { tg, bot, logs } = setup();
      try {
        await bot.handleUpdate(ownerDm(cmd));
        expect(tg.calls).toEqual([]);
        expect(logs).toEqual([]);
      } finally {
        tg.stop();
      }
    });
  }

  for (const cmd of ["/help"]) {
    test(`${cmd} dibalas dengan daftar perintah`, async () => {
      const { tg, bot } = setup();
      try {
        await bot.handleUpdate(ownerDm(cmd));
        expect(tg.calls.map((c) => c.method)).toEqual(["sendMessage"]);
        const p = tg.calls[0]!.params;
        expect(p.chat_id).toBe(OWNER);
        expect(String(p.text)).not.toContain("/start");
        expect(String(p.text)).toContain("/help");
        expect(String(p.text)).toContain("/new - ");
        expect(String(p.text)).toContain("/register");
        expect(JSON.stringify(p)).not.toContain(TOKEN);
      } finally {
        tg.stop();
      }
    });
  }

  test("teks biasa dari pemilik tidak dibalas (belum ada perintahnya)", async () => {
    const { tg, bot } = setup();
    try {
      await bot.handleUpdate(ownerDm("halo"));
      expect(tg.calls).toEqual([]);
    } finally {
      tg.stop();
    }
  });
});
