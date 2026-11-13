import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMasterBot } from "../src/bot.ts";
import { EMPTY_LIST, listReport, mismatch, probeBot, REGISTRY_BROKEN, statusText, type Liveness } from "../src/list.ts";
import { registryPath } from "../src/registry.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Token palsu.
const MASTER = "123456789:AAFakeMasterTokenForListCommand_abcd";
const BOT_TOKEN = "5001:AAFakeBotTokenForListCommand_aaaaaaaaaa";

let home: string;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-list-"));
  logs = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** Keadaan tiruan: nama sesi tmux yang hidup dan pid yang hidup. */
type World = { sessions: Set<string>; alive: Set<number>; tmuxError?: boolean };
const world = (sessions: string[] = [], alive: number[] = []): World => ({ sessions: new Set(sessions), alive: new Set(alive) });

function probeDeps(w: World) {
  const asked: string[] = [];
  return {
    asked,
    deps: {
      dataDir: home,
      tmux: {
        hasSession: async (name: string) => {
          asked.push(name);
          if (w.tmuxError) throw new Error("tmux tidak ada");
          return w.sessions.has(name);
        },
      },
      isAlive: (pid: number) => w.alive.has(pid),
      log: (m: string) => logs.push(m),
    },
  };
}

function writeReg(bots: Record<string, unknown>) {
  writeFileSync(registryPath(home), JSON.stringify({ bots }, null, 2));
}
const rec = (username: string, status: string) => ({ telegramId: 1, username, status, createdAt: "2026-11-13T00:00:00Z" });

/** Folder bot di bots/<nama>/state, opsional dengan bot.pid dan token di .env. */
function botFolder(name: string, pid?: number) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, ".env"), `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\n`);
  if (pid !== undefined) writeFileSync(join(state, "bot.pid"), String(pid));
}

/** Potret isi folder data (nama, ukuran, mtime) untuk membuktikan /list tidak menulis apa pun. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const st = statSync(p);
      out.push(`${p} ${st.size} ${st.mtimeMs} ${st.mode}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Baris (blok) milik satu bot di balasan. */
function block(text: string, name: string): string {
  const b = text.split("\n\n").flatMap((s) => s.split(/\n(?=[•⚠])/)).find((s) => s.includes(`<b>${name}</b>`));
  if (!b) throw new Error(`blok ${name} tidak ada:\n${text}`);
  return b;
}

describe("probeBot: keadaan nyata", () => {
  const cases: Array<[string, string[], boolean, number[], Liveness]> = [
    ["sesi + plugin hidup", ["b"], true, [700], "alive"],
    ["sesi ada, bot.pid mati", ["b"], true, [], "plugin-dead"],
    ["sesi ada, tanpa bot.pid", ["b"], false, [], "plugin-dead"],
    ["tanpa sesi, plugin hidup", [], true, [700], "plugin-only"],
    ["tanpa sesi, bot.pid mati", [], true, [], "dead"],
    ["tanpa sesi, tanpa bot.pid", [], false, [], "dead"],
  ];
  for (const [label, sessions, withPid, alive, want] of cases) {
    test(label, async () => {
      botFolder("b", withPid ? 700 : undefined);
      expect(await probeBot("b", probeDeps(world(sessions, alive)).deps)).toBe(want);
    });
  }
  test("tmux error: tidak bisa diperiksa", async () => {
    const w = world();
    w.tmuxError = true;
    expect(await probeBot("b", probeDeps(w).deps)).toBe("unknown");
  });
});

describe("mismatch: aturan tanda tidak cocok per kasus", () => {
  const all: Liveness[] = ["alive", "plugin-dead", "plugin-only", "dead", "unknown"];
  const expected: Record<string, Liveness[]> = {
    active: ["plugin-dead", "plugin-only", "dead"],
    registered: ["dead"],
    stopped: ["alive", "plugin-dead", "plugin-only"],
    failed: [],
    "aneh-sekali": [],
  };
  for (const [status, bad] of Object.entries(expected)) {
    for (const live of all) {
      test(`${status} + ${live}: ${bad.includes(live) ? "tidak cocok" : "wajar"}`, () => {
        expect(mismatch(status, live) !== null).toBe(bad.includes(live));
      });
    }
  }
  test("status tak dikenal ditampilkan apa adanya; stopped = dihentikan", () => {
    expect(statusText("stopped")).toBe("dihentikan");
    expect(statusText("active")).toBe("aktif");
    expect(statusText("aneh-sekali")).toBe("aneh-sekali");
    expect(statusText(undefined)).toBe("(tidak ada)");
  });
});

describe("listReport", () => {
  test("setiap bot: nama, @username, status tercatat, keadaan nyata; urut nama", async () => {
    writeReg({
      "zz-hidup": rec("zz_bot", "active"),
      "aa-mati": rec("aa_bot", "active"),
      "mm-stop": rec("mm_bot", "stopped"),
      "mm-stop-hidup": rec("mh_bot", "stopped"),
      "ff-gagal": rec("ff_bot", "failed"),
      "xx-aneh": rec("xx_bot", "rusak-status"),
    });
    botFolder("zz-hidup", 901);
    botFolder("aa-mati", 902);
    botFolder("mm-stop");
    botFolder("mm-stop-hidup", 903);
    botFolder("ff-gagal");
    botFolder("xx-aneh");
    const { deps } = probeDeps(world(["zz-hidup", "mm-stop-hidup", "ff-gagal"], [901, 903]));
    const text = await listReport(deps);

    expect(text).toContain("<b>Bot terdaftar (6)</b>");
    const order = ["aa-mati", "ff-gagal", "mm-stop", "mm-stop-hidup", "xx-aneh", "zz-hidup"].map((n) => text.indexOf(`<b>${n}</b>`));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const hidup = block(text, "zz-hidup");
    expect(hidup).toContain("@zz_bot");
    expect(hidup).toContain("tercatat: aktif · nyata: hidup");
    expect(hidup).not.toContain("TIDAK COCOK");

    const mati = block(text, "aa-mati");
    expect(mati).toContain("tercatat: aktif · nyata: mati");
    expect(mati).toContain("TIDAK COCOK");
    expect(mati.startsWith("⚠️")).toBe(true);

    expect(block(text, "mm-stop")).toContain("tercatat: dihentikan · nyata: mati");
    expect(block(text, "mm-stop")).not.toContain("TIDAK COCOK");
    expect(block(text, "mm-stop-hidup")).toContain("TIDAK COCOK: tercatat dihentikan, tetapi masih berjalan");

    const gagal = block(text, "ff-gagal");
    expect(gagal).toContain("tercatat: gagal · nyata: sesi tmux ada, tetapi server plugin mati");
    expect(gagal).toContain("sesi dibiarkan untuk diperiksa");
    expect(gagal).not.toContain("TIDAK COCOK");

    expect(block(text, "xx-aneh")).toContain("tercatat: rusak-status · nyata: mati");
    expect(text).toContain("2 bot tidak cocok");
    expect(text).not.toContain("Tidak terdaftar");
    expect(text).not.toContain(BOT_TOKEN);
  });

  test("folder tidak terdaftar di bagian terpisah dengan hidup/mati; sesi tmux tanpa folder tidak tampil", async () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    botFolder("bot-01", 901);
    botFolder("uji-01", 902);
    botFolder("uji-02");
    mkdirSync(join(home, "bots", "Bukan_Nama"), { recursive: true });
    writeFileSync(join(home, "bots", "berkas-biasa"), "x");
    const { deps, asked } = probeDeps(world(["bot-01", "uji-01", "sesi-lain-pemilik", "main"], [901, 902]));
    const text = await listReport(deps);

    const parts = text.split("\n\n");
    const idx = parts.findIndex((p) => p.startsWith("<b>Tidak terdaftar, tidak dikelola master-bot (2)</b>"));
    expect(idx).toBeGreaterThan(0);
    const section = parts[idx]!;
    expect(section).toContain("• uji-01: hidup");
    expect(section).toContain("• uji-02: mati");
    expect(text).not.toContain("sesi-lain-pemilik");
    expect(text).not.toContain("main");
    expect(text).not.toContain("Bukan_Nama");
    expect(text).not.toContain("berkas-biasa");
    expect(asked.sort()).toEqual(["bot-01", "uji-01", "uji-02"]);
    expect(text).not.toContain(BOT_TOKEN);
  });

  test("registry kosong tanpa folder: jelaskan dan sebut cara mendaftar", async () => {
    const text = await listReport(probeDeps(world()).deps);
    expect(text).toBe(EMPTY_LIST.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    expect(text).toContain("/register &lt;nama&gt; &lt;token&gt;");
  });

  test("registry kosong tetapi ada folder tidak terdaftar: keduanya tampil", async () => {
    writeReg({});
    botFolder("uji-01");
    const text = await listReport(probeDeps(world(["uji-01"])).deps);
    expect(text).toContain("Belum ada bot terdaftar");
    expect(text).toContain("/register");
    expect(text).toContain("• uji-01: sesi tmux ada, tetapi server plugin mati");
  });

  test("registry rusak: pesan jelas, detail di log", async () => {
    writeFileSync(registryPath(home), "{bukan json");
    const text = await listReport(probeDeps(world()).deps);
    expect(text).toBe(REGISTRY_BROKEN);
    expect(logs.join("\n")).toContain("registry.json rusak");
  });

  test("tmux error per bot: ditampilkan tidak bisa diperiksa, tanpa tanda tidak cocok", async () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    const w = world();
    w.tmuxError = true;
    const text = await listReport(probeDeps(w).deps);
    expect(text).toContain("nyata: tidak bisa diperiksa");
    expect(text).not.toContain("TIDAK COCOK");
  });

  test("token tidak pernah muncul, juga kalau registry disunting dan berisi token; HTML di-escape", async () => {
    writeReg({
      "bot-01": { ...rec(BOT_TOKEN, BOT_TOKEN) },
      "bot-02": rec("<b>jahat</b>&", "active"),
    });
    botFolder("bot-01");
    const text = await listReport(probeDeps(world()).deps);
    expect(text).not.toContain(BOT_TOKEN);
    expect(text).not.toContain("AAFakeBotTokenForListCommand");
    expect(text).toContain("@&lt;b&gt;jahat&lt;/b&gt;&amp;");
  });

  test("hanya membaca: folder data tidak berubah sedikit pun", async () => {
    writeReg({ "bot-01": rec("satu_bot", "active"), "bot-02": rec("dua_bot", "stopped") });
    botFolder("bot-01", 901);
    botFolder("bot-02", 902);
    botFolder("uji-01", 903);
    const before = snapshot(home);
    await listReport(probeDeps(world(["bot-02"], [902])).deps);
    expect(snapshot(home)).toEqual(before);
  });
});

describe("/list lewat master-bot", () => {
  let tg: ReturnType<typeof startFakeTelegram>;
  beforeEach(() => (tg = startFakeTelegram(MASTER)));
  afterEach(() => tg.stop());

  const makeBot = (w: World) => {
    let launched = 0;
    const bot = createMasterBot({
      token: MASTER,
      ownerId: OWNER,
      log: (m) => logs.push(m),
      client: { apiRoot: tg.apiRoot },
      botInfo: ME,
      dataDir: home,
      launch: async () => {
        launched++;
        return { kind: "active", pid: 1 };
      },
      probe: probeDeps(w).deps,
    });
    return { bot, launched: () => launched };
  };

  test("membalas daftar sebagai HTML, tanpa token, tanpa menyalakan apa pun", async () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    botFolder("bot-01");
    const { bot, launched } = makeBot(world());
    await bot.handleUpdate(ownerDm("/list"));
    const sent = tg.calls.filter((c) => c.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.params.parse_mode).toBe("HTML");
    expect(String(sent[0]!.params.text)).toContain("<b>bot-01</b> @satu_bot");
    expect(String(sent[0]!.params.text)).toContain("TIDAK COCOK");
    expect(launched()).toBe(0);
    for (const c of tg.calls) expect(JSON.stringify(c.params)).not.toContain(BOT_TOKEN);
    expect(tg.calls.some((c) => c.method === "deleteMessage")).toBe(false);
  });

  test("registry kosong lewat Telegram: penjelasan dan cara mendaftar", async () => {
    const { bot } = makeBot(world());
    await bot.handleUpdate(ownerDm("/list"));
    const text = String(tg.calls.find((c) => c.method === "sendMessage")!.params.text);
    expect(text).toContain("Belum ada bot terdaftar");
    expect(text).toContain("/register");
  });

  test("/help menyebut /list", async () => {
    const { bot } = makeBot(world());
    await bot.handleUpdate(ownerDm("/help"));
    expect(String(tg.calls.find((c) => c.method === "sendMessage")!.params.text)).toContain("/list");
  });
});
