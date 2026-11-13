import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { registryPath } from "../src/registry.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261112225303: /logs di proses master-bot sungguhan, dengan layar
 * sesi tmux sungguhan di server tmux terpisah (TMUX_TMPDIR, -S). HOME dan
 * BOT_SQUAD_HOME sementara, token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForLogsProcess_abcd";
const BOT_TOKEN = "5001234:AAFakeBotTokenForLogsProcess_aaaaaaaaaaaa";
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
  home = mkdtempSync(join(tmpdir(), "bsq-logs-"));
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

describe.skipIf(!TMUX)("/logs di proses master-bot sungguhan", () => {
  test("layar sesi tmux sungguhan, tersensor, tanpa mengubah sesi atau registry", async () => {
    sleeper = Bun.spawn(["sleep", "60"], { stdout: "ignore", stderr: "ignore" });
    botFolder("bot-hidup", sleeper.pid);
    botFolder("bot-mati");
    // Layar berisi 30 baris bernomor, isi .env, dan token master.
    const script = join(home, "layar.sh");
    writeFileSync(
      script,
      [
        "for i in $(seq 1 30); do echo \"baris $i\"; echo; done",
        `cat '${join(home, "bots", "bot-hidup", "state", ".env")}'`,
        `echo 'master ${MASTER}'`,
        "echo '<b>&</b>'",
        "sleep 300",
      ].join("\n"),
    );
    expect(tmux("new-session", "-d", "-s", "bot-hidup", "-x", "200", "-y", "80", "sh", script).exitCode).toBe(0);
    // Layar sempit: token terbungkus dan awalnya terdorong keluar dari tepi
    // atas layar, jadi yang terlihat hanya potongan token tanpa '<angka>:'.
    botFolder("bot-sempit", sleeper.pid);
    const narrow = join(home, "sempit.sh");
    writeFileSync(narrow, `printf 'teks panjang dengan token ${BOT_TOKEN} di dalamnya\\na\\nb\\n'\nsleep 300\n`);
    expect(tmux("new-session", "-d", "-s", "bot-sempit", "-x", "40", "-y", "5", "sh", narrow).exitCode).toBe(0);
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
    const texts = () => tg.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
    try {
      const until = async (cond: () => boolean, what: string) => {
        for (const end = Date.now() + 10_000; !cond(); await Bun.sleep(50)) {
          if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
        }
      };
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      await until(() => tmux("capture-pane", "-p", "-t", "=bot-hidup:").stdout.toString().includes("</b>"), "layar siap");
      writeFileSync(
        registryPath(home),
        JSON.stringify({
          bots: {
            "bot-hidup": { telegramId: 1, username: "hidup_bot", status: "active", createdAt: "x" },
            "bot-mati": { telegramId: 2, username: "mati_bot", status: "active", createdAt: "x" },
            "bot-sempit": { telegramId: 3, username: "sempit_bot", status: "active", createdAt: "x" },
          },
        }),
      );
      regBefore = readFileSync(registryPath(home), "utf8");
      tg.push(ownerDm("/logs bot-hidup"));
      await until(() => texts().length >= 1, "balasan /logs pertama");
      tg.push(ownerDm("/logs bot-hidup 4"));
      await until(() => texts().length >= 2, "balasan /logs kedua");
      tg.push(ownerDm("/logs bot-mati"));
      await until(() => texts().length >= 3, "balasan /logs ketiga");
      tg.push(ownerDm("/logs bot-hidup 51"));
      await until(() => texts().length >= 4, "balasan /logs keempat");
      tg.push(ownerDm("/logs bot-sempit"));
      await until(() => texts().length >= 5, "balasan /logs bot-sempit");
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }

    const [def, four, dead, bad, narrowText] = texts();
    // Layar bot-sempit memang hanya memuat potongan token (prasyarat tes).
    const pane = tmux("capture-pane", "-p", "-t", "=bot-sempit:").stdout.toString();
    expect(pane).not.toContain(BOT_TOKEN.split(":")[0]! + ":");
    expect(pane).toContain(BOT_TOKEN.slice(-8));
    expect(narrowText).toContain("&lt;token disembunyikan&gt;");
    for (let i = 0; i + 8 <= BOT_TOKEN.length; i++) expect(narrowText).not.toContain(BOT_TOKEN.slice(i, i + 8));
    expect(def).toStartWith("Layar @hidup_bot ('bot-hidup'), 20 baris terakhir:\n<pre>");
    expect(def).not.toContain("\n\n</pre>");
    expect(def).toContain("<pre>baris 14\nbaris 15");
    expect(def).not.toContain("baris 13\n");
    expect(four).toBe(
      "Layar @hidup_bot ('bot-hidup'), 4 baris terakhir:\n<pre>baris 30\nTELEGRAM_BOT_TOKEN=&lt;token disembunyikan&gt;\n" +
        "master &lt;token disembunyikan&gt;\n&lt;b&gt;&amp;&lt;/b&gt;</pre>",
    );
    expect(dead).toContain("Bot @mati_bot ('bot-mati') tidak hidup (mati)");
    expect(bad).toStartWith("Cara pakai: /logs <nama> [n]");
    for (const c of tg.calls) {
      expect(JSON.stringify(c.params)).not.toContain(BOT_TOKEN);
      expect(JSON.stringify(c.params)).not.toContain(MASTER);
    }
    expect(sessions()).toEqual(before);
    expect(readFileSync(registryPath(home), "utf8")).toBe(regBefore);
    expect(sleeper.exitCode).toBeNull();
  }, 30_000);
});
