import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, lstatSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readRegistry } from "../src/registry.ts";
import { ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261112223102: proses master-bot sungguhan dihentikan dengan sinyal
 * saat sebuah bot masih dinyalakan. Semua di folder sementara baru: HOME dan
 * BOT_SQUAD_HOME, server tmux terpisah (TMUX_TMPDIR), claude dan bun tiruan di
 * depan PATH, Telegram tiruan di 127.0.0.1. Token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForShutdownTests_ab";
const BOT = "5001:AAFakeBotTokenForShutdownTests_aaaaaaaa";
const NAME = "henti-01";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");

let home: string;
let bin: string;
let tmuxDir: string;
let tg: ReturnType<typeof startFakeTelegram>;

/** Soket server tmux uji; -S memastikan server pemilik tidak pernah tersentuh. */
const socket = () => join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const tmux = (...args: string[]) =>
  Bun.spawnSync([TMUX!, "-S", socket(), ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } });
const hasSession = () => tmux("has-session", "-t", `=${NAME}`).exitCode === 0;

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
  home = mkdtempSync(join(tmpdir(), "bsq-stop-"));
  bin = join(home, "bin");
  tmuxDir = join(home, "tmux");
  mkdirSync(bin);
  mkdirSync(tmuxDir, { mode: 0o700 });
  mkdirSync(join(home, "master"));
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
  // bun install plugin tidak perlu dijalankan sungguhan.
  script("bun", "exit 0");
  tg = startFakeTelegram(MASTER, {}, { [BOT]: () => ok({ id: 5001, is_bot: true, first_name: "u", username: "uji_henti_bot" }) });
});

afterEach(() => {
  tg.stop();
  if (TMUX) tmux("kill-server");
  rmSync(home, { recursive: true, force: true });
});

/** Menjalankan main.ts, mendaftarkan bot, menunggu sesi tmux-nya ada. */
async function startAndRegister() {
  expect(symlinks(home)).toEqual([]);
  const proc = Bun.spawn([process.execPath, MAIN], {
    env: {
      PATH: [bin, dirname(TMUX!), "/usr/bin", "/bin"].join(":"),
      HOME: home,
      BOT_SQUAD_HOME: home,
      TMUX_TMPDIR: tmuxDir,
      MASTER_BOT_API_ROOT: tg.apiRoot,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let log = "";
  const reading = (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) log += dec.decode(chunk);
  })();
  const until = async (cond: () => boolean, what: string, ms = 10_000) => {
    for (const end = Date.now() + ms; !cond(); await Bun.sleep(50)) {
      if (Date.now() > end) throw new Error(`tidak terjadi: ${what}\n${log}`);
    }
  };
  await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
  tg.push(ownerDm(`/register ${NAME} ${BOT}`));
  await until(hasSession, `sesi tmux ${NAME}`);
  return {
    proc,
    until,
    /** Mengirim sinyal dan mengembalikan lama keluar (ms) dan seluruh log. */
    async stop(sig: "SIGINT" | "SIGTERM") {
      const t0 = Date.now();
      proc.kill(sig);
      const code = await proc.exited;
      const ms = Date.now() - t0;
      await reading;
      return { code, ms, log };
    },
  };
}

const reports = () => tg.calls.filter((c) => c.method === "sendMessage" && !String(c.params.text).includes("Menyalakan"));

describe.skipIf(!TMUX)("master-bot dihentikan saat bot sedang dinyalakan (proses sungguhan)", () => {
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    test(`${sig}: belum siap -> failed, sesi dimatikan, log lengkap, keluar < 5 detik`, async () => {
      // claude tiruan yang tidak pernah siap.
      script("claude", 'echo "claude tiruan: memuat..."\nwhile :; do sleep 1; done');
      const m = await startAndRegister();
      await Bun.sleep(1_500); // penyalaan sedang menunggu tanda siap
      const { code, ms, log } = await m.stop(sig);

      expect(ms).toBeLessThan(5_000);
      expect(code).toBe(0);
      expect(readRegistry(home).bots[NAME]!.status).toBe("failed");
      expect(hasSession()).toBe(false);
      expect(log).toContain(`sesi tmux '${NAME}' dimatikan karena penyalaannya terputus`);
      expect(log).toContain(`penyalaan '${NAME}' terputus: master-bot berhenti; status ditulis 'failed'`);
      expect(log).toContain(`laporan penyalaan '${NAME}' tidak terkirim: master-bot berhenti sebelum laporan terkirim`);
      expect(log).toContain("berhenti");
      expect(reports()).toHaveLength(0);
      expect(log).not.toContain(MASTER);
      expect(log).not.toContain(BOT);
    }, 30_000);
  }

  test("sudah siap saat berhenti: active, sesi tidak disentuh", async () => {
    // claude tiruan: tanda siap di layar, server plugin "hidup" (bot.pid)
    // begitu file pemicu ada.
    const trigger = join(home, "siap");
    script(
      "claude",
      `echo "bypass permissions on"\nwhile [ ! -f "${trigger}" ]; do sleep 0.05; done\necho $$ > "$TELEGRAM_STATE_DIR/bot.pid"\nwhile :; do sleep 1; done`,
    );
    const m = await startAndRegister();
    await Bun.sleep(1_200);
    writeFileSync(trigger, "");
    await Bun.sleep(250);
    const { code, ms, log } = await m.stop("SIGINT");

    expect(ms).toBeLessThan(5_000);
    expect(code).toBe(0);
    expect(readRegistry(home).bots[NAME]!.status).toBe("active");
    expect(hasSession()).toBe(true);
    expect(log).not.toContain("terputus");
    expect(log).not.toContain("dimatikan");
  }, 30_000);
});
