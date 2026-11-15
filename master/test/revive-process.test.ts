import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RESUME_THRESHOLD_ENV } from "../src/launch.ts";
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

/** Untuk tiap start claude tiruan bot itu: apakah dipanggil dengan --continue. */
const argvLog = (name: string) =>
  readFileSync(join(home, "bots", name, "state", "argv.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" ")[0] === "--continue");

/** Untuk tiap start claude tiruan bot itu: kedua ambang dialog resume di environment-nya. */
const envLog = (name: string) => readFileSync(join(home, "bots", name, "state", "env.log"), "utf8").split("\n").filter(Boolean);
const THRESHOLDS = `${RESUME_THRESHOLD_ENV.CLAUDE_CODE_RESUME_THRESHOLD_MINUTES} ${RESUME_THRESHOLD_ENV.CLAUDE_CODE_RESUME_TOKEN_THRESHOLD}`;

/** Menulis transkrip percakapan untuk folder kerja bot, di tempat Claude Code menyimpannya. */
function conversation(name: string) {
  const ws = realpathSync(join(home, "bots", name, "workspace"));
  const dir = join(home, ".claude", "projects", ws.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "11111111-2222-4333-8444-555555555555.jsonl"), '{"type":"user"}\n');
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
    [
      // Setiap start mencatat argumennya (tiket 261115100301).
      `echo "$*" >> "$TELEGRAM_STATE_DIR/argv.log"`,
      // ... dan kedua ambang dialog resume yang diterimanya (tiket 261115105101).
      `echo "$CLAUDE_CODE_RESUME_THRESHOLD_MINUTES $CLAUDE_CODE_RESUME_TOKEN_THRESHOLD" >> "$TELEGRAM_STATE_DIR/env.log"`,
      `[ -f "$TELEGRAM_STATE_DIR/rusak" ] && { echo "claude tiruan: rusak"; exit 1; }`,
      // Seperti claude asli: --continue yang tidak bisa dilanjutkan keluar dengan kode 1.
      `[ "$1" = "--continue" ] && [ -f "$TELEGRAM_STATE_DIR/continue-rusak" ] && { echo "No conversation found to continue"; exit 1; }`,
      `echo "bypass permissions on"`,
      `echo $$ > "$TELEGRAM_STATE_DIR/bot.pid"`,
      `while :; do sleep 1; done`,
    ].join("\n"),
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
    expect(t).toContain("Dinyalakan ulang:\n- @a_aktif_bot ('a-aktif'): percakapan baru dimulai: belum ada percakapan sebelumnya di folder kerja bot ini\n- @b_terdaftar_bot ('b-terdaftar'): percakapan baru dimulai: belum ada percakapan sebelumnya di folder kerja bot ini");
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
    writeRegistry(home, {
      bots: {
        ...readRegistry(home).bots,
        "r-03": { telegramId: 3, username: "r03_bot", status: "active", createdAt: "x" },
      },
    });
    botFolder("r-01");
    botFolder("r-02");
    botFolder("r-03");
    await startUntilSummaries(1);
    expect(names()).toEqual(["r-01", "r-02", "r-03"]);
    // Belum ada percakapan: tidak satu pun dinyalakan dengan --continue.
    for (const n of ["r-01", "r-02", "r-03"]) expect(argvLog(n)).toEqual([false]);
    tmux("kill-server"); // "reboot": semua sesi bot mati
    expect(names()).toEqual([]);
    // r-01 dan r-03 pernah diajak bicara; percakapan r-03 tidak bisa dilanjutkan claude.
    conversation("r-01");
    conversation("r-03");
    writeFileSync(join(home, "bots", "r-03", "state", "continue-rusak"), "");
    await startUntilSummaries(2);
    expect(summaries()[1]).toContain(
      [
        "Dinyalakan ulang:",
        "- @r01_bot ('r-01'): percakapan terakhir dilanjutkan",
        "- @r02_bot ('r-02'): percakapan baru dimulai: belum ada percakapan sebelumnya di folder kerja bot ini",
        "- @r03_bot ('r-03'): percakapan baru dimulai: percakapan terakhir tidak bisa dilanjutkan (sesi berhenti saat start)",
      ].join("\n"),
    );
    expect(summaries()[1]).not.toContain("Gagal dinyalakan ulang");
    expect(names()).toEqual(["r-01", "r-02", "r-03"]);
    expect(argvLog("r-01")).toEqual([false, true]);
    expect(argvLog("r-02")).toEqual([false, false]);
    expect(argvLog("r-03")).toEqual([false, true, false]); // --continue gagal, lalu percakapan kosong
    // Tiket 261115105101: setiap start (kosong, --continue, dan ulang setelah gagal) membawa kedua ambang.
    expect(envLog("r-01")).toEqual([THRESHOLDS, THRESHOLDS]);
    expect(envLog("r-02")).toEqual([THRESHOLDS, THRESHOLDS]);
    expect(envLog("r-03")).toEqual([THRESHOLDS, THRESHOLDS, THRESHOLDS]);
    // Tidak ada konfigurasi Claude yang ditulis selain trust folder bots (tanpa resumeReturnDismissed).
    expect(readdirSync(join(home, ".claude")).sort()).toEqual(["projects"]);
    expect(Object.keys(JSON.parse(readFileSync(join(home, ".claude.json"), "utf8")))).toEqual(["projects"]);
    for (const n of ["r-01", "r-02", "r-03"]) expect(readRegistry(home).bots[n]!.status).toBe("active");
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
