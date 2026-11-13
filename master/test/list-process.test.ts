import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { registryPath } from "../src/registry.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261112225301: /list di proses master-bot sungguhan, dengan sesi tmux
 * sungguhan di server tmux terpisah (TMUX_TMPDIR, -S) dan proses hidup/mati
 * sungguhan untuk bot.pid. HOME dan BOT_SQUAD_HOME sementara, token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForListProcess_abcd";
const BOT_TOKEN = "5001:AAFakeBotTokenForListProcess_aaaaaaaaa";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");

let home: string;
let tmuxDir: string;
let tg: ReturnType<typeof startFakeTelegram>;
let sleeper: ReturnType<typeof Bun.spawn> | undefined;

const socket = () => join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const tmux = (...args: string[]) =>
  Bun.spawnSync([TMUX!, "-S", socket(), ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } });
const sessions = () => tmux("list-sessions", "-F", "#{session_name}").stdout.toString().split("\n").filter(Boolean).sort();

function botFolder(name: string, pid?: number) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, ".env"), `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\n`, { mode: 0o600 });
  if (pid !== undefined) writeFileSync(join(state, "bot.pid"), String(pid));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsq-list-"));
  tmuxDir = join(home, "tmux");
  mkdirSync(join(tmuxDir, `tmux-${process.getuid!()}`), { recursive: true, mode: 0o700 });
  mkdirSync(join(home, "master"));
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
  tg = startFakeTelegram(MASTER);
});

afterEach(() => {
  tg.stop();
  sleeper?.kill();
  sleeper = undefined;
  if (TMUX) tmux("kill-server");
  rmSync(home, { recursive: true, force: true });
});

describe.skipIf(!TMUX)("/list di proses master-bot sungguhan", () => {
  test("keadaan nyata dari tmux dan bot.pid; tidak ada yang dimatikan atau dinyalakan", async () => {
    // Proses hidup sungguhan untuk bot.pid, dan pid yang pasti sudah mati.
    sleeper = Bun.spawn(["sleep", "60"], { stdout: "ignore", stderr: "ignore" });
    const dead = Bun.spawn(["true"]);
    await dead.exited;

    botFolder("bot-hidup", sleeper.pid);
    botFolder("bot-mati", dead.pid);
    botFolder("bot-stop");
    botFolder("uji-01");
    botFolder("uji-02");
    for (const s of ["bot-hidup", "bot-stop", "uji-01", "sesi-pribadi"]) {
      expect(tmux("new-session", "-d", "-s", s, "sleep", "300").exitCode).toBe(0);
    }
    const before = sessions();

    let regBefore = "";
    const proc = Bun.spawn([process.execPath, MAIN], {
      env: {
        PATH: [dirname(TMUX!), dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
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
    try {
      const until = async (cond: () => boolean, what: string) => {
        for (const end = Date.now() + 10_000; !cond(); await Bun.sleep(50)) {
          if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
        }
      };
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      // Registry ditulis setelah master-bot menyala: penyalaan otomatis
      // (tiket 261112225304) membaca registry saat start, dan tes ini hanya
      // menguji /list, yang tidak boleh mengubah apa pun.
      writeFileSync(
        registryPath(home),
        JSON.stringify({
          bots: {
            "bot-hidup": { telegramId: 1, username: "hidup_bot", status: "active", createdAt: "x" },
            "bot-mati": { telegramId: 2, username: "mati_bot", status: "active", createdAt: "x" },
            "bot-stop": { telegramId: 3, username: "stop_bot", status: "stopped", createdAt: "x" },
          },
        }),
      );
      regBefore = readFileSync(registryPath(home), "utf8");
      tg.push(ownerDm("/list"));
      await until(() => tg.calls.some((c) => c.method === "sendMessage"), "balasan /list");
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }

    const text = String(tg.calls.find((c) => c.method === "sendMessage")!.params.text);
    expect(text).toContain("<b>bot-hidup</b> @hidup_bot\n   tercatat: aktif · nyata: hidup");
    expect(text).not.toMatch(/bot-hidup[^\n]*\n[^\n]*\n   TIDAK COCOK/);
    expect(text).toContain("<b>bot-mati</b> @mati_bot\n   tercatat: aktif · nyata: mati\n   TIDAK COCOK");
    expect(text).toContain(
      "<b>bot-stop</b> @stop_bot\n   tercatat: dihentikan · nyata: sesi tmux ada, tetapi server plugin mati\n   TIDAK COCOK",
    );
    expect(text).toContain("<b>Tidak terdaftar, tidak dikelola master-bot (2)</b>");
    expect(text).toContain("• uji-01: sesi tmux ada, tetapi server plugin mati");
    expect(text).toContain("• uji-02: mati");
    expect(text).not.toContain("sesi-pribadi");
    expect(text).not.toContain(BOT_TOKEN);
    expect(text).not.toContain(MASTER);

    // Hanya membaca.
    expect(sessions()).toEqual(before);
    expect(readFileSync(registryPath(home), "utf8")).toBe(regBefore);
    expect(sleeper.killed).toBe(false);
    expect(sleeper.exitCode).toBeNull();
  }, 30_000);
});
