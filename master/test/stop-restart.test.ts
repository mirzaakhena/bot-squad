import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, createMasterBot, helpText, NEW_USAGE, RESTART_USAGE, STOP_USAGE } from "../src/bot.ts";
import type { ConversationMode, LaunchResult } from "../src/launch.ts";
import { readRegistry, registryPath, writeRegistry, type BotStatus } from "../src/registry.ts";
import type { StopResult } from "../src/stop.ts";
import { ME, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Token palsu. Nama bot di file ini unik (sr-*), karena kunci "sedang
// diproses" berlaku untuk seluruh proses tes.
const MASTER = "123456789:AAFakeMasterTokenForStopRestart_abcd";
const NEWTOKEN = "5009:AANewFakeTokenForStopRestartTests_aaaa";

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-stoprestart-"));
  logs = [];
  tg = startFakeTelegram(MASTER, {}, { [NEWTOKEN]: () => ok({ id: 5009, is_bot: true, first_name: "b", username: "sr_baru_bot" }) });
});
afterEach(() => {
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

const CLEAN: StopResult = { wasRunning: true, killed: [], sessionLeft: false, pidsLeft: [] };

function seed(bots: Record<string, BotStatus>) {
  const reg = { bots: {} as Record<string, any> };
  let id = 7000;
  for (const [name, status] of Object.entries(bots)) {
    reg.bots[name] = { telegramId: id++, username: `${name.replace(/-/g, "_")}_bot`, status, createdAt: "2026-11-13T00:00:00.000Z" };
  }
  writeRegistry(home, reg);
}

type Calls = Array<["stop" | "launch", string]>;

function makeBot(o: {
  stop?: (name: string) => Promise<StopResult>;
  launch?: (name: string) => Promise<LaunchResult>;
  failStatusWrite?: boolean;
}) {
  const calls: Calls = [];
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
    registryHooks: o.failStatusWrite
      ? {
          beforeRename: () => {
            throw new Error("disk penuh");
          },
        }
      : undefined,
    stop: async (name) => {
      calls.push(["stop", name]);
      return o.stop ? o.stop(name) : CLEAN;
    },
    launch: async (name, mode) => {
      calls.push(["launch", name]);
      modes.push(mode);
      return o.launch ? o.launch(name) : { kind: "active", pid: 4242 };
    },
    onLaunch: (p) => pending.push(p),
  });
  return { bot, calls, modes, settle: () => Promise.all(pending) };
}

const texts = () => tg.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
const status = (name: string) => readRegistry(home).bots[name]?.status;

describe("menu", () => {
  test("/stop dan /restart ada di daftar perintah", () => {
    expect(COMMANDS.map((c) => c.command)).toEqual(expect.arrayContaining(["stop", "restart"]));
  });
});

describe("/stop", () => {
  test("menghentikan bot: 'Menghentikan...', lalu laporan; status stopped; bot lain tidak tersentuh", async () => {
    seed({ "sr-a1": "active", "sr-a2": "active" });
    const { bot, calls, settle } = makeBot({});
    await bot.handleUpdate(ownerDm("/stop sr-a1"));
    await settle();
    expect(calls).toEqual([["stop", "sr-a1"]]);
    const t = texts();
    expect(t).toHaveLength(2);
    expect(t[0]).toBe("Menghentikan 'sr-a1'...");
    expect(t[1]).toContain("@sr_a1_bot ('sr-a1') dihentikan.");
    expect(t[1]).toContain("Status tercatat 'stopped'. Nyalakan lagi dengan /restart sr-a1.");
    expect(t[1]).not.toContain("Peringatan");
    expect(status("sr-a1")).toBe("stopped");
    expect(status("sr-a2")).toBe("active");
  });

  test("status dicatat stopped sebelum bot dimatikan", async () => {
    seed({ "sr-b1": "active" });
    let seen: string | undefined;
    const { bot, settle } = makeBot({
      stop: async () => {
        seen = status("sr-b1");
        return CLEAN;
      },
    });
    await bot.handleUpdate(ownerDm("/stop sr-b1"));
    await settle();
    expect(seen).toBe("stopped");
  });

  for (const from of ["failed", "registered", "stopped"] as const) {
    test(`bot berstatus ${from} yang tidak berjalan: 'memang sudah tidak berjalan', status stopped`, async () => {
      const name = `sr-c-${from}`;
      seed({ [name]: from });
      const { bot, settle } = makeBot({ stop: async () => ({ ...CLEAN, wasRunning: false }) });
      await bot.handleUpdate(ownerDm(`/stop ${name}`));
      await settle();
      expect(texts()[1]).toContain(`('${name}') memang sudah tidak berjalan.`);
      expect(status(name)).toBe("stopped");
    });
  }

  test("server plugin dimatikan paksa: disebut di laporan", async () => {
    seed({ "sr-d1": "active" });
    const { bot, settle } = makeBot({ stop: async () => ({ ...CLEAN, killed: [{ pid: 321, signal: "SIGKILL" }] }) });
    await bot.handleUpdate(ownerDm("/stop sr-d1"));
    await settle();
    expect(texts()[1]).toContain("dimatikan paksa: pid 321 (SIGKILL)");
    expect(status("sr-d1")).toBe("stopped");
  });

  test("tidak bersih (server plugin tersisa): tetap stopped, peringatan dengan pid", async () => {
    seed({ "sr-e1": "active" });
    const { bot, settle } = makeBot({
      stop: async () => ({ ...CLEAN, killed: [{ pid: 321, signal: "SIGKILL" }, { pid: 322, signal: "SIGKILL" }], pidsLeft: [321, 322] }),
    });
    await bot.handleUpdate(ownerDm("/stop sr-e1"));
    await settle();
    const t = texts()[1]!;
    expect(t).toContain("Peringatan: 'sr-e1' tidak bersih dihentikan: server plugin masih hidup: pid 321, 322.");
    expect(t).not.toContain("dimatikan paksa");
    expect(t).toContain("Status tercatat 'stopped'");
    expect(status("sr-e1")).toBe("stopped");
  });

  test("tidak bersih (sesi tmux masih hidup): tetap stopped, peringatan", async () => {
    seed({ "sr-e2": "active" });
    const { bot, settle } = makeBot({ stop: async () => ({ ...CLEAN, sessionLeft: true }) });
    await bot.handleUpdate(ownerDm("/stop sr-e2"));
    await settle();
    expect(texts()[1]).toContain("sesi tmux 'sr-e2' masih hidup");
    expect(status("sr-e2")).toBe("stopped");
  });

  test("tmux/proses tidak bisa diperiksa: tetap stopped, peringatan", async () => {
    seed({ "sr-e3": "active" });
    const { bot, settle } = makeBot({ stop: async () => ({ ...CLEAN, error: "ps keluar dengan kode 1" }) });
    await bot.handleUpdate(ownerDm("/stop sr-e3"));
    await settle();
    expect(texts()[1]).toContain("tidak bisa diperiksa (ps keluar dengan kode 1)");
    expect(status("sr-e3")).toBe("stopped");
  });

  test("stop melempar error: dilaporkan sebagai peringatan, status stopped", async () => {
    seed({ "sr-e4": "active" });
    const { bot, settle } = makeBot({ stop: async () => { throw new Error("boom"); } });
    await bot.handleUpdate(ownerDm("/stop sr-e4"));
    await settle();
    expect(texts()[1]).toContain("Peringatan");
    expect(status("sr-e4")).toBe("stopped");
  });

  test("pid bot.pid yang tidak dikenali disebut di laporan", async () => {
    seed({ "sr-e5": "active" });
    const { bot, settle } = makeBot({ stop: async () => ({ ...CLEAN, unrecognizedPid: 777 }) });
    await bot.handleUpdate(ownerDm("/stop sr-e5"));
    await settle();
    expect(texts()[1]).toContain("bot.pid menunjuk pid 777");
  });

  test("status gagal ditulis: tetap dihentikan, laporan menyebutnya", async () => {
    seed({ "sr-f1": "active" });
    const { bot, calls, settle } = makeBot({ failStatusWrite: true });
    await bot.handleUpdate(ownerDm("/stop sr-f1"));
    await settle();
    expect(calls).toEqual([["stop", "sr-f1"]]);
    expect(texts()[1]).toContain("Status di registry gagal dicatat");
    expect(status("sr-f1")).toBe("active");
  });
});

describe("nama ditolak", () => {
  for (const cmd of ["stop", "restart"] as const) {
    test(`/${cmd} untuk nama tak terdaftar: ditolak, tidak ada yang disentuh`, async () => {
      seed({ "sr-g1": "active" });
      const before = readFileSync(registryPath(home), "utf8");
      const { bot, calls, settle } = makeBot({});
      await bot.handleUpdate(ownerDm(`/${cmd} sr-tidak-ada`));
      await settle();
      expect(calls).toEqual([]);
      expect(texts()).toHaveLength(1);
      expect(texts()[0]).toContain("Bot 'sr-tidak-ada' tidak terdaftar.");
      expect(readFileSync(registryPath(home), "utf8")).toBe(before);
    });

    for (const [label, arg] of [
      // Tanpa argumen sama sekali: pemilih bot (tiket 261115202403, picker.test.ts).
      ["nama tak sah", "Sr-G1"],
      ["path", "../sr-g1"],
      ["dua nama", "sr-g1 sr-g2"],
    ] as const) {
      test(`/${cmd} ${label}: cara pakai`, async () => {
        seed({ "sr-g1": "active" });
        const { bot, calls, settle } = makeBot({});
        await bot.handleUpdate(ownerDm(`/${cmd} ${arg}`.trim()));
        await settle();
        expect(calls).toEqual([]);
        expect(texts()).toEqual([cmd === "stop" ? STOP_USAGE : RESTART_USAGE]);
        expect(texts()[0]).toStartWith(`Cara pakai: /${cmd} <nama>`);
        expect(status("sr-g1")).toBe("active");
      });
    }

    test(`/${cmd} saat registry rusak: ditolak dengan alasan`, async () => {
      await Bun.write(registryPath(home), "{rusak");
      const { bot, calls, settle } = makeBot({});
      await bot.handleUpdate(ownerDm(`/${cmd} sr-g1`));
      await settle();
      expect(calls).toEqual([]);
      expect(texts()[0]).toContain("registry.json rusak");
    });
  }
});

describe("/restart", () => {
  for (const from of ["active", "failed", "stopped", "registered"] as const) {
    test(`bot berstatus ${from}: dimatikan lalu dinyalakan, 'aktif', status active`, async () => {
      const name = `sr-h-${from}`;
      seed({ [name]: from, "sr-h-lain": "failed" });
      const { bot, calls, settle } = makeBot({});
      await bot.handleUpdate(ownerDm(`/restart ${name}`));
      await settle();
      expect(calls).toEqual([
        ["stop", name],
        ["launch", name],
      ]);
      const t = texts();
      expect(t[0]).toBe(`Menyalakan ulang '${name}', melanjutkan percakapan terakhir...\nUntuk percakapan baru: /new ${name}`);
      expect(t[1]).toContain(`('${name}') aktif.`);
      expect(status(name)).toBe("active");
      expect(status("sr-h-lain")).toBe("failed");
    });
  }

  test("gagal menyala: laporan gagal seperti registrasi, petunjuk /restart, status failed", async () => {
    seed({ "sr-i1": "stopped" });
    const { bot, settle } = makeBot({
      launch: async () => ({ kind: "failed", reason: "belum siap setelah 90 detik", sessionAlive: true, screen: "layar <x>" }),
    });
    await bot.handleUpdate(ownerDm("/restart sr-i1"));
    await settle();
    const t = texts()[1]!;
    expect(t).toContain("gagal dinyalakan: belum siap setelah 90 detik.");
    expect(t).toContain("<pre>layar &lt;x&gt;</pre>");
    expect(t).toContain("<code>tmux attach -t sr-i1</code>");
    expect(t).toContain("Status tercatat 'failed'. Coba lagi dengan /restart sr-i1.");
    expect(t).not.toContain("belum tersedia");
    expect(status("sr-i1")).toBe("failed");
  });

  test("bot lama tidak bisa dimatikan bersih: tidak dinyalakan, status tidak diubah", async () => {
    seed({ "sr-j1": "active" });
    const { bot, calls, settle } = makeBot({ stop: async () => ({ ...CLEAN, pidsLeft: [555] }) });
    await bot.handleUpdate(ownerDm("/restart sr-j1"));
    await settle();
    expect(calls).toEqual([["stop", "sr-j1"]]);
    expect(texts()[1]).toContain("tidak dinyalakan ulang");
    expect(texts()[1]).toContain("pid 555");
    expect(status("sr-j1")).toBe("active");
  });
});

describe("bot yang sedang diproses", () => {
  /** Pekerjaan yang ditahan sampai dilepas. */
  function gate<T>() {
    let open!: (v: T) => void;
    const p = new Promise<T>((r) => (open = r));
    return { p, open };
  }

  test("/stop dan /restart saat /restart sedang menyalakan: ditolak; tidak menyala dua kali", async () => {
    seed({ "sr-k1": "failed" });
    const g = gate<LaunchResult>();
    const { bot, calls, settle } = makeBot({ launch: () => g.p });
    await bot.handleUpdate(ownerDm("/restart sr-k1"));
    await Bun.sleep(20);
    await bot.handleUpdate(ownerDm("/restart sr-k1"));
    await bot.handleUpdate(ownerDm("/stop sr-k1"));
    const t = texts();
    expect(t[1]).toBe("'sr-k1' sedang dinyalakan ulang, coba lagi setelah selesai.");
    expect(t[2]).toBe("'sr-k1' sedang dinyalakan ulang, coba lagi setelah selesai.");
    g.open({ kind: "active", pid: 1 });
    await settle();
    expect(calls).toEqual([
      ["stop", "sr-k1"],
      ["launch", "sr-k1"],
    ]);
    expect(status("sr-k1")).toBe("active");
    // Setelah selesai, perintah diterima lagi.
    await bot.handleUpdate(ownerDm("/stop sr-k1"));
    await settle();
    expect(status("sr-k1")).toBe("stopped");
  });

  test("/stop dan /restart saat /stop sedang berjalan: ditolak", async () => {
    seed({ "sr-k2": "active" });
    const g = gate<StopResult>();
    const { bot, calls, settle } = makeBot({ stop: () => g.p });
    await bot.handleUpdate(ownerDm("/stop sr-k2"));
    await bot.handleUpdate(ownerDm("/restart sr-k2"));
    await bot.handleUpdate(ownerDm("/stop sr-k2"));
    expect(texts()[1]).toBe("'sr-k2' sedang dihentikan, coba lagi setelah selesai.");
    expect(texts()[2]).toBe("'sr-k2' sedang dihentikan, coba lagi setelah selesai.");
    g.open(CLEAN);
    await settle();
    expect(calls).toEqual([["stop", "sr-k2"]]);
    expect(status("sr-k2")).toBe("stopped");
  });

  test("/stop dan /restart saat bot baru sedang dinyalakan setelah /register: ditolak", async () => {
    const g = gate<LaunchResult>();
    const { bot, calls, settle } = makeBot({ launch: () => g.p });
    await bot.handleUpdate(ownerDm(`/register sr-k3 ${NEWTOKEN}`));
    await bot.handleUpdate(ownerDm("/stop sr-k3"));
    await bot.handleUpdate(ownerDm("/restart sr-k3"));
    const t = texts();
    expect(t[1]).toBe("'sr-k3' sedang dinyalakan, coba lagi setelah selesai.");
    expect(t[2]).toBe("'sr-k3' sedang dinyalakan, coba lagi setelah selesai.");
    g.open({ kind: "active", pid: 1 });
    await settle();
    expect(calls).toEqual([["launch", "sr-k3"]]);
    expect(status("sr-k3")).toBe("active");
  });

  test("kunci per bot: bot lain tetap bisa diproses", async () => {
    seed({ "sr-k4": "active", "sr-k5": "active" });
    const g = gate<StopResult>();
    const { bot, calls, settle } = makeBot({ stop: (n) => (n === "sr-k4" ? g.p : Promise.resolve(CLEAN)) });
    await bot.handleUpdate(ownerDm("/stop sr-k4"));
    await bot.handleUpdate(ownerDm("/stop sr-k5"));
    g.open(CLEAN);
    await settle();
    expect(calls).toEqual([
      ["stop", "sr-k4"],
      ["stop", "sr-k5"],
    ]);
    expect(status("sr-k5")).toBe("stopped");
  });

  test("kunci dilepas walau /restart error", async () => {
    seed({ "sr-k6": "active" });
    const { bot, settle } = makeBot({ launch: async () => { throw new Error("boom"); } });
    await bot.handleUpdate(ownerDm("/restart sr-k6"));
    await settle();
    expect(status("sr-k6")).toBe("failed");
    await bot.handleUpdate(ownerDm("/stop sr-k6"));
    await settle();
    expect(status("sr-k6")).toBe("stopped");
  });
});

// ---------------------------------------------------------------------------
// Tiket 261115100301: /restart melanjutkan percakapan terakhir. Percakapan baru lewat
// /new (tiket 261115202401, master/test/new.test.ts); /restart <nama> new tidak berlaku lagi.

describe("/restart dan percakapan (261115100301)", () => {
  test("/restart <nama>: dinyalakan dengan mode continue; kedua balasan menyebut percakapan dilanjutkan", async () => {
    seed({ "sr-p1": "active" });
    const { bot, calls, modes, settle } = makeBot({
      launch: async () => ({ kind: "active", pid: 1, conversation: { kind: "continued" } }),
    });
    await bot.handleUpdate(ownerDm("/restart sr-p1"));
    await settle();
    expect(calls).toEqual([["stop", "sr-p1"], ["launch", "sr-p1"]]);
    expect(modes).toEqual(["continue"]);
    const t = texts();
    expect(t[0]).toContain("melanjutkan percakapan terakhir");
    expect(t[1]).toContain("('sr-p1') aktif.");
    expect(t[1]).toContain("Percakapan terakhir dilanjutkan.");
    expect(t[1]).not.toContain("Percakapan baru");
    expect(status("sr-p1")).toBe("active");
  });

  test("/restart <nama> tanpa percakapan sebelumnya: aktif (bukan gagal), laporan menjelaskan", async () => {
    seed({ "sr-p3": "failed" });
    const { bot, modes, settle } = makeBot({
      launch: async () => ({ kind: "active", pid: 1, conversation: { kind: "new", why: "no-history" } }),
    });
    await bot.handleUpdate(ownerDm("/restart sr-p3"));
    await settle();
    expect(modes).toEqual(["continue"]);
    const t = texts();
    expect(t[1]).toContain("('sr-p3') aktif.");
    expect(t[1]).toContain("Percakapan baru dimulai: belum ada percakapan sebelumnya di folder kerja bot ini.");
    expect(t[1]).not.toContain("gagal");
    expect(status("sr-p3")).toBe("active");
  });

  test("percakapan gagal dilanjutkan lalu bot menyala kosong: aktif, alasan di laporan (HTML di-escape)", async () => {
    seed({ "sr-p4": "active" });
    const { bot, settle } = makeBot({
      launch: async () => ({ kind: "active", pid: 1, conversation: { kind: "new", why: "continue-failed", reason: "dialog <x>" } }),
    });
    await bot.handleUpdate(ownerDm("/restart sr-p4"));
    await settle();
    const t = texts();
    expect(t[1]).toContain("('sr-p4') aktif.");
    expect(t[1]).toContain("Percakapan baru dimulai: percakapan terakhir tidak bisa dilanjutkan (dialog &lt;x&gt;). Lihat log master-bot.");
    expect(status("sr-p4")).toBe("active");
  });

  test("hasil tanpa keterangan percakapan: laporan menyebut percakapan dilanjutkan", async () => {
    seed({ "sr-p5": "active" });
    const { bot, settle } = makeBot({});
    await bot.handleUpdate(ownerDm("/restart sr-p5"));
    await settle();
    expect(texts()[1]).toContain("Percakapan terakhir dilanjutkan.");
  });

  for (const [label, arg] of [
    ["new", "sr-p6 new"],
    ["kata lain", "sr-p6 baru"],
    ["huruf besar", "sr-p6 NEW"],
    ["tiga argumen", "sr-p6 new new"],
    ["new di depan", "new sr-p6"],
    ["nama tak sah dengan new", "Sr-P6 new"],
    ["token mirip new", "sr-p6 new!"],
    ["tak terdaftar dengan new", "sr-tidak-ada new"],
    ["bot bernama new dengan new", "new new"],
  ] as const) {
    test(`/restart ${label} ('${arg}'): cara pakai yang menyebut /new, bot tidak disentuh`, async () => {
      seed({ "sr-p6": "active", new: "active" });
      const before = readFileSync(registryPath(home), "utf8");
      const { bot, calls, settle } = makeBot({});
      await bot.handleUpdate(ownerDm(`/restart ${arg}`));
      await settle();
      expect(calls).toEqual([]);
      expect(texts()).toEqual([RESTART_USAGE]);
      expect(texts()[0]).toContain("Untuk percakapan baru: /new <nama>");
      expect(readFileSync(registryPath(home), "utf8")).toBe(before);
    });
  }

  test("bot bernama 'new' tetap bisa dinyalakan ulang, selalu melanjutkan", async () => {
    seed({ new: "active" });
    const { bot, calls, modes, settle } = makeBot({});
    await bot.handleUpdate(ownerDm("/restart new"));
    await settle();
    expect(calls.filter((c) => c[0] === "launch")).toEqual([["launch", "new"]]);
    expect(modes).toEqual(["continue"]);
  });

  test("/help, menu, dan cara pakai: /restart tanpa [new], ada /new <nama>, tidak ada /start", () => {
    expect(helpText()).toContain("/restart - Nyalakan ulang satu bot, percakapan dilanjutkan: /restart <nama>");
    expect(helpText()).toContain("/new - Mulai percakapan baru di satu bot (dengan konfirmasi): /new <nama>");
    expect(helpText()).not.toContain("[new]");
    expect(helpText()).not.toContain("/start");
    expect(COMMANDS.map((c) => c.command as string)).not.toContain("start");
    expect(COMMANDS.map((c) => c.command as string)).toContain("new");
    expect(RESTART_USAGE).toStartWith("Cara pakai: /restart <nama>\n");
    expect(RESTART_USAGE).not.toContain("[new]");
    expect(NEW_USAGE).toStartWith("Cara pakai: /new <nama>\n");
  });
});
