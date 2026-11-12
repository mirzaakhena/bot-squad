import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answerContext,
  contextAllowed,
  INSTALL_FILE,
  NOT_INSTALLED_TEXT,
  readCapturedStatus,
  refusedText,
  STATUS_FILE,
  STILL_EMPTY_TEXT,
  WAITING_TEXT,
  writeCapturedStatus,
} from "../context.ts";
import { renderContext } from "../context-render.ts";

/**
 * Tiket 261112230304. Payload di bawah meniru tangkapan nyata Claude Code
 * 2.1.323 (id sesi dan path diganti): sebelum giliran pertama
 * used_percentage null dan rate_limits tidak ada; sesudahnya rate_limits
 * hanya memuat seven_day.
 */
const FRESH = {
  session_id: "4bf16e50-0000-4000-8000-000000000000",
  cwd: "/home/u/.bot-squad/bots/bot-01/workspace",
  effort: { level: "medium" },
  model: { id: "claude-fable-5-2", display_name: "Fable 5.2" },
  version: "2.1.323",
  cost: { total_cost_usd: 0, total_duration_ms: 1874 },
  context_window: {
    total_input_tokens: 0,
    total_output_tokens: 0,
    context_window_size: 1000000,
    current_usage: null,
    used_percentage: null,
    remaining_percentage: null,
  },
  fast_mode: false,
  thinking: { enabled: true },
};
const AFTER_TURN = {
  ...FRESH,
  session_name: "Ok",
  cost: { total_cost_usd: 0.1962403 },
  context_window: { ...FRESH.context_window, total_input_tokens: 41032, used_percentage: 4, remaining_percentage: 96 },
  rate_limits: { seven_day: { used_percentage: 31, resets_at: 0 } },
};

// 2026-11-13 05:54:00 WIB = 2026-11-12T22:54:00Z
const CAPTURED = Date.UTC(2026, 10, 12, 22, 54, 0);
const NOW = CAPTURED + 3 * 60_000 + 10_000;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function stateDir() {
  const d = mkdtempSync(join(tmpdir(), "bot-squad-context-"));
  dirs.push(d);
  return d;
}
const installed = (state: string) =>
  writeFileSync(join(state, INSTALL_FILE), JSON.stringify({ kind: "installed", chained: null, at_ms: 1 }));

describe("renderContext (salinan mirza-bots) dengan payload nyata", () => {
  test("setelah satu giliran: Context, Rate Limit 7d saja, metadata, Last update", () => {
    const p = { ...AFTER_TURN, rate_limits: { seven_day: { used_percentage: 31, resets_at: Math.floor(NOW / 1000) + 2 * 86400 + 5 * 3600 + 120 } } };
    expect(renderContext({ captured_at_ms: CAPTURED, payload: p }, NOW)).toBe(
      [
        "Context",
        "◑○○○○○○○○○ 4%",
        "41.0k / 1M tokens",
        "",
        "Rate Limit 7d",
        "●●●○○○○○○○ 31%",
        "reset 2d 5h",
        "",
        "Fable 5.2",
        "Session: Ok (4bf16e50)",
        "CWD: …/bot-01/workspace",
        "Cost: $0.20",
        "Thinking: on",
        "Effort: medium",
        "Fast: off",
        "",
        "Last update: 05:54 WIB",
        "(3m ago)",
      ].join("\n"),
    );
  });

  test("Rate Limit 5h dan 7d tampil kalau ada, dengan reset berupa durasi", () => {
    const p = {
      ...AFTER_TURN,
      rate_limits: {
        five_hour: { used_percentage: 12.4, resets_at: Math.floor(NOW / 1000) + 2 * 3600 + 15 * 60 },
        seven_day: { used_percentage: 40, resets_at: Math.floor(NOW / 1000) + 59 * 60 },
      },
    };
    const out = renderContext({ captured_at_ms: CAPTURED, payload: p }, NOW);
    expect(out).toContain("Rate Limit 5h\n●◔○○○○○○○○ 12%\nreset 2h 15m");
    expect(out).toContain("Rate Limit 7d\n●●●●○○○○○○ 40%\nreset 59m");
  });

  test("sesi baru: Context '(tidak tersedia)', tanpa bagian Rate Limit dan tanpa 0%", () => {
    const out = renderContext({ captured_at_ms: CAPTURED, payload: FRESH }, NOW);
    expect(out.startsWith("Context\n(tidak tersedia)\n\n")).toBe(true);
    expect(out).not.toContain("Rate Limit");
    expect(out).not.toContain("0%");
  });

  test("rate limit tanpa persen maupun reset dihilangkan", () => {
    const p = { ...AFTER_TURN, rate_limits: { five_hour: {}, seven_day: { resets_at: Math.floor(NOW / 1000) + 3600 } } };
    const out = renderContext({ captured_at_ms: CAPTURED, payload: p }, NOW);
    expect(out).not.toContain("Rate Limit 5h");
    expect(out).toContain("Rate Limit 7d\nreset 1h");
  });

  test("metadata yang tidak ada dilewati barisnya", () => {
    const out = renderContext({ captured_at_ms: CAPTURED, payload: { context_window: { used_percentage: 50 } } }, NOW);
    expect(out).toBe("Context\n●●●●●○○○○○ 50%\n\nLast update: 05:54 WIB\n(3m ago)");
  });
});

describe("contextAllowed per kasus (Q1)", () => {
  const owner = { dmPolicy: "allowlist", allowFrom: ["111"] };
  test("pemilik di chat pribadi", () => expect(contextAllowed("private", 111, owner)).toBe(true));
  test("orang lain di chat pribadi", () => expect(contextAllowed("private", 222, owner)).toBe(false));
  test("orang lain saat dmPolicy pairing", () =>
    expect(contextAllowed("private", 222, { dmPolicy: "pairing", allowFrom: ["111"] })).toBe(false));
  test("pemilik di grup", () => expect(contextAllowed("group", 111, owner)).toBe(false));
  test("pemilik di supergroup", () => expect(contextAllowed("supergroup", 111, owner)).toBe(false));
  test("channel tanpa pengirim", () => expect(contextAllowed("channel", undefined, owner)).toBe(false));
  test("dmPolicy disabled", () => expect(contextAllowed("private", 111, { dmPolicy: "disabled", allowFrom: ["111"] })).toBe(false));
});

describe("berkas tangkapan", () => {
  test("ditulis atomik dengan izin 0600 dan dibaca kembali", () => {
    const s = stateDir();
    const path = join(s, STATUS_FILE);
    writeCapturedStatus(path, AFTER_TURN, CAPTURED);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readCapturedStatus(path)).toEqual({ kind: "ok", status: { captured_at_ms: CAPTURED, payload: AFTER_TURN } });
  });
  test("belum ada, JSON rusak, bentuk salah, dan tak bisa dibaca dibedakan", () => {
    const s = stateDir();
    const path = join(s, STATUS_FILE);
    expect(readCapturedStatus(path)).toEqual({ kind: "missing" });
    writeFileSync(path, "{rusak");
    expect(readCapturedStatus(path)).toEqual({ kind: "unreadable", reason: "JSON rusak" });
    writeFileSync(path, JSON.stringify({ payload: {} }));
    expect(readCapturedStatus(path).kind).toBe("unreadable");
    rmSync(path);
    mkdirSync(path);
    expect(readCapturedStatus(path)).toEqual({ kind: "unreadable", reason: "EISDIR" });
  });
});

function harness(state: string, onSleep?: (i: number) => void) {
  const sent: string[] = [];
  let sleeps = 0;
  return {
    sent,
    sleeps: () => sleeps,
    deps: {
      stateDir: state,
      now: () => NOW,
      sleep: async () => {
        onSleep?.(sleeps);
        if (++sleeps > 100) throw new Error("tunggu tidak berhenti");
      },
      send: async (t: string) => {
        sent.push(t);
      },
    },
  };
}

describe("answerContext: setiap jalan keluar", () => {
  test("data ada: satu balasan renderContext, tanpa menunggu", async () => {
    const s = stateDir();
    installed(s);
    writeCapturedStatus(join(s, STATUS_FILE), AFTER_TURN, CAPTURED);
    const h = harness(s);
    await answerContext(h.deps);
    expect(h.sent).toEqual([renderContext({ captured_at_ms: CAPTURED, payload: AFTER_TURN as never }, NOW)]);
    expect(h.sleeps()).toBe(0);
  });

  test("pemasangan ditolak: alasannya dilaporkan, walau ada status.json lama", async () => {
    const s = stateDir();
    writeFileSync(join(s, INSTALL_FILE), JSON.stringify({ kind: "refused", reason: "/x/settings.json tidak bisa dibaca", at_ms: 1 }));
    writeCapturedStatus(join(s, STATUS_FILE), AFTER_TURN, CAPTURED);
    const h = harness(s);
    await answerContext(h.deps);
    expect(h.sent).toEqual([refusedText("/x/settings.json tidak bisa dibaca")]);
    expect(h.sent[0]).toContain("TIDAK dipasang");
  });

  test("rollback juga dilaporkan apa adanya", async () => {
    const s = stateDir();
    writeFileSync(join(s, INSTALL_FILE), JSON.stringify({ kind: "rolled-back", reason: "gagal menyimpan rantai", at_ms: 1 }));
    const h = harness(s);
    await answerContext(h.deps);
    expect(h.sent).toEqual([refusedText("gagal menyimpan rantai")]);
  });

  test("sesi tanpa bridge (dinyalakan sebelum fitur ini): minta nyalakan ulang, tanpa menunggu", async () => {
    const h = harness(stateDir());
    await answerContext(h.deps);
    expect(h.sent).toEqual([NOT_INSTALLED_TEXT]);
    expect(h.sleeps()).toBe(0);
  });

  test("sesi baru, data muncul saat ditunggu: pesan tunggu lalu render", async () => {
    const s = stateDir();
    installed(s);
    const h = harness(s, (i) => {
      if (i === 2) writeCapturedStatus(join(s, STATUS_FILE), FRESH, CAPTURED);
    });
    await answerContext(h.deps);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[0]).toBe(WAITING_TEXT);
    expect(h.sent[1]).toStartWith("Context\n(tidak tersedia)");
    expect(h.sleeps()).toBe(3);
  });

  test("sesi baru, data tak kunjung muncul: dijelaskan, bukan angka", async () => {
    const s = stateDir();
    installed(s);
    const h = harness(s);
    await answerContext({ ...h.deps, attempts: 4 });
    expect(h.sent).toEqual([WAITING_TEXT, STILL_EMPTY_TEXT]);
    expect(h.sleeps()).toBe(3);
  });

  test("status.json rusak: dijelaskan tidak terbaca, tanpa angka", async () => {
    const s = stateDir();
    installed(s);
    writeFileSync(join(s, STATUS_FILE), '{"captured_at_ms": 1, "payload": {"context_window": {"used_percentage": 4');
    const h = harness(s);
    await answerContext(h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toContain("tidak bisa dibaca");
    expect(h.sent[0]).toContain("JSON rusak");
    expect(h.sent[0]).not.toMatch(/\d+%/);
  });

  test("status.json tanpa izin baca: dijelaskan tidak terbaca", async () => {
    if (process.getuid?.() === 0) return; // root bisa membaca apa saja
    const s = stateDir();
    installed(s);
    const path = join(s, STATUS_FILE);
    writeCapturedStatus(path, AFTER_TURN, CAPTURED);
    chmodSync(path, 0o000);
    const h = harness(s);
    await answerContext(h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toContain("EACCES");
    expect(h.sent[0]).not.toMatch(/\d+%/);
  });
});
