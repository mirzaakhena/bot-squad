import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GrammyError } from "grammy";
import { createBotLocks, type BotLocks } from "../src/busy.ts";
import type { ConversationMode, LaunchResult } from "../src/launch.ts";
import { readRegistry, registryPath, writeRegistry, type BotStatus } from "../src/registry.ts";
import { reviveAndReport, reviveBots, reviveReport, type ReviveDeps } from "../src/revive.ts";
import { STATUS_NOT_RECORDED } from "../src/bot.ts";

/**
 * Tiket 261112225304: penyalaan otomatis saat master-bot menyala, dengan
 * launch dan tmux tiruan. Proses sungguhan ada di revive-process.test.ts.
 */

let home: string;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-revive-"));
  logs = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function seed(bots: Record<string, BotStatus | string>) {
  const reg = { bots: {} as Record<string, any> };
  let id = 8000;
  for (const [name, status] of Object.entries(bots)) {
    reg.bots[name] = { telegramId: id++, username: `${name.replace(/-/g, "_")}_bot`, status, createdAt: "2026-11-13T00:00:00.000Z" };
  }
  writeRegistry(home, reg);
}

const status = (name: string) => readRegistry(home).bots[name]?.status;

/**
 * Tiruan: `running` = nama dengan sesi tmux hidup. launch meniru launchBot:
 * bot yang sudah berjalan menjadi already-running.
 */
function deps(o: {
  running?: string[];
  launch?: (name: string) => Promise<LaunchResult>;
  locks?: BotLocks;
  failStatusWrite?: boolean;
  tmuxThrows?: boolean;
}) {
  const launched: string[] = [];
  const modes: ConversationMode[] = [];
  const running = new Set(o.running ?? []);
  const d: ReviveDeps = {
    dataDir: home,
    locks: o.locks ?? createBotLocks(),
    log: (m) => logs.push(m),
    probe: {
      tmux: {
        hasSession: async (n) => {
          if (o.tmuxThrows) throw new Error("tmux rusak");
          return running.has(n);
        },
      } as any,
      isAlive: () => false,
    },
    launch: async (name, mode) => {
      launched.push(name);
      modes.push(mode);
      if (running.has(name)) return { kind: "already-running", reason: `sesi tmux '${name}' sudah hidup` };
      return o.launch ? o.launch(name) : { kind: "active", pid: 4242 };
    },
    registryHooks: o.failStatusWrite
      ? {
          beforeRename: () => {
            throw new Error("disk penuh");
          },
        }
      : undefined,
  };
  return { d, launched, modes };
}

/** Menjalankan reviveAndReport dan mengembalikan pesan yang dikirim. */
async function runReport(d: ReviveDeps, extra: { signal?: AbortSignal; send?: (t: string) => Promise<unknown> } = {}) {
  const sent: string[] = [];
  await reviveAndReport({
    ...d,
    signal: extra.signal,
    retry: { sleep: async () => {} },
    send: async (text) => {
      sent.push(text);
      if (extra.send) return extra.send(text);
    },
  });
  return sent;
}

describe("aturan pilih per status", () => {
  test("active yang tidak berjalan dinyalakan dan tercatat active", async () => {
    seed({ "rv-a": "active" });
    const { d, launched } = deps({});
    const sent = await runReport(d);
    expect(launched).toEqual(["rv-a"]);
    expect(status("rv-a")).toBe("active");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Dinyalakan ulang:\n- @rv_a_bot ('rv-a')");
  });

  test("registered yang tidak berjalan dinyalakan dan tercatat active", async () => {
    seed({ "rv-r": "registered" });
    const { d, launched } = deps({});
    const sent = await runReport(d);
    expect(launched).toEqual(["rv-r"]);
    expect(status("rv-r")).toBe("active");
    expect(sent[0]).toContain("Dinyalakan ulang:\n- @rv_r_bot ('rv-r')");
  });

  test("failed tidak dinyalakan; ringkasan menyebutnya dengan /restart <nama>", async () => {
    seed({ "rv-f": "failed" });
    const { d, launched } = deps({});
    const sent = await runReport(d);
    expect(launched).toEqual([]);
    expect(status("rv-f")).toBe("failed");
    expect(sent[0]).toContain("Dibiarkan:\n- @rv_f_bot ('rv-f'): gagal dinyalakan sebelumnya (status failed). Coba lagi dengan /restart rv-f");
  });

  test("stopped tidak dinyalakan dan statusnya tetap", async () => {
    seed({ "rv-s": "stopped" });
    const { d, launched } = deps({});
    const sent = await runReport(d);
    expect(launched).toEqual([]);
    expect(status("rv-s")).toBe("stopped");
    expect(sent[0]).toContain("- @rv_s_bot ('rv-s'): dihentikan pemilik. Nyalakan dengan /restart rv-s");
  });

  for (const st of ["active", "registered", "failed", "stopped"] as const) {
    test(`${st} yang sudah berjalan tidak disentuh dan statusnya tidak diubah`, async () => {
      seed({ "rv-x": st });
      const { d } = deps({ running: ["rv-x"] });
      const sent = await runReport(d);
      expect(status("rv-x")).toBe(st);
      expect(sent[0]).toContain("Dibiarkan:\n- @rv_x_bot ('rv-x'): sudah berjalan (sesi tmux 'rv-x' sudah hidup)");
      expect(sent[0]).not.toContain("Dinyalakan ulang");
    });
  }

  test("status tak dikenal dibiarkan", async () => {
    seed({ "rv-u": "aneh" });
    const { d, launched } = deps({});
    const sent = await runReport(d);
    expect(launched).toEqual([]);
    expect(sent[0]).toContain("- @rv_u_bot ('rv-u'): status 'aneh' tidak dikenal. Nyalakan dengan /restart rv-u");
  });

  test("tmux error saat memeriksa bot stopped: tetap dibiarkan", async () => {
    seed({ "rv-s": "stopped" });
    const { d, launched } = deps({ tmuxThrows: true });
    const sent = await runReport(d);
    expect(launched).toEqual([]);
    expect(sent[0]).toContain("dihentikan pemilik");
    expect(logs.join("\n")).toContain("tmux tidak bisa diperiksa");
  });
});

describe("gagal dan bot lain", () => {
  test("satu bot gagal (failed dan error dilempar) tidak menghalangi bot lain", async () => {
    seed({ "rv-1": "active", "rv-2": "active", "rv-3": "registered" });
    const { d, launched } = deps({
      launch: async (name) => {
        if (name === "rv-1") return { kind: "failed", reason: "sesi berhenti saat start", sessionAlive: false };
        if (name === "rv-2") throw new Error("meledak");
        return { kind: "active", pid: 1 };
      },
    });
    const sent = await runReport(d);
    expect(launched.sort()).toEqual(["rv-1", "rv-2", "rv-3"]);
    expect(status("rv-1")).toBe("failed");
    expect(status("rv-2")).toBe("failed");
    expect(status("rv-3")).toBe("active");
    expect(sent).toHaveLength(1);
    const t = sent[0]!;
    expect(t).toContain("Dinyalakan ulang:\n- @rv_3_bot ('rv-3')");
    expect(t).toContain(
      "- @rv_1_bot ('rv-1'): sesi berhenti saat start. Status tercatat 'failed'. Coba lagi dengan /restart rv-1",
    );
    expect(t).toContain("- @rv_2_bot ('rv-2'): error di master-bot saat menyalakan. Status tercatat 'failed'. Coba lagi dengan /restart rv-2");
    expect(logs.join("\n")).toContain("penyalaan otomatis 'rv-2' error: meledak");
  });

  test("gagal dengan sesi masih hidup menyebut tmux attach; isi layar tidak ikut", async () => {
    seed({ "rv-1": "active" });
    const { d } = deps({
      launch: async () => ({ kind: "failed", reason: "dialog tak terduga muncul di layar", sessionAlive: true, screen: "RAHASIA-LAYAR" }),
    });
    const sent = await runReport(d);
    expect(sent[0]).toContain("Gagal dinyalakan ulang:\n- @rv_1_bot ('rv-1'): dialog tak terduga muncul di layar. Lihat di server: <code>tmux attach -t rv-1</code>.");
    expect(sent[0]).not.toContain("RAHASIA-LAYAR");
  });

  test("semua bot dinyalakan bersamaan, bukan satu per satu", async () => {
    seed({ "rv-1": "active", "rv-2": "active" });
    const started: string[] = [];
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const { d } = deps({
      launch: async (name) => {
        started.push(name);
        if (started.length === 2) open();
        await gate;
        return { kind: "active", pid: 1 };
      },
    });
    const timeout = setTimeout(open, 2_000);
    await runReport(d);
    clearTimeout(timeout);
    expect(started.sort()).toEqual(["rv-1", "rv-2"]);
    expect(logs.join("\n")).not.toContain("error");
  });

  test("status gagal ditulis: ringkasan menyebutnya", async () => {
    seed({ "rv-1": "active", "rv-2": "registered" });
    const { d } = deps({
      failStatusWrite: true,
      launch: async (n) => (n === "rv-1" ? { kind: "active", pid: 1 } : { kind: "failed", reason: "x", sessionAlive: false }),
    });
    const sent = await runReport(d);
    expect(sent[0]).toContain(`- @rv_1_bot ('rv-1'). ${STATUS_NOT_RECORDED}`);
    expect(sent[0]).toContain(`- @rv_2_bot ('rv-2'): x. ${STATUS_NOT_RECORDED} Coba lagi dengan /restart rv-2`);
  });
});

describe("kunci per bot", () => {
  test("bot yang sedang diproses /stop atau /restart dilewati", async () => {
    seed({ "rv-1": "active", "rv-2": "active" });
    const locks = createBotLocks();
    const release = locks.claim("rv-1", "dihentikan")!;
    const { d, launched } = deps({ locks });
    const sent = await runReport(d);
    release();
    expect(launched).toEqual(["rv-2"]);
    expect(status("rv-1")).toBe("active");
    expect(sent[0]).toContain("- @rv_1_bot ('rv-1'): sedang diproses perintah lain (dihentikan)");
  });

  test("kunci dipegang selama penyalaan dan dilepas setelahnya, juga saat error", async () => {
    seed({ "rv-1": "active", "rv-2": "active" });
    const locks = createBotLocks();
    const during: Record<string, string | null> = {};
    const { d } = deps({
      locks,
      launch: async (name) => {
        during[name] = locks.busyWith(name);
        if (name === "rv-2") throw new Error("x");
        return { kind: "active", pid: 1 };
      },
    });
    await runReport(d);
    expect(during).toEqual({ "rv-1": "dinyalakan", "rv-2": "dinyalakan" });
    expect(locks.busyWith("rv-1")).toBeNull();
    expect(locks.busyWith("rv-2")).toBeNull();
  });
});

describe("pesan ringkasan", () => {
  test("registry kosong atau belum ada: tidak ada pesan, tidak ada penyalaan", async () => {
    const { d, launched } = deps({});
    expect(await runReport(d)).toEqual([]);
    seed({});
    expect(await runReport(d)).toEqual([]);
    expect(launched).toEqual([]);
  });

  test("semua sudah berjalan atau dihentikan: tetap satu pesan", async () => {
    seed({ "rv-1": "active", "rv-2": "stopped" });
    const { d, launched } = deps({ running: ["rv-1"] });
    const sent = await runReport(d);
    expect(launched).toEqual(["rv-1"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toStartWith("master-bot menyala. Keadaan 2 bot terdaftar:");
    expect(sent[0]).not.toContain("Dinyalakan ulang");
    expect(sent[0]).not.toContain("Gagal");
  });

  test("ringkasan lengkap: tiga bagian, urut nama, satu pesan", async () => {
    seed({ "rv-c": "registered", "rv-a": "active", "rv-b": "failed", "rv-d": "stopped", "rv-e": "active" });
    const { d } = deps({
      running: ["rv-e"],
      launch: async (n) => (n === "rv-c" ? { kind: "failed", reason: "belum siap setelah 90 detik", sessionAlive: false } : { kind: "active", pid: 1 }),
    });
    const sent = await runReport(d);
    expect(sent).toEqual([
      [
        "master-bot menyala. Keadaan 5 bot terdaftar:",
        "",
        "Dinyalakan ulang:\n- @rv_a_bot ('rv-a')",
        "",
        "Gagal dinyalakan ulang:\n- @rv_c_bot ('rv-c'): belum siap setelah 90 detik. Status tercatat 'failed'. Coba lagi dengan /restart rv-c",
        "",
        "Dibiarkan:\n- @rv_b_bot ('rv-b'): gagal dinyalakan sebelumnya (status failed). Coba lagi dengan /restart rv-b\n" +
          "- @rv_d_bot ('rv-d'): dihentikan pemilik. Nyalakan dengan /restart rv-d\n" +
          "- @rv_e_bot ('rv-e'): sudah berjalan (sesi tmux 'rv-e' sudah hidup)",
      ].join("\n"),
    ]);
  });

  test("username dan alasan di-escape untuk HTML", () => {
    const t = reviveReport({
      kind: "done",
      entries: [{ name: "rv-1", username: "a<b>", kind: "failed", reason: "x & <y>", sessionAlive: false, statusRecorded: true }],
    })!;
    expect(t).toContain("@a&lt;b&gt; ('rv-1'): x &amp; &lt;y&gt;.");
  });

  test("registry rusak: tidak ada penyalaan, pesan menyebut sebabnya", async () => {
    mkdirSync(home, { recursive: true });
    writeFileSync(registryPath(home), "{rusak");
    const { d, launched } = deps({});
    const sent = await runReport(d);
    expect(launched).toEqual([]);
    expect(sent).toEqual(["master-bot menyala, tetapi tidak ada bot yang dinyalakan otomatis: registry.json rusak (bukan JSON yang sah). Lihat log master-bot."]);
  });

  test("master-bot berhenti sebelum ringkasan: tidak dikirim, dicatat di log", async () => {
    seed({ "rv-1": "active" });
    const ac = new AbortController();
    const { d } = deps({
      launch: async () => {
        ac.abort();
        return { kind: "failed", reason: "penyalaan terputus karena master-bot berhenti", sessionAlive: false, interrupted: true };
      },
    });
    const sent = await runReport(d, { signal: ac.signal });
    expect(sent).toEqual([]);
    expect(status("rv-1")).toBe("failed");
    expect(logs.join("\n")).toContain("ringkasan penyalaan otomatis tidak terkirim: master-bot berhenti sebelum laporan terkirim");
  });

  test("gangguan sementara Telegram: ringkasan dikirim ulang sampai terkirim", async () => {
    seed({ "rv-1": "active" });
    const { d } = deps({});
    let n = 0;
    const sent = await runReport(d, {
      send: async () => {
        if (++n < 3) throw new GrammyError("x", { ok: false, error_code: 502, description: "Bad Gateway" }, "sendMessage", {});
      },
    });
    expect(sent).toHaveLength(3);
    expect(new Set(sent).size).toBe(1);
    expect(logs.join("\n")).toContain("ringkasan penyalaan otomatis terkirim pada percobaan 3");
  });

  test("reviveBots tidak pernah melempar", async () => {
    seed({ "rv-1": "active" });
    const { d } = deps({});
    d.locks = { busyWith: () => null, claim: () => { throw new Error("kunci rusak"); } };
    const out = await reviveBots(d);
    expect(out.kind).toBe("done");
    expect(reviveReport(out)).toContain("- @rv_1_bot ('rv-1'): error di master-bot saat menyalakan.");
  });
});

describe("percakapan saat penyalaan otomatis (261115100301)", () => {
  test("setiap bot dinyalakan dengan mode continue", async () => {
    seed({ "rv-m1": "active", "rv-m2": "registered", "rv-m3": "stopped", "rv-m4": "failed" });
    const { d, launched, modes } = deps({});
    await runReport(d);
    expect(launched.sort()).toEqual(["rv-m1", "rv-m2"]);
    expect(modes).toEqual(["continue", "continue"]);
  });

  test("ringkasan menyebut percakapan tiap bot: dilanjutkan, belum ada, gagal dilanjutkan", async () => {
    seed({ "rv-n1": "active", "rv-n2": "active", "rv-n3": "active", "rv-n4": "active" });
    const { d } = deps({
      launch: async (n) =>
        n === "rv-n1"
          ? { kind: "active", pid: 1, conversation: { kind: "continued" } }
          : n === "rv-n2"
            ? { kind: "active", pid: 1, conversation: { kind: "new", why: "no-history" } }
            : n === "rv-n3"
              ? { kind: "active", pid: 1, conversation: { kind: "new", why: "continue-failed", reason: "dialog <x>" } }
              : { kind: "active", pid: 1 },
    });
    const sent = await runReport(d);
    expect(sent[0]).toContain(
      [
        "Dinyalakan ulang:",
        "- @rv_n1_bot ('rv-n1'): percakapan terakhir dilanjutkan",
        "- @rv_n2_bot ('rv-n2'): percakapan baru dimulai: belum ada percakapan sebelumnya di folder kerja bot ini",
        "- @rv_n3_bot ('rv-n3'): percakapan baru dimulai: percakapan terakhir tidak bisa dilanjutkan (dialog &lt;x&gt;)",
        "- @rv_n4_bot ('rv-n4')",
      ].join("\n"),
    );
    expect(sent[0]).not.toContain("Gagal dinyalakan ulang");
    for (const n of ["rv-n1", "rv-n2", "rv-n3", "rv-n4"]) expect(status(n)).toBe("active");
  });
});
