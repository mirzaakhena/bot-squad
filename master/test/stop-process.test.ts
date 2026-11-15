import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { botPaths, PLUGIN_DIR, RESUME_THRESHOLD_ENV } from "../src/launch.ts";
import { readRegistry } from "../src/registry.ts";
import { findStrayServers, listServerProcesses } from "../src/strays.ts";
import { ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261112225302: /stop dan /restart lewat proses master-bot sungguhan.
 * Semua di folder sementara baru (HOME dan BOT_SQUAD_HOME), server tmux
 * terpisah (TMUX_TMPDIR, dan -S di setiap perintah tmux tes), claude tiruan
 * yang menjalankan "server plugin" tiruan (`bun .../server.ts` dengan
 * CLAUDE_PLUGIN_ROOT folder plugin repo ini), Telegram tiruan di 127.0.0.1.
 * Token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForStopProcTests_ab";
const BOT = "5001:AAFakeBotTokenForStopProcessTests_aaaaa";
const NAME = "srp-01";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");
const BUN = process.execPath;

let home: string;
let bin: string;
let tmuxDir: string;
let tg: ReturnType<typeof startFakeTelegram>;
let master: Bun.Subprocess | undefined;
let bystanders: Bun.Subprocess[] = [];

const socket = () => join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const tmux = (...args: string[]) =>
  Bun.spawnSync([TMUX!, "-S", socket(), ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } });
const hasSession = (name: string) => tmux("has-session", "-t", `=${name}`).exitCode === 0;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const state = (name: string) => botPaths(home, name).state;
/** Server plugin (tiruan) yang dikenali untuk folder state bot ini, menurut ps. */
const servers = (name: string) => findStrayServers(listServerProcesses(), { stateDir: state(name), pluginDir: PLUGIN_DIR });

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

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsq-stopproc-"));
  bin = join(home, "bin");
  tmuxDir = join(home, "tmux");
  mkdirSync(bin);
  mkdirSync(tmuxDir, { mode: 0o700 });
  mkdirSync(join(home, "master"));
  mkdirSync(join(home, "srv"));
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
  // bun install plugin tidak perlu dijalankan sungguhan.
  script("bun", "exit 0");
  // Server plugin tiruan. "sopan": keluar sendiri begitu Claude-nya mati
  // (seperti server.ts asli). "bandel": mengabaikan SIGHUP dan SIGTERM.
  writeFileSync(
    join(home, "srv", "server.ts"),
    `import { writeFileSync } from "node:fs";
const mode = process.argv[2];
writeFileSync(process.env.TELEGRAM_STATE_DIR + "/bot.pid", String(process.pid));
process.on("SIGHUP", () => {});
if (mode === "bandel") process.on("SIGTERM", () => {});
const parent = process.ppid;
setInterval(() => {
  if (mode !== "sopan") return;
  try { process.kill(parent, 0); } catch { process.exit(0); }
}, 200);
`,
  );
  // claude tiruan: langsung siap, menjalankan server plugin tiruan.
  script(
    "claude",
    `echo "$*" >> "$TELEGRAM_STATE_DIR/argv.log"\necho "$CLAUDE_CODE_RESUME_THRESHOLD_MINUTES $CLAUDE_CODE_RESUME_TOKEN_THRESHOLD" >> "$TELEGRAM_STATE_DIR/env.log"\necho "bypass permissions on"\nCLAUDE_PLUGIN_ROOT='${PLUGIN_DIR}' '${BUN}' '${join(home, "srv", "server.ts")}' "$(cat '${join(home, "mode")}')" &\nwhile :; do sleep 1; done`,
  );
  tg = startFakeTelegram(MASTER, {}, { [BOT]: () => ok({ id: 5001, is_bot: true, first_name: "u", username: "uji_srp_bot" }) });
});

afterEach(async () => {
  master?.kill("SIGTERM");
  await master?.exited;
  master = undefined;
  for (const b of bystanders) b.kill("SIGKILL");
  bystanders = [];
  if (TMUX) tmux("kill-server");
  // Hanya server tiruan milik folder sementara ini yang boleh dibersihkan.
  // Server sopan bisa keluar sendiri di antara ps dan kill (ESRCH).
  if (home) {
    for (const pid of servers(NAME)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

const reports = () => tg.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));

async function startMaster() {
  expect(symlinks(home)).toEqual([]);
  master = Bun.spawn([BUN, MAIN], {
    env: {
      PATH: [bin, dirname(TMUX!), "/usr/bin", "/bin"].join(":"),
      HOME: home,
      BOT_SQUAD_HOME: home,
      TMUX_TMPDIR: tmuxDir,
      MASTER_BOT_API_ROOT: tg.apiRoot,
      HTTPS_PROXY: "http://127.0.0.1:9",
      NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
    },
    stdout: "ignore",
    stderr: "pipe",
  });
  let log = "";
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of master!.stderr as ReadableStream<Uint8Array>) log += dec.decode(chunk);
  })();
  const until = async (cond: () => boolean, what: string, ms = 20_000) => {
    for (const end = Date.now() + ms; !cond(); await Bun.sleep(50)) {
      if (Date.now() > end) throw new Error(`tidak terjadi: ${what}\n${log}\n${reports().join("\n---\n")}`);
    }
  };
  await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
  return { until, log: () => log };
}

/** Mengirim perintah dan menunggu sampai jumlah balasan bertambah `n`. */
async function command(m: Awaited<ReturnType<typeof startMaster>>, text: string, n: number, ms?: number) {
  const before = reports().length;
  tg.push(ownerDm(text));
  await m.until(() => reports().length >= before + n, `${n} balasan untuk ${text}`, ms);
  return reports().slice(before);
}

/** Proses lain yang tidak boleh tersentuh. */
function startBystanders() {
  const sleeper = join(home, "srv", "diam");
  mkdirSync(sleeper);
  const srv = join(sleeper, "server.ts");
  writeFileSync(srv, "setInterval(() => {}, 1000);\n");
  const spawn = (env: Record<string, string>) => {
    const p = Bun.spawn([BUN, srv], { env: { PATH: process.env.PATH ?? "", ...env }, stdout: "ignore", stderr: "ignore" });
    bystanders.push(p);
    return p.pid;
  };
  // Plugin WhatsApp pemilik: baris perintah identik, CLAUDE_PLUGIN_ROOT lain
  // (di sini bahkan dengan TELEGRAM_STATE_DIR bot yang dihentikan).
  const wa = spawn({ CLAUDE_PLUGIN_ROOT: join(home, "claude-whatsapp-channel", "whatsapp"), TELEGRAM_STATE_DIR: state(NAME) });
  // Server plugin bot lain: folder plugin sama, folder state lain.
  const other = spawn({ CLAUDE_PLUGIN_ROOT: PLUGIN_DIR, TELEGRAM_STATE_DIR: state("srp-01-lain") });
  // Sesi tmux bot lain yang namanya berawalan sama.
  expect(tmux("new-session", "-d", "-s", "srp-01-lain", "sleep 600").exitCode).toBe(0);
  return [wa, other];
}

describe.skipIf(!TMUX)("/stop dan /restart (proses sungguhan)", () => {
  test("stop bersih, bot lain dan plugin WhatsApp tidak tersentuh, lalu restart menyala lagi", async () => {
    writeFileSync(join(home, "mode"), "sopan");
    const m = await startMaster();
    const reg = await command(m, `/register ${NAME} ${BOT}`, 2, 30_000);
    expect(reg[1]).toContain("aktif");
    const pid1 = Number(readFileSync(botPaths(home, NAME).pidFile, "utf8"));
    expect(servers(NAME)).toEqual([pid1]);
    const others = startBystanders();
    // Kedua pengamat memang ada di daftar proses (pembacaan env berhasil).
    await Bun.sleep(300);
    expect(listServerProcesses().map((p) => p.pid)).toEqual(expect.arrayContaining(others));

    const stop = await command(m, `/stop ${NAME}`, 2, 20_000);
    expect(stop[0]).toBe(`Menghentikan '${NAME}'...`);
    expect(stop[1]).toContain(`('${NAME}') dihentikan.`);
    expect(stop[1]).not.toContain("Peringatan");
    expect(stop[1]).not.toContain("dimatikan paksa");
    expect(readRegistry(home).bots[NAME]!.status).toBe("stopped");
    expect(hasSession(NAME)).toBe(false);
    // Bukti mati dari daftar proses, beberapa saat kemudian.
    await Bun.sleep(1_000);
    expect(alive(pid1)).toBe(false);
    expect(servers(NAME)).toEqual([]);
    for (const pid of others) expect(alive(pid)).toBe(true);
    expect(hasSession("srp-01-lain")).toBe(true);

    // Tiket 261115100301. Belum ada percakapan di folder kerja: /restart tetap
    // menyala, dengan percakapan kosong (tanpa --continue).
    const continued = () =>
      readFileSync(join(state(NAME), "argv.log"), "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0] === "--continue");
    expect(continued()).toEqual([false]); // /register
    const rs = await command(m, `/restart ${NAME}`, 2, 30_000);
    expect(rs[0]).toBe(`Menyalakan ulang '${NAME}', melanjutkan percakapan terakhir...\nUntuk percakapan baru: /restart ${NAME} new`);
    expect(rs[1]).toContain(`('${NAME}') aktif.`);
    expect(rs[1]).toContain("Percakapan baru dimulai: belum ada percakapan sebelumnya di folder kerja bot ini.");
    expect(continued()).toEqual([false, false]);
    expect(readRegistry(home).bots[NAME]!.status).toBe("active");
    expect(hasSession(NAME)).toBe(true);
    const pid2 = Number(readFileSync(botPaths(home, NAME).pidFile, "utf8"));
    expect(pid2).not.toBe(pid1);
    expect(servers(NAME)).toEqual([pid2]);

    // /restart bot yang hidup: yang lama dimatikan dulu, hanya satu server.
    // Sekarang bot punya percakapan: /restart melanjutkannya (claude --continue).
    const ws = realpathSync(botPaths(home, NAME).workspace);
    const project = join(home, ".claude", "projects", ws.replace(/[^a-zA-Z0-9]/g, "-"));
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "11111111-2222-4333-8444-555555555555.jsonl"), '{"type":"user"}\n');
    const rs2 = await command(m, `/restart ${NAME}`, 2, 30_000);
    expect(rs2[1]).toContain("aktif.");
    expect(rs2[1]).toContain("Percakapan terakhir dilanjutkan.");
    expect(continued()).toEqual([false, false, true]);
    const pid3 = Number(readFileSync(botPaths(home, NAME).pidFile, "utf8"));
    expect(pid3).not.toBe(pid2);
    await Bun.sleep(500);
    expect(alive(pid2)).toBe(false);
    expect(servers(NAME)).toEqual([pid3]);
    for (const pid of others) expect(alive(pid)).toBe(true);
    expect(hasSession("srp-01-lain")).toBe(true);

    // /restart <nama> new: percakapan kosong walau ada percakapan lama; transkrip lama tidak dihapus.
    const rs3 = await command(m, `/restart ${NAME} new`, 2, 30_000);
    expect(rs3[0]).toBe(`Menyalakan ulang '${NAME}' dengan percakapan baru...`);
    expect(rs3[1]).toContain("aktif.");
    expect(rs3[1]).toContain("Percakapan baru dimulai.");
    expect(rs3[1]).not.toContain("dilanjutkan");
    expect(continued()).toEqual([false, false, true, false]);
    // Tiket 261115105101: /register dan setiap /restart membawa kedua ambang dialog resume.
    const thresholds = `${RESUME_THRESHOLD_ENV.CLAUDE_CODE_RESUME_THRESHOLD_MINUTES} ${RESUME_THRESHOLD_ENV.CLAUDE_CODE_RESUME_TOKEN_THRESHOLD}`;
    expect(readFileSync(join(state(NAME), "env.log"), "utf8").split("\n").filter(Boolean)).toEqual([thresholds, thresholds, thresholds, thresholds]);
    expect(readdirSync(project)).toHaveLength(1);
    await Bun.sleep(500);
    const pid4 = Number(readFileSync(botPaths(home, NAME).pidFile, "utf8"));
    expect(servers(NAME)).toEqual([pid4]);

    // Argumen kedua selain 'new': cara pakai, bot tidak disentuh.
    const bad = await command(m, `/restart ${NAME} baru`, 1, 10_000);
    expect(bad[0]).toStartWith("Cara pakai: /restart <nama> [new]");
    await Bun.sleep(500);
    expect(servers(NAME)).toEqual([pid4]);
    expect(continued()).toHaveLength(4);
    expect(m.log()).not.toContain(BOT);
    expect(m.log()).not.toContain(MASTER);
  }, 90_000);

  test("server plugin bandel: dimatikan paksa (SIGKILL), dilaporkan; plugin WhatsApp tetap hidup", async () => {
    writeFileSync(join(home, "mode"), "bandel");
    const m = await startMaster();
    const reg = await command(m, `/register ${NAME} ${BOT}`, 2, 30_000);
    expect(reg[1]).toContain("aktif");
    const pid1 = Number(readFileSync(botPaths(home, NAME).pidFile, "utf8"));
    const others = startBystanders();

    const stop = await command(m, `/stop ${NAME}`, 2, 30_000);
    expect(stop[1]).toContain(`dimatikan paksa: pid ${pid1} (SIGKILL)`);
    expect(stop[1]).not.toContain("Peringatan");
    expect(readRegistry(home).bots[NAME]!.status).toBe("stopped");
    expect(m.log()).toContain(`server plugin '${NAME}' dimatikan paksa: pid ${pid1} (SIGKILL)`);
    await Bun.sleep(500);
    expect(alive(pid1)).toBe(false);
    for (const pid of others) expect(alive(pid)).toBe(true);
    expect(hasSession("srp-01-lain")).toBe(true);
  }, 90_000);
});
