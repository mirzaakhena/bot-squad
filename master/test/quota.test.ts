import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMasterBot } from "../src/bot.ts";
import { duration, NO_QUOTA_DATA, QUOTA_REGISTRY_BROKEN, quotaReport, wibTime } from "../src/quota.ts";
import { registryPath } from "../src/registry.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Token palsu.
const MASTER = "123456789:AAFakeMasterTokenForQuotaCommand_abcd";

// 13 Nov 2026 10:00 WIB.
const NOW = Date.UTC(2026, 10, 13, 3, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const sec = (ms: number) => Math.floor(ms / 1000);

let home: string;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-quota-"));
  logs = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function writeReg(bots: Record<string, unknown>) {
  writeFileSync(registryPath(home), JSON.stringify({ bots }, null, 2));
}
const rec = (username: string, status: string) => ({ telegramId: 1, username, status, createdAt: "2026-11-13T00:00:00Z" });

function stateDir(name: string): string {
  const s = join(home, "bots", name, "state");
  mkdirSync(s, { recursive: true });
  return s;
}
/** status.json seperti yang ditulis bridge statusline. */
function capture(name: string, capturedAt: number, rateLimits?: unknown) {
  const payload: Record<string, unknown> = { context_window: { used_percentage: 12 } };
  if (rateLimits !== undefined) payload.rate_limits = rateLimits;
  writeFileSync(join(stateDir(name), "status.json"), JSON.stringify({ captured_at_ms: capturedAt, payload }));
}

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

const report = (now = NOW) => quotaReport({ dataDir: home, log: (m) => logs.push(m), now });

describe("format waktu", () => {
  test("durasi dua satuan terbesar", () => {
    expect(duration(30_000)).toBe("kurang dari 1 menit");
    expect(duration(45 * MIN)).toBe("45 menit");
    expect(duration(3 * HOUR)).toBe("3 jam");
    expect(duration(3 * HOUR + 5 * MIN)).toBe("3 jam 5 menit");
    expect(duration(2 * DAY + 3 * HOUR + 59 * MIN)).toBe("2 hari 3 jam");
    expect(duration(DAY)).toBe("1 hari");
  });
  test("jam WIB, tanggal hanya kalau bukan hari ini (WIB)", () => {
    expect(wibTime(NOW, NOW)).toBe("10:00 WIB");
    expect(wibTime(NOW + 13 * HOUR + 59 * MIN, NOW)).toBe("23:59 WIB");
    expect(wibTime(NOW + 14 * HOUR, NOW)).toBe("00:00 WIB, 14 Nov");
    expect(wibTime(NOW - 11 * HOUR, NOW)).toBe("23:00 WIB, 12 Nov");
    expect(wibTime(NOW + 60 * DAY, NOW)).toBe("10:00 WIB, 12 Jan 2027");
  });
});

describe("quotaReport", () => {
  test("data ada: 7 hari dan 5 jam, sisa, pulih, sumber, umur", () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    capture("bot-01", NOW - 5 * MIN, {
      five_hour: { used_percentage: 40, resets_at: sec(NOW + 2 * HOUR + 30 * MIN) },
      seven_day: { used_percentage: 36, resets_at: sec(NOW + 3 * DAY + 4 * HOUR) },
    });
    const text = report();
    expect(text).toContain("<b>5 jam</b>\n   terpakai 40% · sisa 60%\n   pulih dalam 2 jam 30 menit (12:30 WIB)");
    expect(text).toContain("<b>7 hari</b>\n   terpakai 36% · sisa 64%\n   pulih dalam 3 hari 4 jam (14:00 WIB, 16 Nov)");
    expect(text.indexOf("5 jam")).toBeLessThan(text.indexOf("7 hari"));
    expect(text).toContain("Data dari bot-01 (@satu_bot), diperbarui 5 menit lalu (09:55 WIB).");
    expect(text).not.toContain("basi");
  });

  test("hanya 7 hari: bagian 5 jam tidak ditampilkan", () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    capture("bot-01", NOW - 10_000, { seven_day: { used_percentage: 36.4, resets_at: sec(NOW + 5 * HOUR) } });
    const text = report();
    expect(text).not.toContain("5 jam</b>");
    expect(text).toContain("terpakai 36,4% · sisa 63,6%");
    expect(text).toContain("pulih dalam 5 jam (15:00 WIB)");
    expect(text).toContain("diperbarui baru saja (09:59 WIB)");
  });

  test("beberapa bot: satu tangkapan terbaru yang punya rate_limits, apa pun statusnya", () => {
    writeReg({
      "bot-a": rec("a_bot", "active"),
      "bot-b": rec("b_bot", "stopped"),
      "bot-c": rec("c_bot", "active"),
      "bot-d": rec("d_bot", "failed"),
    });
    // bot-a: lama, punya 5 jam dan 7 hari.
    capture("bot-a", NOW - 3 * HOUR, {
      five_hour: { used_percentage: 90, resets_at: sec(NOW + HOUR) },
      seven_day: { used_percentage: 20, resets_at: sec(NOW + DAY) },
    });
    // bot-b (stopped): paling baru yang punya rate_limits, hanya 7 hari.
    capture("bot-b", NOW - 20 * MIN, { seven_day: { used_percentage: 25, resets_at: sec(NOW + DAY) } });
    // bot-c: lebih baru, tetapi tanpa rate_limits.
    capture("bot-c", NOW - MIN);
    // bot-d: lebih baru, rate_limits kosong.
    capture("bot-d", NOW - 2 * MIN, {});
    const text = report();
    expect(text).toContain("Data dari bot-b (@b_bot), diperbarui 20 menit lalu (09:40 WIB).");
    expect(text).toContain("terpakai 25% · sisa 75%");
    // 5 jam tidak diambil dari tangkapan lain.
    expect(text).not.toContain("5 jam</b>");
    expect(text).not.toContain("90%");
  });

  test("umur lebih dari 6 jam diberi catatan basi; tepat 6 jam belum", () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    capture("bot-01", NOW - 6 * HOUR, { seven_day: { used_percentage: 10, resets_at: sec(NOW + DAY) } });
    expect(report()).not.toContain("basi");
    capture("bot-01", NOW - 6 * HOUR - MIN, { seven_day: { used_percentage: 10, resets_at: sec(NOW + DAY) } });
    const text = report();
    expect(text).toContain("diperbarui 6 jam 1 menit lalu (03:59 WIB).");
    expect(text).toContain("Mungkin basi; kirim pesan ke bot mana saja untuk memperbarui.");
    capture("bot-01", NOW - 2 * DAY, { seven_day: { used_percentage: 10, resets_at: sec(NOW + DAY) } });
    expect(report()).toContain("diperbarui 2 hari lalu (10:00 WIB, 11 Nov).");
  });

  test("jendela yang sudah lewat masa pulihnya: tanpa persen", () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    capture("bot-01", NOW - 8 * HOUR, {
      five_hour: { used_percentage: 77, resets_at: sec(NOW - 3 * HOUR) },
      seven_day: { used_percentage: 33, resets_at: sec(NOW + DAY) },
    });
    const text = report();
    expect(text).toContain("<b>5 jam</b>: sudah pulih, angka baru belum ada (pulih 07:00 WIB)");
    expect(text).not.toContain("77");
    expect(text).toContain("terpakai 33% · sisa 67%");
  });

  test("tidak ada data: penjelasan tanpa angka", () => {
    writeReg({ "bot-01": rec("satu_bot", "active"), "bot-02": rec("dua_bot", "registered") });
    capture("bot-01", NOW - MIN); // tanpa rate_limits
    stateDir("bot-02"); // tanpa status.json
    const text = report();
    expect(text).toBe(NO_QUOTA_DATA);
    expect(text).not.toMatch(/\d+%/);
  });

  test("registry kosong: tidak ada data", () => {
    expect(report()).toBe(NO_QUOTA_DATA);
  });

  test("registry rusak: pesan dan log", () => {
    writeFileSync(registryPath(home), "{rusak");
    expect(report()).toBe(QUOTA_REGISTRY_BROKEN);
    expect(logs.some((l) => l.startsWith("/quota:"))).toBe(true);
  });

  test("status.json rusak atau tak terbaca dilewati dan dicatat; bot tak terdaftar diabaikan", () => {
    writeReg({ "bot-a": rec("a_bot", "active"), "bot-b": rec("b_bot", "active") });
    capture("bot-a", NOW - HOUR, { seven_day: { used_percentage: 50, resets_at: sec(NOW + DAY) } });
    writeFileSync(join(stateDir("bot-b"), "status.json"), "{rusak");
    capture("liar", NOW, { seven_day: { used_percentage: 99, resets_at: sec(NOW + DAY) } });
    const text = report();
    expect(text).toContain("Data dari bot-a (@a_bot)");
    expect(text).not.toContain("99");
    expect(logs).toContain("/quota: status.json 'bot-b' dilewati: JSON rusak");
  });

  test("nama yang tidak sah di registry tidak dipakai sebagai path", () => {
    writeReg({ "../luar": rec("x_bot", "active") });
    mkdirSync(join(home, "luar", "state"), { recursive: true });
    writeFileSync(
      join(home, "luar", "state", "status.json"),
      JSON.stringify({ captured_at_ms: NOW, payload: { rate_limits: { seven_day: { used_percentage: 5, resets_at: sec(NOW + DAY) } } } }),
    );
    expect(report()).toBe(NO_QUOTA_DATA);
  });

  test("hanya membaca: isi folder data tidak berubah", () => {
    writeReg({ "bot-01": rec("satu_bot", "active") });
    capture("bot-01", NOW - MIN, { seven_day: { used_percentage: 36, resets_at: sec(NOW + DAY) } });
    chmodSync(join(home, "bots", "bot-01", "state", "status.json"), 0o600);
    const before = snapshot(home);
    report();
    expect(snapshot(home)).toEqual(before);
  });
});

describe("/quota lewat master-bot", () => {
  let tg: ReturnType<typeof startFakeTelegram>;
  beforeEach(() => (tg = startFakeTelegram(MASTER)));
  afterEach(() => tg.stop());

  const makeBot = () => {
    let touched = 0;
    const bot = createMasterBot({
      token: MASTER,
      ownerId: OWNER,
      log: (m) => logs.push(m),
      client: { apiRoot: tg.apiRoot },
      botInfo: ME,
      dataDir: home,
      now: () => NOW,
      launch: async () => {
        touched++;
        return { kind: "active", pid: 1 };
      },
      stop: async () => {
        touched++;
        return { wasRunning: false, killed: [], sessionLeft: false, pidsLeft: [] };
      },
      probe: {
        tmux: {
          hasSession: async () => {
            touched++;
            return false;
          },
        },
        isAlive: () => false,
      },
    });
    return { bot, touched: () => touched };
  };

  test("membalas sebagai HTML dari tangkapan terbaru, tanpa menyentuh bot", async () => {
    writeReg({ "bot-01": rec("satu_bot", "active"), "bot-02": rec("dua_bot", "active") });
    capture("bot-01", NOW - 2 * HOUR, { seven_day: { used_percentage: 30, resets_at: sec(NOW + DAY) } });
    capture("bot-02", NOW - 30 * MIN, { seven_day: { used_percentage: 31, resets_at: sec(NOW + DAY) } });
    const before = snapshot(home);
    const { bot, touched } = makeBot();
    await bot.handleUpdate(ownerDm("/quota"));
    const sent = tg.calls.filter((c) => c.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.params.parse_mode).toBe("HTML");
    const text = String(sent[0]!.params.text);
    expect(text).toContain("terpakai 31% · sisa 69%");
    expect(text).toContain("Data dari bot-02 (@dua_bot), diperbarui 30 menit lalu (09:30 WIB).");
    expect(touched()).toBe(0);
    expect(snapshot(home)).toEqual(before);
  });

  test("tanpa data lewat Telegram", async () => {
    const { bot } = makeBot();
    await bot.handleUpdate(ownerDm("/quota"));
    expect(String(tg.calls.find((c) => c.method === "sendMessage")!.params.text)).toBe(NO_QUOTA_DATA);
  });
});
