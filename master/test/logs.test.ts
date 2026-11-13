import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMasterBot } from "../src/bot.ts";
import { envValues, FRAGMENT_MIN, LOGS_USAGE, logsReport, maskScreen, parseLogsArgs, TELEGRAM_MAX_CHARS } from "../src/logs.ts";
import { registryPath } from "../src/registry.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Token palsu.
const MASTER = "123456789:AAFakeMasterTokenForLogsCommand_abcd";
const BOT_TOKEN = "5001234:AAFakeBotTokenForLogsCommand_aaaaaaaaaaaa";

let home: string;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-logs-"));
  logs = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

type World = { sessions: Set<string>; alive: Set<number>; panes: Map<string, string>; tmuxError?: boolean; captureError?: boolean };
const world = (panes: Record<string, string> = {}, alive: number[] = []): World => ({
  sessions: new Set(Object.keys(panes)),
  alive: new Set(alive),
  panes: new Map(Object.entries(panes)),
});

function deps(w: World) {
  const captured: string[] = [];
  return {
    captured,
    d: {
      dataDir: home,
      tmux: {
        hasSession: async (name: string) => {
          if (w.tmuxError) throw new Error("tmux tidak ada");
          return w.sessions.has(name);
        },
        capture: async (name: string) => {
          captured.push(name);
          if (w.captureError) throw new Error("capture gagal");
          return w.panes.get(name) ?? null;
        },
      },
      isAlive: (pid: number) => w.alive.has(pid),
      masterToken: MASTER,
      log: (m: string) => logs.push(m),
    },
  };
}

function botFolder(name: string, pid?: number, env = `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\n`) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, ".env"), env);
  if (pid !== undefined) writeFileSync(join(state, "bot.pid"), String(pid));
}
const writeReg = (bots: Record<string, unknown>) => writeFileSync(registryPath(home), JSON.stringify({ bots }));
const rec = (username: string, status = "active") => ({ telegramId: 1, username, status, createdAt: "x" });

/** Isi <pre> dari balasan, dengan entitas HTML dikembalikan. */
function pre(text: string): string[] {
  const m = /<pre>([\s\S]*)<\/pre>/.exec(text);
  if (!m) throw new Error(`tidak ada <pre>:\n${text}`);
  return m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").split("\n");
}

/** Panjang teks setelah Telegram mengurai HTML (tag dibuang, entitas jadi satu karakter). */
const parsedLength = (html: string) => html.replace(/<\/?(pre|b|code)>/g, "").replace(/&(lt|gt|amp);/g, "x").length;

const numbered = (n: number, width = 10) => Array.from({ length: n }, (_, i) => `baris ${String(i + 1).padStart(3, "0")} ${"y".repeat(width)}`);

describe("parseLogsArgs", () => {
  test("default 20, angka 1-50 diterima", () => {
    expect(parseLogsArgs("bot-01")).toEqual({ name: "bot-01", lines: 20 });
    expect(parseLogsArgs("  bot-01   7 ")).toEqual({ name: "bot-01", lines: 7 });
    for (const n of [1, 20, 49, 50]) expect(parseLogsArgs(`bot-01 ${n}`)).toEqual({ name: "bot-01", lines: n });
  });
  test("di luar 1-50, bukan angka, atau jumlah kata salah ditolak", () => {
    for (const bad of ["", "   ", "bot-01 0", "bot-01 51", "bot-01 100", "bot-01 -1", "bot-01 +5", "bot-01 5.0", "bot-01 abc", "bot-01 1e1", "bot-01 0x10", "bot-01 5 6", "bot-01 ５"]) {
      expect(parseLogsArgs(bad)).toBeNull();
    }
    expect(parseLogsArgs(undefined)).toBeNull();
  });
});

describe("sensor layar", () => {
  test("token bot, token master, bentuk token, dan nilai variabel token disembunyikan", () => {
    const out = maskScreen(
      [
        `token bot: ${BOT_TOKEN}`,
        `master ${MASTER} selesai`,
        "acak 42:abcdefghijklmnopqrstuvwxyz0123",
        "TELEGRAM_BOT_TOKEN=rahasia-pendek",
        'export MASTER_BOT_TOKEN="apa saja"',
        '{"TELEGRAM_BOT_TOKEN": "nilai-json"}',
        `url https://api.telegram.org/bot${encodeURIComponent(BOT_TOKEN)}/getMe`,
        "baris biasa 12:30 tetap",
      ],
      [BOT_TOKEN, MASTER],
    );
    const all = out.join("\n");
    expect(all).not.toContain(BOT_TOKEN);
    expect(all).not.toContain(encodeURIComponent(BOT_TOKEN));
    expect(all).not.toContain(MASTER);
    expect(all).not.toContain("abcdefghijklmnopqrstuvwxyz0123");
    expect(all).not.toContain("rahasia-pendek");
    expect(all).not.toContain("nilai-json");
    expect(out[0]).toBe("token bot: <token disembunyikan>");
    expect(out[1]).toBe("master <token disembunyikan> selesai");
    expect(out[7]).toBe("baris biasa 12:30 tetap");
  });

  test("token yang patah ke dua baris layar tetap disensor di kedua baris", () => {
    const cut = 20;
    const out = maskScreen([`awal ${BOT_TOKEN.slice(0, cut)}`, `    ${BOT_TOKEN.slice(cut)} akhir`], [BOT_TOKEN]);
    expect(out[0]).toBe("awal <token disembunyikan>");
    expect(out[1]).toBe("    <token disembunyikan> akhir");
    // Hanya potongan bawah yang terlihat: tetap tidak bocor.
    expect(maskScreen([`x ${BOT_TOKEN.slice(0, cut)}`, BOT_TOKEN.slice(cut)], [BOT_TOKEN]).slice(-1)[0]).toBe("<token disembunyikan>");
  });

  test("token tak dikenal yang patah ke dua baris: kedua bagian disensor, kata berikutnya tidak", () => {
    const other = "7777777:AAunknownTokenPart1xyzUnknownToken2";
    const out = maskScreen([`lihat ${other.slice(0, 20)}`, `${other.slice(20)}`, "lanjut"], []);
    expect(out).toEqual(["lihat <token disembunyikan>", "<token disembunyikan>", "lanjut"]);
    expect(out.join("")).not.toContain("UnknownToken2");
  });

  describe("potongan token yang diketahui, tanpa pasangannya di layar", () => {
    const T = BOT_TOKEN;
    const hidden = (out: string[]) => {
      const all = out.join("\n");
      // Tidak ada potongan token sepanjang FRAGMENT_MIN yang tersisa.
      for (let i = 0; i + FRAGMENT_MIN <= T.length; i++) expect(all).not.toContain(T.slice(i, i + FRAGMENT_MIN));
    };
    test("(a) baris teratas adalah lanjutan wrap tanpa awalnya", () => {
      for (const cut of [8, 15, 20, 30, 38]) {
        const out = maskScreen([T.slice(cut), "selesai"], [T]);
        hidden(out);
        expect(out).toEqual(["<token disembunyikan>", "selesai"]);
      }
      const mid = maskScreen([`${T.slice(25)} di dalamnya`], [T]);
      expect(mid).toEqual(["<token disembunyikan> di dalamnya"]);
    });
    test("(b) awalan sebelum elipsis, termasuk awalan pendek setelah ':'", () => {
      for (const len of [8, 10, 20, 30]) {
        const out = maskScreen([`lihat ${T.slice(0, len)}…`], [T]);
        hidden(out);
        expect(out).toEqual(["lihat <token disembunyikan>…"]);
      }
    });
    test("(c) token dipisah bingkai kotak", () => {
      for (const cut of [10, 20, 30]) {
        const out = maskScreen([`│ ${T.slice(0, cut)} │`, `│ ${T.slice(cut)} │`], [T]);
        hidden(out);
        expect(out).toEqual(["│ <token disembunyikan> │", "│ <token disembunyikan> │"]);
      }
    });
    test("potongan bentuk ter-encode URL dan potongan token master-bot", () => {
      const enc = encodeURIComponent(T);
      const out = maskScreen([`url ${enc.slice(5, 30)}`, `m ${MASTER.slice(12)}`], [T, MASTER]);
      expect(out).toEqual(["url <token disembunyikan>", "m <token disembunyikan>"]);
    });
    test("teks biasa yang tidak sama dengan potongan token tetap utuh", () => {
      const lines = ["Fake bot test", "aaaaaaa pendek", "LogsCom", "✻ Thinking… (esc to interrupt)"];
      expect(maskScreen(lines, [T, MASTER])).toEqual(lines);
    });
  });

  test("nilai .env: semua nilai yang cukup panjang, tanpa tanda kutip", () => {
    const f = join(home, "env");
    writeFileSync(f, `TELEGRAM_BOT_TOKEN="${BOT_TOKEN}"\nLAIN=rahasia-lain-panjang\nPENDEK=1\n# komentar\n`);
    expect(envValues(f)).toEqual([BOT_TOKEN, "rahasia-lain-panjang"]);
    expect(envValues(join(home, "tidak-ada"))).toEqual([]);
  });
});

describe("logsReport", () => {
  test("bot hidup: baris terakhir tanpa baris kosong, default 20, dalam <pre>", async () => {
    botFolder("bot-01", 4242);
    const pane = [...numbered(30).flatMap((l) => [l, "", "   "]), "", ""].join("\n");
    const { d } = deps(world({ "bot-01": pane }, [4242]));
    const text = await logsReport("bot-01", "satu_bot", 20, d);
    expect(text.startsWith("Layar @satu_bot ('bot-01'), 20 baris terakhir:\n<pre>")).toBe(true);
    expect(pre(text)).toEqual(numbered(30).slice(-20));
    expect(text).not.toContain("Catatan");
  });

  test("jumlah baris tertentu, dan layar yang lebih pendek ditampilkan semua", async () => {
    botFolder("bot-01", 4242);
    const { d } = deps(world({ "bot-01": numbered(30).join("\n") }, [4242]));
    expect(pre(await logsReport("bot-01", "satu_bot", 1, d))).toEqual(["baris 030 yyyyyyyyyy"]);
    expect(pre(await logsReport("bot-01", "satu_bot", 50, d))).toEqual(numbered(30));
    expect(await logsReport("bot-01", "satu_bot", 50, d)).toContain("30 baris terakhir:");
  });

  test("50 baris selebar layar (200 kolom) penuh karakter HTML tetap muat satu pesan", async () => {
    botFolder("bot-01", 4242);
    const wide = Array.from({ length: 60 }, (_, i) => `${String(i).padStart(2, "0")} ${"<&>".repeat(66)}`);
    const { d } = deps(world({ "bot-01": wide.join("\n") }, [4242]));
    const text = await logsReport("bot-01", "satu_bot", 50, d);
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
    expect(parsedLength(text)).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
    const shown = pre(text);
    expect(shown.at(-1)).toBe(wide.at(-1));
    expect(text).toContain(`${shown.length} baris terakhir (diminta 50; baris teratas dibuang supaya muat satu pesan):`);
  });

  test("setiap n dari 1 sampai 50 muat satu pesan, juga untuk layar terlebar", async () => {
    botFolder("bot-01", 4242);
    const wide = Array.from({ length: 50 }, () => "&".repeat(200));
    const { d } = deps(world({ "bot-01": wide.join("\n") }, [4242]));
    for (let n = 1; n <= 50; n++) {
      const text = await logsReport("bot-01", "satu_bot", n, d);
      expect(text.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
      expect(pre(text).length).toBeGreaterThanOrEqual(1);
    }
  });

  test("satu baris yang sangat panjang dipotong ujungnya", async () => {
    botFolder("bot-01", 4242);
    const { d } = deps(world({ "bot-01": "a".repeat(9000) + "UJUNG" }, [4242]));
    const text = await logsReport("bot-01", "satu_bot", 20, d);
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
    expect(pre(text)[0]!.endsWith("UJUNG")).toBe(true);
  });

  test("token dan isi .env di layar tidak ikut, juga dari baris di atas yang terpotong", async () => {
    botFolder("bot-01", 4242, `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\nRAHASIA_LAIN=isi-env-yang-rahasia\n`);
    const pane = [
      `$ cat .env`,
      `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}`,
      `RAHASIA_LAIN=isi-env-yang-rahasia`,
      `master ${MASTER}`,
      `potongan ${BOT_TOKEN.slice(0, 15)}`,
      BOT_TOKEN.slice(15),
      "selesai",
    ].join("\n");
    const { d } = deps(world({ "bot-01": pane }, [4242]));
    for (const n of [1, 2, 3, 20]) {
      const text = await logsReport("bot-01", "satu_bot", n, d);
      expect(text).not.toContain(BOT_TOKEN);
      expect(text).not.toContain(BOT_TOKEN.slice(15));
      expect(text).not.toContain(BOT_TOKEN.split(":")[1]!);
      expect(text).not.toContain(MASTER);
      expect(text).not.toContain("isi-env-yang-rahasia");
    }
    expect(pre(await logsReport("bot-01", "satu_bot", 20, d))).toContain("TELEGRAM_BOT_TOKEN=<token disembunyikan>");
  });

  test("potongan token di tepi atas layar, dan token .env bot lain, tidak ikut", async () => {
    botFolder("bot-01", 4242);
    const OTHER = "6002345:AAOtherBotTokenShownOnScreen_bbbbbbbbbbb";
    botFolder("bot-02", undefined, `TELEGRAM_BOT_TOKEN=${OTHER}\n`);
    const pane = [BOT_TOKEN.slice(18) + " di dalamnya", `cat ../bot-02: ${OTHER.slice(0, 25)}…`, `lain ${OTHER.slice(25)}`, "selesai"].join("\n");
    const { d } = deps(world({ "bot-01": pane }, [4242]));
    const text = await logsReport("bot-01", "satu_bot", 20, d);
    expect(pre(text)).toEqual([
      "<token disembunyikan> di dalamnya",
      "cat ../bot-02: <token disembunyikan>…",
      "lain <token disembunyikan>",
      "selesai",
    ]);
  });

  test("bot tidak hidup: dijelaskan, tanpa membaca layar", async () => {
    botFolder("bot-01");
    botFolder("bot-02", 777);
    const { d, captured } = deps({ ...world(), alive: new Set([777]) });
    const dead = await logsReport("bot-01", "satu_bot", 20, d);
    expect(dead).toBe("Bot @satu_bot ('bot-01') tidak hidup (mati), jadi tidak ada layar untuk ditampilkan. Nyalakan dengan /restart bot-01.");
    const only = await logsReport("bot-02", "dua_bot", 20, d);
    expect(only).toContain("tidak hidup (sesi tmux tidak ada, tetapi server plugin masih hidup)");
    expect(captured).toEqual([]);
  });

  test("sesi ada tetapi server plugin mati: layar tetap tampil dengan catatan", async () => {
    botFolder("bot-01");
    const { d } = deps(world({ "bot-01": "Error: plugin crash" }));
    const text = await logsReport("bot-01", "satu_bot", 20, d);
    expect(pre(text)).toEqual(["Error: plugin crash"]);
    expect(text).toEndWith("Catatan: sesi tmux ada, tetapi server plugin mati.");
  });

  test("tmux error, capture gagal, sesi hilang di tengah, dan layar kosong", async () => {
    botFolder("bot-01", 4242);
    const w = world({ "bot-01": "x" }, [4242]);
    expect(await logsReport("bot-01", "satu_bot", 20, deps({ ...w, tmuxError: true }).d)).toContain("tmux tidak bisa diperiksa");
    expect(await logsReport("bot-01", "satu_bot", 20, deps({ ...w, captureError: true }).d)).toContain("tidak bisa dibaca");
    expect(logs.some((l) => l.includes("/logs 'bot-01': layar gagal dibaca"))).toBe(true);
    const gone = world({}, [4242]);
    gone.sessions.add("bot-01");
    expect(await logsReport("bot-01", "satu_bot", 20, deps(gone).d)).toContain("sesi tmux-nya baru saja hilang");
    expect(await logsReport("bot-01", "satu_bot", 20, deps(world({ "bot-01": "\n  \n\n" }, [4242])).d)).toBe(
      "Layar @satu_bot ('bot-01') kosong.",
    );
  });
});

describe("/logs lewat master-bot", () => {
  let tg: ReturnType<typeof startFakeTelegram>;
  beforeEach(() => (tg = startFakeTelegram(MASTER)));
  afterEach(() => tg.stop());

  const makeBot = (w: World) => {
    let touched = 0;
    const { d, captured } = deps(w);
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
      probe: { tmux: d.tmux, isAlive: d.isAlive },
      capture: d.tmux.capture,
    });
    return { bot, touched: () => touched, captured };
  };
  const replies = () => tg.calls.filter((c) => c.method === "sendMessage");

  function snapshot(dir: string): string[] {
    const out: string[] = [];
    const walk = (p: string) => {
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const f = join(p, e.name);
        const st = statSync(f);
        out.push(`${f} ${st.size} ${st.mtimeMs}`);
        if (e.isDirectory()) walk(f);
      }
    };
    walk(dir);
    return out.sort();
  }

  test("membalas layar sebagai HTML, tanpa token, tanpa mengubah apa pun", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 4242);
    const pane = [...numbered(25), `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}`, `master ${MASTER}`].join("\n");
    const { bot, touched } = makeBot(world({ "bot-01": pane }, [4242]));
    const before = snapshot(home);
    await bot.handleUpdate(ownerDm("/logs bot-01"));
    await bot.handleUpdate(ownerDm("/logs bot-01 5"));
    const sent = replies();
    expect(sent).toHaveLength(2);
    for (const s of sent) expect(s.params.parse_mode).toBe("HTML");
    expect(pre(String(sent[0]!.params.text))).toHaveLength(20);
    expect(pre(String(sent[1]!.params.text))).toEqual([...numbered(25).slice(-3), "TELEGRAM_BOT_TOKEN=<token disembunyikan>", "master <token disembunyikan>"]);
    for (const c of tg.calls) {
      expect(JSON.stringify(c.params)).not.toContain(BOT_TOKEN);
      expect(JSON.stringify(c.params)).not.toContain(MASTER);
    }
    expect(touched()).toBe(0);
    expect(snapshot(home)).toEqual(before);
    expect(tg.calls.some((c) => c.method === "deleteMessage")).toBe(false);
  });

  test("argumen salah dijawab dengan cara pakai, tanpa membaca layar", async () => {
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01", 4242);
    const { bot, captured } = makeBot(world({ "bot-01": "x" }, [4242]));
    const bad = ["/logs", "/logs bot-01 0", "/logs bot-01 51", "/logs bot-01 abc", "/logs bot-01 -3", "/logs bot-01 5 6", "/logs Bot_01", "/logs ../x"];
    for (const b of bad) await bot.handleUpdate(ownerDm(b));
    expect(replies().map((c) => c.params.text)).toEqual(bad.map(() => LOGS_USAGE));
    expect(captured).toEqual([]);
  });

  test("bot tidak terdaftar, registry rusak, dan bot mati", async () => {
    botFolder("liar", 4242);
    const { bot, captured } = makeBot(world({ liar: "rahasia layar" }, [4242]));
    await bot.handleUpdate(ownerDm("/logs liar"));
    expect(replies().at(-1)!.params.text).toBe("Bot 'liar' tidak terdaftar. Tidak ada layar yang ditampilkan.");
    writeFileSync(registryPath(home), "{rusak");
    await bot.handleUpdate(ownerDm("/logs liar"));
    expect(String(replies().at(-1)!.params.text)).toContain("Tidak ada layar yang ditampilkan.");
    writeReg({ "bot-01": rec("satu_bot") });
    botFolder("bot-01");
    await bot.handleUpdate(ownerDm("/logs bot-01 10"));
    expect(String(replies().at(-1)!.params.text)).toContain("tidak hidup (mati)");
    expect(captured).toEqual([]);
  });

  test("/help menyebut /logs", async () => {
    const { bot } = makeBot(world());
    await bot.handleUpdate(ownerDm("/help"));
    expect(String(replies()[0]!.params.text)).toContain("/logs - Baris terakhir layar satu bot: /logs <nama> [n]");
  });
});
