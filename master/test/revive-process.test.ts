import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readRegistry, writeRegistry } from "../src/registry.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER } from "./updates.ts";

/**
 * Tiket 261112225304: proses main.ts sungguhan menyala dengan registry berisi
 * bot dalam berbagai status. HOME dan BOT_SQUAD_HOME sementara (tanpa
 * symlink), server tmux terpisah (TMUX_TMPDIR, -S), claude dan bun tiruan di
 * depan PATH, Telegram tiruan di 127.0.0.1, token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForReviveProcess_ab";
const BOT_TOKEN = "5001:AAFakeBotTokenForReviveProcess_aaaaaaaa";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");

let home: string;
let bin: string;
let tmuxDir: string;
let tg: ReturnType<typeof startFakeTelegram>;

const socket = () => join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const path = () => [bin, dirname(TMUX!), "/usr/bin", "/bin"].join(":");
const tmux = (...args: string[]) =>
  Bun.spawnSync([TMUX!, "-S", socket(), ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: path() } });
const sessions = () =>
  tmux("list-sessions", "-F", "#{session_name} #{pane_pid}").stdout.toString().split("\n").filter(Boolean).sort();
const names = () => sessions().map((l) => l.split(" ")[0]);

function symlinks(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out.push(p);
    else if (st.isDirectory()) out.push(...symlinks(p));
  }
  return out;
}

function script(name: string, body: string) {
  const p = join(bin, name);
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
}

function botFolder(name: string, opts: { broken?: boolean } = {}) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(join(state, ".env"), `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\n`, { mode: 0o600 });
  if (opts.broken) writeFileSync(join(state, "rusak"), "");
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsq-revive-"));
  bin = join(home, "bin");
  tmuxDir = join(home, "tmux");
  mkdirSync(bin);
  mkdirSync(join(tmuxDir, `tmux-${process.getuid!()}`), { recursive: true, mode: 0o700 });
  mkdirSync(join(home, "master"));
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
  script("bun", "exit 0");
  // claude tiruan: langsung siap (tanda di layar + bot.pid hidup), kecuali
  // folder state-nya ditandai rusak: keluar seketika.
  script(
    "claude",
    `[ -f "$TELEGRAM_STATE_DIR/rusak" ] && { echo "claude tiruan: rusak"; exit 1; }\necho "bypass permissions on"\necho $$ > "$TELEGRAM_STATE_DIR/bot.pid"\nwhile :; do sleep 1; done`,
  );
  tg = startFakeTelegram(MASTER);
});

afterEach(() => {
  tg.stop();
  if (TMUX) tmux("kill-server");
  rmSync(home, { recursive: true, force: true });
});

/** Menjalankan main.ts sampai ringkasan ke-n terkirim, lalu menghentikannya. */
async function startUntilSummaries(n: number) {
  expect(symlinks(home)).toEqual([]);
  const proc = Bun.spawn([process.execPath, MAIN], {
    env: {
      PATH: path(),
      HOME: home,
      BOT_SQUAD_HOME: home,
      TMUX_TMPDIR: tmuxDir,
      MASTER_BOT_API_ROOT: tg.apiRoot,
      HTTPS_PROXY: "http://127.0.0.1:9",
      NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let log = "";
  const reading = (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) log += dec.decode(chunk);
  })();
  try {
    for (const end = Date.now() + 20_000; summaries().length < n; await Bun.sleep(50)) {
      if (Date.now() > end) throw new Error(`ringkasan ke-${n} tidak datang\n${log}`);
    }
    // Sebentar lagi: tidak boleh ada pesan tambahan.
    await Bun.sleep(500);
  } finally {
    proc.kill("SIGTERM");
    await proc.exited;
    await reading;
  }
  return log;
}

const messages = () => tg.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
const summaries = () => messages().filter((t) => t.startsWith("master-bot menyala"));

describe.skipIf(!TMUX)("penyalaan otomatis di proses master-bot sungguhan", () => {
  test("yang mati dinyalakan, failed/stopped/berjalan dibiarkan, satu ringkasan", async () => {
    const reg = { bots: {} as Record<string, any> };
    const add = (name: string, status: string, id: number) =>
      (reg.bots[name] = { telegramId: id, username: `${name.replace(/-/g, "_")}_bot`, status, createdAt: "x" });
    add("a-aktif", "active", 1);
    add("b-terdaftar", "registered", 2);
    add("c-rusak", "active", 3);
    add("d-gagal", "failed", 4);
    add("e-stop", "stopped", 5);
    add("f-hidup", "active", 6);
    add("g-stop-hidup", "stopped", 7);
    writeRegistry(home, reg);
    for (const n of Object.keys(reg.bots)) botFolder(n, { broken: n === "c-rusak" });
    botFolder("x-liar"); // folder tidak terdaftar: tidak pernah disentuh
    // Bot yang sudah berjalan sebelum master-bot menyala.
    for (const s of ["f-hidup", "g-stop-hidup", "sesi-pribadi"]) {
      expect(tmux("new-session", "-d", "-s", s, "sleep 300").exitCode).toBe(0);
    }
    const before = sessions().filter((l) => /^(f-hidup|g-stop-hidup|sesi-pribadi) /.test(l));

    const log = await startUntilSummaries(1);

    expect(messages()).toHaveLength(1);
    const t = summaries()[0]!;
    expect(t).toContain("master-bot menyala. Keadaan 7 bot terdaftar:");
    expect(t).toContain("Dinyalakan ulang:\n- @a_aktif_bot ('a-aktif')\n- @b_terdaftar_bot ('b-terdaftar')");
    expect(t).toContain("Gagal dinyalakan ulang:\n- @c_rusak_bot ('c-rusak'): sesi berhenti saat start.");
    expect(t).toContain("Coba lagi dengan /restart c-rusak");
    expect(t).toContain("- @d_gagal_bot ('d-gagal'): gagal dinyalakan sebelumnya (status failed). Coba lagi dengan /restart d-gagal");
    expect(t).toContain("- @e_stop_bot ('e-stop'): dihentikan pemilik. Nyalakan dengan /restart e-stop");
    expect(t).toContain("- @f_hidup_bot ('f-hidup'): sudah berjalan (sesi tmux 'f-hidup' sudah hidup)");
    expect(t).toContain("- @g_stop_hidup_bot ('g-stop-hidup'): sudah berjalan (sesi tmux 'g-stop-hidup' sudah hidup); status 'stopped' tidak diubah");
    expect(t).not.toContain("x-liar");
    expect(t).not.toContain("sesi-pribadi");

    const st = Object.fromEntries(Object.entries(readRegistry(home).bots).map(([k, v]) => [k, v.status]));
    expect(st).toEqual({
      "a-aktif": "active",
      "b-terdaftar": "active",
      "c-rusak": "failed",
      "d-gagal": "failed",
      "e-stop": "stopped",
      "f-hidup": "active",
      "g-stop-hidup": "stopped",
    });
    // Sesi yang sudah ada tidak disentuh (pid pane sama); yang baru hanya a dan b.
    expect(names()).toEqual(["a-aktif", "b-terdaftar", "f-hidup", "g-stop-hidup", "sesi-pribadi"]);
    expect(sessions().filter((l) => /^(f-hidup|g-stop-hidup|sesi-pribadi) /.test(l))).toEqual(before);
    expect(log).not.toContain(MASTER);
    expect(log).not.toContain(BOT_TOKEN);
    expect(t).not.toContain(BOT_TOKEN);

    // Menyala lagi: semua yang hidup dibiarkan, tetap satu ringkasan.
    const sessionsAfterFirst = sessions();
    await startUntilSummaries(2);
    const t2 = summaries()[1]!;
    expect(messages()).toHaveLength(2);
    expect(t2).not.toContain("Dinyalakan ulang");
    expect(t2).toContain("- @a_aktif_bot ('a-aktif'): sudah berjalan");
    expect(t2).not.toContain("Gagal dinyalakan ulang");
    expect(t2).toContain("- @c_rusak_bot ('c-rusak'): gagal dinyalakan sebelumnya (status failed). Coba lagi dengan /restart c-rusak");
    expect(sessions()).toEqual(sessionsAfterFirst);
  }, 60_000);

  test("sesi bot mati semua (seperti setelah reboot): semuanya hidup kembali", async () => {
    writeRegistry(home, {
      bots: {
        "r-01": { telegramId: 1, username: "r01_bot", status: "active", createdAt: "x" },
        "r-02": { telegramId: 2, username: "r02_bot", status: "active", createdAt: "x" },
      },
    });
    botFolder("r-01");
    botFolder("r-02");
    await startUntilSummaries(1);
    expect(names()).toEqual(["r-01", "r-02"]);
    tmux("kill-server"); // "reboot": semua sesi bot mati
    expect(names()).toEqual([]);
    await startUntilSummaries(2);
    expect(summaries()[1]).toContain("Dinyalakan ulang:\n- @r01_bot ('r-01')\n- @r02_bot ('r-02')");
    expect(names()).toEqual(["r-01", "r-02"]);
  }, 60_000);

  test("registry kosong: tidak ada pesan", async () => {
    writeRegistry(home, { bots: {} });
    const proc = Bun.spawn([process.execPath, MAIN], {
      env: { PATH: path(), HOME: home, BOT_SQUAD_HOME: home, TMUX_TMPDIR: tmuxDir, MASTER_BOT_API_ROOT: tg.apiRoot },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      for (const end = Date.now() + 10_000; !tg.calls.some((c) => c.method === "getUpdates"); await Bun.sleep(50)) {
        if (Date.now() > end) throw new Error("master-bot tidak polling");
      }
      await Bun.sleep(1_000);
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }
    expect(messages()).toEqual([]);
  }, 30_000);
});
