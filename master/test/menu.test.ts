import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS } from "../src/bot.ts";
import { run } from "../src/main.ts";
import { fail, startFakeTelegram, type Call } from "./fake-telegram.ts";
import { OWNER, ownerDm, STRANGER } from "./updates.ts";

const TOKEN = "987654321:AAAnotherFakeToken_ForMenuTests_xyz1234";
const GROUP = -100123;
const MASTER_MENU = COMMANDS.map((c) => ({ ...c }));

/** Menu yang ditinggalkan plugin bot-squad (server.ts) saat token ini dipakai bot uji. */
const PLUGIN_MENU = [
  { command: "start", description: "Welcome and setup guide" },
  { command: "help", description: "What this bot can do" },
  { command: "status", description: "Check your pairing status" },
];
const OTHER_MENU = [{ command: "status", description: "menu sisa bot lain" }];

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-menu-"));
  mkdirSync(join(home, "master"), { recursive: true });
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

type Fake = ReturnType<typeof startFakeTelegram>;

/** Menjalankan master-bot sampai ia membalas /help pemilik, lalu menghentikannya. */
async function runUntilReply(tg: Fake) {
  tg.push(ownerDm("/help"));
  const lines: string[] = [];
  const ac = new AbortController();
  const done = run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l), client: { apiRoot: tg.apiRoot }, signal: ac.signal });
  for (let i = 0; i < 300 && !tg.calls.some((c) => c.method === "sendMessage"); i++) await Bun.sleep(10);
  ac.abort();
  const code = await done;
  return { code, out: lines.join("\n") };
}

const menuCalls = (calls: Call[]) =>
  calls.filter((c) => c.method === "setMyCommands" || c.method === "deleteMyCommands");

describe("menu sisa dari bot lain ditimpa saat master-bot menyala", () => {
  test("menu plugin di all_private_chats (kasus yang ditemukan pemilik)", async () => {
    const tg = startFakeTelegram(TOKEN);
    try {
      tg.seedMenu({ type: "all_private_chats" }, PLUGIN_MENU);
      expect(tg.privateMenu(OWNER).map((c) => c.command)).toEqual(["start", "help", "status"]);
      const { code, out } = await runUntilReply(tg);
      expect(code).toBe(0);
      expect(tg.privateMenu(OWNER)).toEqual(MASTER_MENU);
      expect(tg.privateMenu(OWNER).map((c) => c.command)).toEqual(["start", "help", "register", "list"]);
      expect(out).not.toContain("peringatan: menu");
    } finally {
      tg.stop();
    }
  });

  const leftovers: Array<[string, Record<string, unknown> & { type: string }]> = [
    ["default", { type: "default" }],
    ["all_private_chats", { type: "all_private_chats" }],
    ["chat pribadi pemilik", { type: "chat", chat_id: OWNER }],
  ];
  for (const [name, scope] of leftovers) {
    test(`menu sisa di cakupan ${name}`, async () => {
      const tg = startFakeTelegram(TOKEN);
      try {
        tg.seedMenu(scope, OTHER_MENU);
        const { code } = await runUntilReply(tg);
        expect(code).toBe(0);
        expect(tg.privateMenu(OWNER)).toEqual(MASTER_MENU);
      } finally {
        tg.stop();
      }
    });
  }

  test("sisa di semua cakupan sekaligus, termasuk grup", async () => {
    const tg = startFakeTelegram(TOKEN);
    try {
      for (const [, scope] of leftovers) tg.seedMenu(scope, OTHER_MENU);
      tg.seedMenu({ type: "all_group_chats" }, OTHER_MENU);
      tg.seedMenu({ type: "all_chat_administrators" }, OTHER_MENU);
      const { code } = await runUntilReply(tg);
      expect(code).toBe(0);
      expect(tg.privateMenu(OWNER)).toEqual(MASTER_MENU);
      // Akun lain di chat pribadi juga melihat menu master (all_private_chats).
      expect(tg.privateMenu(STRANGER)).toEqual(MASTER_MENU);
      // Sisa di grup hilang: yang tersisa hanya menu default master.
      expect(tg.groupMenu(GROUP)).toEqual(MASTER_MENU);
      expect(tg.groupAdminMenu(GROUP)).toEqual(MASTER_MENU);
    } finally {
      tg.stop();
    }
  });

  test("cakupan yang ditulis: tiga set tanpa kode bahasa, dua hapus untuk grup, sebelum polling", async () => {
    const tg = startFakeTelegram(TOKEN);
    try {
      await runUntilReply(tg);
      const calls = menuCalls(tg.calls);
      expect(calls.map((c) => [c.method, c.params.scope])).toEqual([
        ["setMyCommands", { type: "default" }],
        ["setMyCommands", { type: "all_private_chats" }],
        ["setMyCommands", { type: "chat", chat_id: OWNER }],
        ["deleteMyCommands", { type: "all_group_chats" }],
        ["deleteMyCommands", { type: "all_chat_administrators" }],
      ]);
      for (const c of calls) expect(c.params.language_code).toBeUndefined();
      for (const c of calls.filter((c) => c.method === "setMyCommands")) expect(c.params.commands).toEqual(MASTER_MENU);
      const lastMenu = tg.calls.lastIndexOf(calls.at(-1)!);
      expect(tg.calls.findIndex((c) => c.method === "getUpdates")).toBeGreaterThan(lastMenu);
    } finally {
      tg.stop();
    }
  });

  test("start kedua menulis ulang menu yang sama", async () => {
    const tg = startFakeTelegram(TOKEN);
    try {
      await runUntilReply(tg);
      tg.seedMenu({ type: "chat", chat_id: OWNER }, OTHER_MENU);
      tg.calls.length = 0;
      await runUntilReply(tg);
      expect(menuCalls(tg.calls)).toHaveLength(5);
      expect(tg.privateMenu(OWNER)).toEqual(MASTER_MENU);
    } finally {
      tg.stop();
    }
  });

  test("menu sisa khusus bahasa tidak dihapus; pemilik tetap terlindungi cakupan chat-nya", async () => {
    const tg = startFakeTelegram(TOKEN);
    try {
      tg.seedMenu({ type: "all_private_chats" }, OTHER_MENU, "en");
      await runUntilReply(tg);
      // Cakupan chat pemilik (tanpa bahasa) lebih khusus daripada all_private_chats+en.
      expect(tg.privateMenu(OWNER, "en")).toEqual(MASTER_MENU);
      // Sisa itu sendiri tidak disentuh (di luar cakupan tiket).
      expect(tg.privateMenu(STRANGER, "en")).toEqual(OTHER_MENU);
    } finally {
      tg.stop();
    }
  });

  test("menu sisa khusus bahasa di chat pemilik tidak ditangani (di luar cakupan tiket)", async () => {
    const tg = startFakeTelegram(TOKEN);
    try {
      tg.seedMenu({ type: "chat", chat_id: OWNER }, OTHER_MENU, "en");
      await runUntilReply(tg);
      expect(tg.privateMenu(OWNER)).toEqual(MASTER_MENU);
      expect(tg.privateMenu(OWNER, "en")).toEqual(OTHER_MENU);
    } finally {
      tg.stop();
    }
  });
});

describe("gagal memperbarui menu", () => {
  const steps: Array<[string, string, (p: Record<string, unknown>) => boolean]> = [
    ["default", "setMyCommands", (p) => (p.scope as any)?.type === "default"],
    ["all_private_chats", "setMyCommands", (p) => (p.scope as any)?.type === "all_private_chats"],
    ["chat pemilik", "setMyCommands", (p) => (p.scope as any)?.type === "chat"],
    ["all_group_chats", "deleteMyCommands", (p) => (p.scope as any)?.type === "all_group_chats"],
    ["all_chat_administrators", "deleteMyCommands", (p) => (p.scope as any)?.type === "all_chat_administrators"],
  ];

  for (const [label, method, match] of steps) {
    for (const status of [400, 500]) {
      test(`${status} pada ${label}: hanya peringatan, langkah lain tetap jalan, master-bot tetap melayani`, async () => {
        const tg = startFakeTelegram(TOKEN, {
          [method]: (p, next) => (match(p) ? fail(status, `Bad Request: gagal ${TOKEN}`) : next()),
        });
        try {
          const { code, out } = await runUntilReply(tg);
          expect(code).toBe(0);
          const warnings = out.split("\n").filter((l) => l.includes("peringatan: menu perintah"));
          expect(warnings).toHaveLength(1);
          expect(warnings[0]).toContain(`(${label})`);
          expect(out).not.toContain(TOKEN);
          expect(menuCalls(tg.calls)).toHaveLength(5);
          expect(tg.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
          expect(tg.privateMenu(OWNER)).toEqual(MASTER_MENU);
        } finally {
          tg.stop();
        }
      });
    }
  }

  test("semua langkah gagal: lima peringatan, master-bot tetap melayani", async () => {
    const tg = startFakeTelegram(TOKEN, {
      setMyCommands: () => fail(500, "Internal Server Error"),
      deleteMyCommands: () => fail(500, "Internal Server Error"),
    });
    try {
      const { code, out } = await runUntilReply(tg);
      expect(code).toBe(0);
      expect(out.split("\n").filter((l) => l.includes("peringatan: menu perintah"))).toHaveLength(5);
      expect(tg.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
    } finally {
      tg.stop();
    }
  });

  for (const status of [401, 409]) {
    for (const method of ["setMyCommands", "deleteMyCommands"]) {
      test(`${status} pada ${method}: master-bot berhenti seperti sebelumnya`, async () => {
        const tg = startFakeTelegram(TOKEN, { [method]: () => fail(status, status === 401 ? "Unauthorized" : "Conflict") });
        const lines: string[] = [];
        try {
          const code = await run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l), client: { apiRoot: tg.apiRoot } });
          const out = lines.join("\n");
          expect(code).toBe(1);
          expect(out).toContain(String(status));
          expect(out).toContain(status === 401 ? "menolak token" : "digantikan oleh master-bot lain");
          expect(out).not.toContain(TOKEN);
          expect(tg.calls.map((c) => c.method)).not.toContain("getUpdates");
          expect(menuCalls(tg.calls)).toHaveLength(method === "setMyCommands" ? 1 : 4);
        } finally {
          tg.stop();
        }
      });
    }
  }
});
