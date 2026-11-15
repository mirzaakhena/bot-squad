import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { registryPath } from "../src/registry.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261115195101: /keys di proses master-bot sungguhan. Tombol sampai ke
 * program penerima (mode raw) di sesi tmux sungguhan di server tmux terpisah
 * (TMUX_TMPDIR, -S). HOME dan BOT_SQUAD_HOME sementara, token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForKeysProcess_abcd";
const BOT_TOKEN = "5001234:AAFakeBotTokenForKeysProcess_aaaaaaaaaaaa";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");

/** Byte yang harus diterima program di sesi untuk setiap tombol. */
const BYTES: Record<string, string> = {
  up: "1b5b41",
  down: "1b5b42",
  right: "1b5b43",
  left: "1b5b44",
  enter: "0d",
  esc: "1b",
  tab: "09",
  space: "20",
  backspace: "7f",
  "0": "30", "1": "31", "2": "32", "3": "33", "4": "34", "5": "35", "6": "36", "7": "37", "8": "38", "9": "39",
  y: "79",
  n: "6e",
};

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

/** Sesi tmux berisi penerima: setiap potongan input ditulis sebagai hex ke berkas dan ke layar. */
function receiver(name: string): string {
  const out = join(home, `${name}.keys`);
  const script = join(home, `${name}-recv.ts`);
  writeFileSync(
    script,
    [
      'import { appendFileSync, writeFileSync } from "node:fs";',
      `const out = ${JSON.stringify(out)};`,
      'writeFileSync(out, "");',
      `console.log("TELEGRAM_BOT_TOKEN=${BOT_TOKEN}");`,
      `console.log("master ${MASTER}");`,
      "process.stdin.setRawMode(true);",
      'process.stdin.on("data", (b) => {',
      '  const hex = b.toString("hex");',
      '  appendFileSync(out, hex + "\\n");',
      '  console.log("terima " + hex);',
      "});",
      'console.log("penerima siap");',
    ].join("\n"),
  );
  const r = tmux("new-session", "-d", "-s", name, "-x", "200", "-y", "50", process.execPath, script);
  expect(r.exitCode).toBe(0);
  return out;
}
const received = (file: string) => readFileSync(file, "utf8").replace(/\n/g, "");

beforeEach(() => {
  // Folder pendek di /tmp: path soket tmux terbatas panjangnya.
  home = mkdtempSync(join(tmpdir(), "bsq-keys-"));
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

describe.skipIf(!TMUX)("/keys di proses master-bot sungguhan", () => {
  test("tombol sampai sebagai tombol yang benar, berurutan, hanya ke bot itu; penolakan tidak mengirim apa pun", async () => {
    sleeper = Bun.spawn(["sleep", "120"], { stdout: "ignore", stderr: "ignore" });
    botFolder("bot-a", sleeper.pid);
    botFolder("bot-b", sleeper.pid);
    botFolder("bot-mati");
    const fileA = receiver("bot-a");
    const fileB = receiver("bot-b");
    // Sesi tmux yang bukan bot terdaftar.
    const fileX = receiver("asing");
    const before = sessions();
    expect(before).toEqual(["asing", "bot-a", "bot-b"]);

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
    const until = async (cond: () => boolean, what: string) => {
      for (const end = Date.now() + 20_000; !cond(); await Bun.sleep(50)) {
        if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
      }
    };
    let n = 0;
    const send = async (cmd: string) => {
      tg.push(ownerDm(cmd));
      n++;
      await until(() => texts().length >= n, `balasan untuk ${cmd.slice(0, 40)}`);
      return texts()[n - 1]!;
    };
    const all = Object.keys(BYTES);
    const first = all.slice(0, 20);
    const rest = all.slice(20);
    let replyFirst = "";
    let replyRest = "";
    const rejected: string[] = [];
    try {
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      for (const s of ["bot-a", "bot-b", "asing"]) {
        await until(() => tmux("capture-pane", "-p", "-t", `=${s}:`).stdout.toString().includes("penerima siap"), `penerima ${s} siap`);
      }
      writeFileSync(
        registryPath(home),
        JSON.stringify({
          bots: {
            "bot-a": { telegramId: 1, username: "a_bot", status: "active", createdAt: "x" },
            "bot-b": { telegramId: 2, username: "b_bot", status: "active", createdAt: "x" },
            "bot-mati": { telegramId: 3, username: "mati_bot", status: "active", createdAt: "x" },
          },
        }),
      );
      regBefore = readFileSync(registryPath(home), "utf8");

      // Semua tombol di daftar (20 lalu 1), huruf besar-kecil campur.
      replyFirst = await send(`/keys bot-a ${first.map((k, i) => (i % 2 ? k.toUpperCase() : k)).join(" ")}`);
      replyRest = await send(`/keys bot-a ${rest.join(" ")}`);

      // Penolakan: tidak ada satu byte pun yang boleh sampai ke sesi mana pun.
      const snapshot = () => [received(fileA), received(fileB), received(fileX)];
      const mark = snapshot();
      for (const cmd of [
        "/keys bot-b",
        "/keys bot-b ctrl-c",
        "/keys bot-b C-c",
        "/keys bot-b halo",
        "/keys bot-b down enter hapus",
        `/keys bot-b ${Array(21).fill("down").join(" ")}`,
        "/keys Bot_B enter",
        "/keys asing enter",
        "/keys bot-mati enter",
      ]) {
        rejected.push(await send(cmd));
      }
      await Bun.sleep(500);
      expect(snapshot()).toEqual(mark);
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }

    // Byte yang diterima: persis tombolnya, dalam urutan yang ditulis.
    expect(received(fileA)).toBe(all.map((k) => BYTES[k]).join(""));
    // Setiap tombol tiba sendiri-sendiri (ada jeda di antaranya).
    expect(readFileSync(fileA, "utf8").trim().split("\n")).toEqual(all.map((k) => BYTES[k]!));
    expect(received(fileB)).toBe("");
    expect(received(fileX)).toBe("");

    expect(replyFirst).toStartWith(`Tombol dikirim ke @a_bot ('bot-a'): ${first.join(" ")}\n\nLayar @a_bot ('bot-a'), 20 baris terakhir:\n<pre>`);
    // Layar sesudahnya: baris terakhir adalah tombol terakhir yang diterima.
    expect(replyFirst).toEndWith(`terima ${BYTES[first.at(-1)!]}</pre>`);
    expect(replyRest).toStartWith(`Tombol dikirim ke @a_bot ('bot-a'): ${rest.join(" ")}\n\nLayar`);
    expect(replyRest).toEndWith(`terima ${BYTES[rest.at(-1)!]}</pre>`);

    for (const r of rejected.slice(0, 7)) expect(r).toStartWith("Cara pakai: /keys <nama> <tombol> [<tombol> ...]");
    expect(rejected[7]).toBe("Bot 'asing' tidak terdaftar. Tidak ada tombol yang dikirim.");
    expect(rejected[8]).toContain("Bot @mati_bot ('bot-mati') tidak hidup (mati), jadi tidak ada tombol yang dikirim.");

    for (const c of tg.calls) {
      expect(JSON.stringify(c.params)).not.toContain(BOT_TOKEN);
      expect(JSON.stringify(c.params)).not.toContain(MASTER);
    }
    expect(sessions()).toEqual(before);
    expect(readFileSync(registryPath(home), "utf8")).toBe(regBefore);
    expect(existsSync(join(home, "bots", "asing"))).toBe(false);
  }, 60_000);

  test("layar sesudahnya disensor: token bot dan token master-bot tidak tampil", async () => {
    sleeper = Bun.spawn(["sleep", "120"], { stdout: "ignore", stderr: "ignore" });
    botFolder("bot-a", sleeper.pid);
    const fileA = receiver("bot-a");
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
    const until = async (cond: () => boolean, what: string) => {
      for (const end = Date.now() + 20_000; !cond(); await Bun.sleep(50)) {
        if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
      }
    };
    try {
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      await until(() => tmux("capture-pane", "-p", "-t", "=bot-a:").stdout.toString().includes("penerima siap"), "penerima siap");
      // Prasyarat: token memang ada di layar.
      expect(tmux("capture-pane", "-p", "-t", "=bot-a:").stdout.toString()).toContain(BOT_TOKEN);
      writeFileSync(registryPath(home), JSON.stringify({ bots: { "bot-a": { telegramId: 1, username: "a_bot", status: "active", createdAt: "x" } } }));
      tg.push(ownerDm("/keys bot-a 2 enter"));
      await until(() => texts().length >= 1, "balasan /keys");
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }
    const [t] = texts();
    expect(received(fileA)).toBe("320d");
    expect(t).toBe(
      "Tombol dikirim ke @a_bot ('bot-a'): 2 enter\n\nLayar @a_bot ('bot-a'), 5 baris terakhir:\n" +
        "<pre>TELEGRAM_BOT_TOKEN=&lt;token disembunyikan&gt;\nmaster &lt;token disembunyikan&gt;\npenerima siap\nterima 32\nterima 0d</pre>",
    );
    for (const secret of [BOT_TOKEN, MASTER]) {
      for (let i = 0; i + 8 <= secret.length; i++) expect(t).not.toContain(secret.slice(i, i + 8));
    }
  }, 30_000);
});
