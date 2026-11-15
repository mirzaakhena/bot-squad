import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, createMasterBot, helpText } from "../src/bot.ts";
import { createBotLocks, type BusyAction } from "../src/busy.ts";
import { KEY_NAMES, KEYS_MAX, KEYS_USAGE, parseKeysArgs, tmuxKeyArgs, type KeyName } from "../src/keys.ts";
import type { LaunchResult } from "../src/launch.ts";
import { registryPath } from "../src/registry.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { ignoredUpdates, OWNER, ownerDm } from "./updates.ts";

// Tiket 261115195101: /keys dengan tmux tiruan. Token palsu.
const MASTER = "123456789:AAFakeMasterTokenForKeysCommand_abcd";
const BOT_TOKEN = "5001234:AAFakeBotTokenForKeysCommand_aaaaaaaaaaaa";

const ALL = ["up", "down", "left", "right", "enter", "esc", "tab", "space", "backspace", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "y", "n"];

describe("daftar tombol tertutup", () => {
  test("isinya persis daftar yang disetujui pemilik", () => {
    expect([...KEY_NAMES].sort()).toEqual([...ALL].sort());
  });

  test("setiap tombol dipetakan ke argumen tmux yang tetap", () => {
    const named = { up: "Up", down: "Down", left: "Left", right: "Right", enter: "Enter", esc: "Escape", tab: "Tab", space: "Space", backspace: "BSpace" };
    for (const [k, v] of Object.entries(named)) expect(tmuxKeyArgs(k as KeyName)).toEqual([v]);
    for (const k of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "y", "n"]) expect(tmuxKeyArgs(k as KeyName)).toEqual(["-l", k]);
  });

  test("cara pakai menyebut setiap tombol", () => {
    for (const k of ["up", "down", "left", "right", "enter", "esc", "tab", "space", "backspace", "0-9", "y", "n"]) expect(KEYS_USAGE).toContain(k);
    expect(KEYS_USAGE).toContain("ctrl-c tidak diterima");
  });
});

describe("parseKeysArgs", () => {
  test("urutan dipertahankan, huruf besar-kecil tidak dibedakan", () => {
    expect(parseKeysArgs("bot-02 down down enter")).toEqual({ name: "bot-02", keys: ["down", "down", "enter"] });
    expect(parseKeysArgs("  bot-02   DOWN Enter  ESC Y 1 ")).toEqual({ name: "bot-02", keys: ["down", "enter", "esc", "y", "1"] });
    for (const k of ALL) expect(parseKeysArgs(`b ${k}`)).toEqual({ name: "b", keys: [k as KeyName] });
    for (const k of ALL) expect(parseKeysArgs(`b ${k.toUpperCase()}`)).toEqual({ name: "b", keys: [k as KeyName] });
  });

  test("1 sampai 20 tombol diterima, 0 dan 21 ditolak", () => {
    expect(parseKeysArgs("")).toBeNull();
    expect(parseKeysArgs(undefined)).toBeNull();
    expect(parseKeysArgs("bot-02")).toBeNull();
    expect(parseKeysArgs("bot-02 " + Array(KEYS_MAX).fill("down").join(" "))!.keys).toHaveLength(20);
    expect(parseKeysArgs("bot-02 " + Array(KEYS_MAX + 1).fill("down").join(" "))).toBeNull();
  });

  test.each([
    "ctrl-c", "C-c", "c-c", "^C", "ctrl+c", "C-d", "M-x", "halo", "a", "x", "yes", "no", "10", "-l", "-t", "-R", "Up2", "F1", "PageUp", "Home",
    "kill-server", ";", "\;", "'enter'", "enter;", "Escape", "BSpace", "/model", "hasOwnProperty", "constructor", "__proto__", "toString", "é", "１",
  ])("di luar daftar: %s", (bad) => {
    expect(parseKeysArgs(`bot-02 ${bad}`)).toBeNull();
    // Satu yang salah di antara yang benar tetap menolak seluruhnya.
    expect(parseKeysArgs(`bot-02 down ${bad} enter`)).toBeNull();
  });
});

describe("/keys di master-bot", () => {
  let home: string;
  let tg: ReturnType<typeof startFakeTelegram>;
  let logs: string[];
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "bot-squad-keys-"));
    logs = [];
    tg = startFakeTelegram(MASTER);
  });
  afterEach(() => {
    tg.stop();
    rmSync(home, { recursive: true, force: true });
  });

  const rec = (username: string, status = "active") => ({ telegramId: 1, username, status, createdAt: "x" });
  const writeReg = (bots: Record<string, unknown>) => writeFileSync(registryPath(home), JSON.stringify({ bots }));
  function botFolder(name: string, pid?: number) {
    const state = join(home, "bots", name, "state");
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, ".env"), `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\nRAHASIA_LAIN=nilai-rahasia-panjang\n`);
    if (pid !== undefined) writeFileSync(join(state, "bot.pid"), String(pid));
  }

  function make(o: {
    sessions?: string[];
    panes?: Record<string, string>;
    locks?: ReturnType<typeof createBotLocks>;
    sendKey?: (name: string, key: KeyName) => Promise<boolean>;
    launch?: () => Promise<LaunchResult>;
    tmuxError?: boolean;
    signal?: AbortSignal;
  } = {}) {
    const sent: Array<[string, KeyName]> = [];
    const order: string[] = [];
    const pending: Promise<void>[] = [];
    let touched = 0;
    const sessions = new Set(o.sessions ?? Object.keys(o.panes ?? {}));
    const bot = createMasterBot({
      token: MASTER,
      ownerId: OWNER,
      log: (m) => logs.push(m),
      client: { apiRoot: tg.apiRoot },
      botInfo: ME,
      dataDir: home,
      locks: o.locks,
      signal: o.signal,
      launch: async () => {
        touched++;
        return o.launch ? o.launch() : { kind: "active", pid: 1 };
      },
      stop: async () => {
        touched++;
        return { wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [] };
      },
      probe: {
        tmux: {
          hasSession: async (n: string) => {
            if (o.tmuxError) throw new Error("tmux tidak ada");
            return sessions.has(n);
          },
        },
        isAlive: (pid: number) => pid === 777,
      } as any,
      capture: async (n) => {
        order.push(`capture:${n}`);
        return o.panes?.[n] ?? null;
      },
      sendKey: async (n, k) => {
        order.push(`key:${k}`);
        if (o.sendKey) return o.sendKey(n, k);
        sent.push([n, k]);
        return true;
      },
      keysTiming: { gapMs: 1, settleMs: 1 },
      onLaunch: (p) => pending.push(p),
    });
    return { bot, sent, order, touched: () => touched, settle: () => Promise.all(pending) };
  }
  const texts = () => tg.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));

  test("mengirim tombol berurutan ke bot itu saja, lalu membalas dengan layar sesudahnya", async () => {
    writeReg({ "bot-01": rec("satu_bot"), "bot-02": rec("dua_bot") });
    botFolder("bot-01", 777);
    botFolder("bot-02", 777);
    const { bot, sent, order, settle, touched } = make({ panes: { "bot-01": "layar satu", "bot-02": "Switch model?\n\n  1. Yes\n❯ 2. No, go back\n" } });
    await bot.handleUpdate(ownerDm("/keys bot-02 Down DOWN enter"));
    await settle();
    expect(sent).toEqual([["bot-02", "down"], ["bot-02", "down"], ["bot-02", "enter"]]);
    // Layar dibaca setelah tombol terakhir.
    expect(order).toEqual(["key:down", "key:down", "key:enter", "capture:bot-02"]);
    expect(texts()).toEqual([
      "Tombol dikirim ke @dua_bot ('bot-02'): down down enter\n\n" +
        "Layar @dua_bot ('bot-02'), 3 baris terakhir:\n<pre>Switch model?\n  1. Yes\n❯ 2. No, go back</pre>",
    ]);
    expect(tg.calls.at(-1)!.params.parse_mode).toBe("HTML");
    expect(touched()).toBe(0);
    expect(logs).toContain("/keys 'bot-02': 3 dari 3 tombol dikirim (down down enter)");
  });

  test("semua tombol di daftar diterima (dua perintah, karena batasnya 20)", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    const { bot, sent, settle } = make({ panes: { "bot-01": "x" } });
    await bot.handleUpdate(ownerDm(`/keys bot-01 ${ALL.slice(0, 20).join(" ")}`));
    await settle();
    await bot.handleUpdate(ownerDm(`/keys bot-01 ${ALL.slice(20).join(" ")}`));
    await settle();
    expect(sent.map(([, k]) => k)).toEqual(ALL as KeyName[]);
    expect(texts()[0]).toStartWith(`Tombol dikirim ke @satu_bot ('bot-01'): ${ALL.slice(0, 20).join(" ")}\n\nLayar`);
  });

  test.each([
    ["tanpa argumen", "/keys"],
    ["tanpa tombol", "/keys bot-01"],
    ["ctrl-c", "/keys bot-01 ctrl-c"],
    ["nama tombol tmux C-c", "/keys bot-01 C-c"],
    ["teks bebas", "/keys bot-01 halo dunia"],
    ["slash command", "/keys bot-01 /model opus"],
    ["satu salah di antara yang benar", "/keys bot-01 down enter hapus enter"],
    ["salah di akhir", "/keys bot-01 down enter x"],
    ["21 tombol", `/keys bot-01 ${Array(21).fill("down").join(" ")}`],
    ["nama tidak sah", "/keys Bot_01 enter"],
    ["nama berawalan '-'", "/keys -t enter"],
    ["nama berupa target tmux", "/keys bot-01:0.1 enter"],
  ])("cara pakai tanpa mengirim apa pun: %s", async (_what, cmd) => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    const { bot, sent, order, settle } = make({ panes: { "bot-01": "x" } });
    await bot.handleUpdate(ownerDm(cmd));
    await settle();
    expect(texts()).toEqual([KEYS_USAGE]);
    expect(sent).toEqual([]);
    expect(order).toEqual([]);
  });

  test("nama tidak terdaftar: ditolak seperti /logs, tanpa tombol", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    // Sesi tmux bernama itu ada, tetapi bukan bot terdaftar.
    const { bot, sent, order, settle } = make({ sessions: ["bot-01", "lain"], panes: { lain: "x" } });
    await bot.handleUpdate(ownerDm("/keys lain enter"));
    await settle();
    expect(texts()).toEqual(["Bot 'lain' tidak terdaftar. Tidak ada tombol yang dikirim."]);
    expect(sent).toEqual([]);
    expect(order).toEqual([]);
  });

  test("registry rusak: pesan, tanpa tombol", async () => {
    writeFileSync(registryPath(home), "{rusak");
    const { bot, sent, settle } = make({ panes: { "bot-01": "x" } });
    await bot.handleUpdate(ownerDm("/keys bot-01 enter"));
    await settle();
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toContain("Tidak ada tombol yang dikirim.");
    expect(sent).toEqual([]);
  });

  test("sesi tidak hidup: dijawab tidak hidup, tanpa tombol", async () => {
    writeReg({ "bot-mati": rec("mati_bot"), "bot-yatim": rec("yatim_bot") });
    botFolder("bot-mati");
    botFolder("bot-yatim", 777); // server plugin hidup, sesi tmux tidak ada
    const { bot, sent, order, settle } = make({});
    await bot.handleUpdate(ownerDm("/keys bot-mati enter"));
    await bot.handleUpdate(ownerDm("/keys bot-yatim enter"));
    await settle();
    expect(texts()).toEqual([
      "Bot @mati_bot ('bot-mati') tidak hidup (mati), jadi tidak ada tombol yang dikirim. Nyalakan dengan /restart bot-mati.",
      "Bot @yatim_bot ('bot-yatim') tidak hidup (sesi tmux tidak ada, tetapi server plugin masih hidup), jadi tidak ada tombol yang dikirim. Nyalakan dengan /restart bot-yatim.",
    ]);
    expect(sent).toEqual([]);
    expect(order).toEqual([]);
  });

  test("tmux tidak bisa diperiksa: tanpa tombol", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    const { bot, sent, settle } = make({ tmuxError: true });
    await bot.handleUpdate(ownerDm("/keys bot-01 enter"));
    await settle();
    expect(texts()[0]).toStartWith("Tidak ada tombol yang dikirim ke @satu_bot ('bot-01'): tmux tidak bisa diperiksa.");
    expect(sent).toEqual([]);
  });

  test("sesi ada tetapi server plugin mati: tombol tetap dikirim, layar memberi catatan", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01");
    const { bot, sent, settle } = make({ panes: { "bot-01": "dialog" } });
    await bot.handleUpdate(ownerDm("/keys bot-01 enter"));
    await settle();
    expect(sent).toEqual([["bot-01", "enter"]]);
    expect(texts()[0]).toContain("Catatan: sesi tmux ada, tetapi server plugin mati.");
  });

  test.each<BusyAction>(["dinyalakan", "dinyalakan ulang", "dihentikan", "dihapus", "dikirimi tombol"])(
    "bot sedang %s: ditolak, tanpa tombol",
    async (action) => {
      writeReg({ "bot-01": rec("satu_bot"), "bot-02": rec("dua_bot") });
      botFolder("bot-01", 777);
      botFolder("bot-02", 777);
      const locks = createBotLocks();
      const release = locks.claim("bot-01", action)!;
      const { bot, sent, order, settle } = make({ panes: { "bot-01": "x", "bot-02": "y" }, locks });
      await bot.handleUpdate(ownerDm("/keys bot-01 enter"));
      await settle();
      expect(texts()).toEqual([`'bot-01' sedang ${action}, coba lagi setelah selesai.`]);
      expect(sent).toEqual([]);
      expect(order).toEqual([]);
      // Bot lain tidak ikut terkunci, dan setelah selesai bot ini diterima lagi.
      await bot.handleUpdate(ownerDm("/keys bot-02 enter"));
      release();
      await bot.handleUpdate(ownerDm("/keys bot-01 esc"));
      await settle();
      expect(sent.sort()).toEqual([["bot-01", "esc"], ["bot-02", "enter"]]);
      expect(locks.busyWith("bot-01")).toBeNull();
    },
  );

  test("/restart yang sedang menyalakan menolak /keys; /keys yang sedang berjalan menolak /stop dan /keys lain", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    let openLaunch!: (r: LaunchResult) => void;
    let openKey!: () => void;
    const keyGate = new Promise<void>((r) => (openKey = r));
    const { bot, order, settle, touched } = make({
      panes: { "bot-01": "x" },
      launch: () => new Promise<LaunchResult>((r) => (openLaunch = r)),
      sendKey: async () => {
        await keyGate;
        return true;
      },
    });
    await bot.handleUpdate(ownerDm("/restart bot-01"));
    await Bun.sleep(20);
    await bot.handleUpdate(ownerDm("/keys bot-01 enter"));
    expect(texts().at(-1)).toBe("'bot-01' sedang dinyalakan ulang, coba lagi setelah selesai.");
    expect(order).toEqual([]);
    openLaunch({ kind: "active", pid: 1 });
    await settle();
    const before = touched();

    await bot.handleUpdate(ownerDm("/keys bot-01 enter"));
    await Bun.sleep(20);
    await bot.handleUpdate(ownerDm("/stop bot-01"));
    await bot.handleUpdate(ownerDm("/keys bot-01 esc"));
    expect(texts().slice(-2)).toEqual([
      "'bot-01' sedang dikirimi tombol, coba lagi setelah selesai.",
      "'bot-01' sedang dikirimi tombol, coba lagi setelah selesai.",
    ]);
    openKey();
    await settle();
    expect(order).toEqual(["key:enter", "capture:bot-01"]);
    expect(touched()).toBe(before);
  });

  test("sesi hilang di tengah: berhenti, melaporkan yang sudah dikirim", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    const got: string[] = [];
    const { bot, settle } = make({
      panes: { "bot-01": "x" },
      sendKey: async (_n, k) => {
        if (k === "enter") return false;
        got.push(k);
        return true;
      },
    });
    await bot.handleUpdate(ownerDm("/keys bot-01 down enter up up"));
    await settle();
    expect(got).toEqual(["down"]);
    expect(texts()[0]).toStartWith(
      "Hanya 1 dari 4 tombol yang dikirim ke @satu_bot ('bot-01'): down\nBerhenti karena tombol ke-2 (enter) ditolak tmux",
    );
  });

  test("master-bot berhenti di tengah: tombol sisanya tidak dikirim", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    const ac = new AbortController();
    const got: string[] = [];
    const { bot, settle } = make({
      panes: { "bot-01": "x" },
      signal: ac.signal,
      sendKey: async (_n, k) => {
        got.push(k);
        ac.abort();
        return true;
      },
    });
    await bot.handleUpdate(ownerDm("/keys bot-01 down enter up"));
    await settle();
    expect(got).toEqual(["down"]);
  });

  test("layar disensor seperti /logs dan balasan muat satu pesan", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 777);
    const pane = [
      ...Array.from({ length: 30 }, (_, i) => `baris ${i + 1} ${"z".repeat(190)}`),
      `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}`,
      `master ${MASTER}`,
      "RAHASIA_LAIN=nilai-rahasia-panjang",
      "<b>&</b>",
    ].join("\n");
    const { bot, settle } = make({ panes: { "bot-01": pane } });
    await bot.handleUpdate(ownerDm(`/keys bot-01 ${Array(20).fill("backspace").join(" ")}`));
    await settle();
    const [t] = texts();
    expect(t!.length).toBeLessThanOrEqual(4000);
    expect(t).toContain("20 baris terakhir");
    expect(t).toContain("&lt;token disembunyikan&gt;");
    expect(t).toContain("&lt;b&gt;&amp;&lt;/b&gt;</pre>");
    for (const secret of [BOT_TOKEN, MASTER, "nilai-rahasia-panjang"]) {
      for (let i = 0; i + 8 <= secret.length; i++) expect(t).not.toContain(secret.slice(i, i + 8));
    }
  });

  test("bukan pemilik atau bukan chat pribadi: tidak dilayani", async () => {
    writeReg({ "uji-x": rec("x_bot") });
    botFolder("uji-x", 777);
    const { bot, sent, order, settle } = make({ panes: { "uji-x": "x" } });
    const cases = ignoredUpdates().filter(([what]) => what.startsWith("/keys"));
    expect(cases).toHaveLength(2);
    for (const [, u] of cases) await bot.handleUpdate(u);
    await settle();
    expect(texts()).toEqual([]);
    expect(sent).toEqual([]);
    expect(order).toEqual([]);
  });

  test("/help dan menu memuat /keys", () => {
    expect(COMMANDS.map((c) => c.command)).toContain("keys");
    expect(helpText()).toContain("/keys - Kirim tombol ke sesi satu bot: /keys <nama> <tombol...>");
  });
});
