import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GrammyError, HttpError } from "grammy";
import { createMasterBot, launchReport, STATUS_NOT_RECORDED } from "../src/bot.ts";
import type { LaunchResult } from "../src/launch.ts";
import { createLogger } from "../src/log.ts";
import { readRegistry } from "../src/registry.ts";
import { sendWithRetry } from "../src/retry.ts";
import { fail, ME, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Token palsu.
const MASTER = "123456789:AAFakeMasterTokenForRetryFlow_abcdef";
const GOOD = "5001:AAGoodFakeTokenForRetryFlow_aaaaaaaaaa";
const botMe = () => ok({ id: 5001, is_bot: true, first_name: "uji", username: "uji_satu_bot" });

/** Sleep tiruan: mencatat jeda, dan melempar kalau total jeda jauh melewati batas. */
function fakeSleep() {
  const waits: number[] = [];
  const sleep = async (ms: number) => {
    waits.push(ms);
    if (waits.reduce((a, b) => a + b, 0) > 3_600_000) throw new Error("fake sleep: loop tidak berhenti");
  };
  return { waits, sleep };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("sendWithRetry: jeda dan batas", () => {
  test("gangguan terus-menerus: 2, 4, 8, 16, 32, lalu 60 detik, total sekitar 10 menit", async () => {
    const { waits, sleep } = fakeSleep();
    let calls = 0;
    const out = await sendWithRetry(
      async () => {
        calls++;
        throw new HttpError("Network request for 'sendMessage' failed!", new TypeError("fetch failed"));
      },
      undefined,
      { sleep },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.cause).toBe("exhausted");
      expect(out.reason).toContain("menyerah");
    }
    expect(waits.slice(0, 6)).toEqual([2000, 4000, 8000, 16000, 32000, 60000]);
    expect(Math.max(...waits)).toBe(60000);
    expect(sum(waits)).toBeGreaterThanOrEqual(570_000);
    expect(sum(waits)).toBeLessThanOrEqual(660_000);
    expect(calls).toBe(waits.length + 1);
  });

  test("429 menunggu retry_after dari Telegram", async () => {
    const { waits, sleep } = fakeSleep();
    let n = 0;
    const out = await sendWithRetry(
      async () => {
        if (n++ === 0) {
          throw new GrammyError(
            "Call to 'sendMessage' failed!",
            { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 } },
            "sendMessage",
            {},
          );
        }
      },
      undefined,
      { sleep },
    );
    expect(out).toEqual({ ok: true, attempts: 2 });
    expect(waits).toEqual([7000]);
  });

  for (const code of [400, 401, 403, 404]) {
    test(`${code} tidak dicoba ulang`, async () => {
      const { waits, sleep } = fakeSleep();
      let calls = 0;
      const out = await sendWithRetry(
        async () => {
          calls++;
          throw new GrammyError("Call to 'sendMessage' failed!", { ok: false, error_code: code, description: "x" }, "sendMessage", {});
        },
        undefined,
        { sleep },
      );
      expect(calls).toBe(1);
      expect(waits).toEqual([]);
      expect(out.ok === false && out.cause).toBe("permanent");
    });
  }

  test("error yang bukan dari Telegram tidak dicoba ulang", async () => {
    const { waits, sleep } = fakeSleep();
    const out = await sendWithRetry(
      async () => {
        throw new Error("lain");
      },
      undefined,
      { sleep },
    );
    expect(waits).toEqual([]);
    expect(out.ok === false && out.cause).toBe("permanent");
  });
});

let home: string;
let logs: string[];
let tg: ReturnType<typeof startFakeTelegram>;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-retry-"));
  logs = [];
});
afterEach(() => {
  tg?.stop();
  rmSync(home, { recursive: true, force: true });
});

const isReport = (p: Record<string, unknown>) => !String(p.text).includes("Menyalakan");

type Setup = {
  /** Handler sendMessage untuk laporan (bukan balasan "Menyalakan"). */
  report?: (n: number) => ReturnType<typeof ok> | undefined;
  /** Jumlah laporan pertama yang gagal di tingkat jaringan. */
  networkFails?: number;
  launch?: (name: string) => Promise<LaunchResult>;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  failStatusWrite?: boolean;
};

function setup(s: Setup) {
  let reportCalls = 0;
  tg = startFakeTelegram(
    MASTER,
    {
      sendMessage: (p) => {
        if (isReport(p) && s.report) {
          const r = s.report(reportCalls++);
          if (r) return r;
        }
        return ok({ message_id: 1, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text });
      },
    },
    { [GOOD]: botMe },
  );
  let netLeft = s.networkFails ?? 0;
  const netAttempts = { count: 0 };
  const realFetch = fetch;
  const wrapped = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/sendMessage") && !String(init?.body).includes("Menyalakan")) {
      netAttempts.count++;
      if (netLeft > 0) {
        netLeft--;
        throw new TypeError("fetch failed");
      }
    }
    return realFetch(url, init);
  }) as typeof fetch;
  let launched = false;
  const { waits, sleep } = fakeSleep();
  const pending: Promise<void>[] = [];
  const write = (line: string) => logs.push(line);
  const bot = createMasterBot({
    token: MASTER,
    ownerId: OWNER,
    log: createLogger([MASTER], write),
    client: { apiRoot: tg.apiRoot, fetch: wrapped },
    botInfo: ME,
    dataDir: home,
    getMeTimeoutMs: 200,
    registryHooks: {
      beforeRename: () => {
        if (s.failStatusWrite && launched) throw new Error("disk penuh");
      },
    },
    launch: async (name) => {
      launched = true;
      return s.launch ? s.launch(name) : { kind: "active", pid: 1 };
    },
    stop: () => Promise.reject(new Error("tidak dipakai di tes kirim ulang")),
    onLaunch: (p) => pending.push(p),
    signal: s.signal,
    reportRetry: { sleep: s.sleep ?? sleep },
  });
  const reports = () => tg.calls.filter((c) => c.method === "sendMessage" && isReport(c.params));
  return {
    run: async () => {
      await bot.handleUpdate(ownerDm(`/register bot-01 ${GOOD}`));
      await Promise.all(pending);
    },
    waits,
    reports,
    netAttempts,
  };
}

const noToken = () => {
  for (const l of logs) {
    expect(l).not.toContain(MASTER);
    expect(l).not.toContain(GOOD);
  }
};

describe("laporan penyalaan dikirim ulang", () => {
  test("error jaringan 3 kali, lalu pulih: laporan 'aktif' tetap sampai", async () => {
    const t = setup({ networkFails: 3 });
    await t.run();
    expect(t.netAttempts.count).toBe(4);
    expect(t.waits).toEqual([2000, 4000, 8000]);
    expect(t.reports()).toHaveLength(1);
    expect(String(t.reports()[0]!.params.text)).toContain("aktif");
    expect(logs.some((l) => l.includes("terkirim pada percobaan 4"))).toBe(true);
    expect(logs.filter((l) => l.includes("dicoba lagi dalam"))).toHaveLength(3);
    noToken();
  });

  test("5xx beberapa kali, lalu pulih: laporan 'gagal' tetap sampai", async () => {
    const t = setup({
      report: (n) => (n < 2 ? fail(502, "Bad Gateway") : undefined),
      launch: async () => ({ kind: "failed", reason: "belum siap setelah 90 detik", sessionAlive: false }),
    });
    await t.run();
    expect(t.waits).toEqual([2000, 4000]);
    const r = t.reports();
    expect(r).toHaveLength(3);
    expect(String(r[2]!.params.text)).toContain("gagal dinyalakan");
    noToken();
  });

  test("429: menunggu retry_after, lalu terkirim", async () => {
    const t = setup({
      report: (n) =>
        n === 0
          ? { status: 429, body: { ok: false, error_code: 429, description: "Too Many Requests: retry after 5", parameters: { retry_after: 5 } } }
          : undefined,
    });
    await t.run();
    expect(t.waits).toEqual([5000]);
    expect(t.reports()).toHaveLength(2);
  });

  for (const code of [400, 403]) {
    test(`${code}: tidak dicoba ulang dan langsung dicatat di log`, async () => {
      const t = setup({ report: () => fail(code, code === 403 ? "Forbidden: bot was blocked by the user" : "Bad Request") });
      await t.run();
      expect(t.reports()).toHaveLength(1);
      expect(t.waits).toEqual([]);
      const line = logs.find((l) => l.includes("laporan penyalaan 'bot-01' tidak terkirim"));
      expect(line).toBeDefined();
      expect(line).toContain(String(code));
      noToken();
    });
  }

  test("percobaan habis: log menyebut laporan tidak terkirim dan alasannya, tanpa token", async () => {
    const t = setup({ networkFails: 1_000 });
    await t.run();
    expect(sum(t.waits)).toBeGreaterThanOrEqual(570_000);
    const line = logs.find((l) => l.includes("laporan penyalaan 'bot-01' tidak terkirim"));
    expect(line).toContain("Network request for 'sendMessage' failed!");
    expect(line).toContain("menyerah");
    noToken();
  });

  test("master-bot berhenti saat menunggu kirim ulang: percobaan dihentikan seketika dan dicatat", async () => {
    const ac = new AbortController();
    const started = Date.now();
    // Jeda asli (bisa dibatalkan) yang panjang; dibatalkan begitu jeda pertama dimulai.
    const t = setup({
      networkFails: 1_000,
      signal: ac.signal,
      sleep: (ms, signal) =>
        new Promise((resolve) => {
          const timer = setTimeout(resolve, ms * 1000);
          signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
          queueMicrotask(() => ac.abort());
        }),
    });
    await t.run();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(t.netAttempts.count).toBe(1);
    const line = logs.find((l) => l.includes("laporan penyalaan 'bot-01' tidak terkirim"));
    expect(line).toContain("master-bot berhenti");
    noToken();
  });

  test("master-bot sudah berhenti sebelum laporan siap: tidak dikirim, dicatat", async () => {
    const ac = new AbortController();
    const t = setup({
      signal: ac.signal,
      launch: async () => {
        ac.abort();
        return { kind: "active", pid: 1 };
      },
    });
    await t.run();
    expect(t.reports()).toHaveLength(0);
    expect(logs.some((l) => l.includes("laporan penyalaan 'bot-01' tidak terkirim: master-bot berhenti"))).toBe(true);
  });
});

describe("status registry di laporan", () => {
  test("gagal dinyalakan dan status tercatat: 'Status tercatat failed'", async () => {
    const t = setup({ launch: async () => ({ kind: "failed", reason: "x", sessionAlive: false }) });
    await t.run();
    const text = String(t.reports()[0]!.params.text);
    expect(text).toContain("Status tercatat 'failed'");
    expect(text).not.toContain(STATUS_NOT_RECORDED);
    expect(readRegistry(home).bots["bot-01"]!.status).toBe("failed");
  });

  test("gagal dinyalakan dan status gagal dicatat: kalimat pengganti", async () => {
    const t = setup({ failStatusWrite: true, launch: async () => ({ kind: "failed", reason: "x", sessionAlive: false }) });
    await t.run();
    const text = String(t.reports()[0]!.params.text);
    expect(text).not.toContain("Status tercatat");
    expect(text).toContain(STATUS_NOT_RECORDED);
    expect(readRegistry(home).bots["bot-01"]!.status).toBe("registered");
    expect(logs.some((l) => l.includes("status 'bot-01' gagal dicatat: disk penuh"))).toBe(true);
  });

  test("aktif dan status gagal dicatat: laporan aktif memuat kalimat pengganti", async () => {
    const t = setup({ failStatusWrite: true });
    await t.run();
    const text = String(t.reports()[0]!.params.text);
    expect(text).toContain("aktif");
    expect(text).toContain(STATUS_NOT_RECORDED);
  });

  test("aktif dan status tercatat: tanpa kalimat status", () => {
    const text = launchReport("a", "u", { kind: "active", pid: 1 });
    expect(text).not.toContain(STATUS_NOT_RECORDED);
    expect(text).not.toContain("Status tercatat");
  });

  test("sudah berjalan: tanpa kalimat status", () => {
    const text = launchReport("a", "u", { kind: "already-running", reason: "r" }, true);
    expect(text).not.toContain("Status");
  });
});
