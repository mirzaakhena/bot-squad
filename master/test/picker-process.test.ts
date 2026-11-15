import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Update } from "grammy/types";
import { deleteQuestion } from "../src/bot.ts";
import { pickBotQuestion, pickCancelledText, pickedBotText, pickedUserText, pickUserQuestion } from "../src/picker.ts";
import { registryPath } from "../src/registry.ts";
import { ME, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261115202403: pemilih bot di proses master-bot sungguhan terhadap
 * Telegram tiruan, dengan sesi tmux sungguhan di server tmux terpisah
 * (TMUX_TMPDIR, -S). HOME dan BOT_SQUAD_HOME sementara, token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForPickProcess_abcd";
const BOT_TOKEN = "5001235:AAFakeBotTokenForPickProcess_aaaaaaaaaaaa";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");
const GUEST = "777001";

let home: string;
let tmuxDir: string;
let tg: ReturnType<typeof startFakeTelegram>;

const socket = () => join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const tmux = (...args: string[]) =>
  Bun.spawnSync([TMUX!, "-S", socket(), ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } });
const sessions = () => tmux("list-sessions", "-F", "#{session_name}").stdout.toString().split("\n").filter(Boolean).sort();
const accessFile = (name: string) => join(home, "bots", name, "state", "access.json");

function botFolder(name: string, allow: string[]) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, ".env"), `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}\n`, { mode: 0o600 });
  writeFileSync(accessFile(name), JSON.stringify({ dmPolicy: "allowlist", allowFrom: allow }, null, 2) + "\n", { mode: 0o600 });
}

beforeEach(() => {
  // Folder pendek di /tmp: soket tmux tidak boleh melewati batas panjang path.
  home = mkdtempSync(join(tmpdir(), "bsq-pick-"));
  tmuxDir = join(home, "tmux");
  mkdirSync(join(tmuxDir, `tmux-${process.getuid!()}`), { recursive: true, mode: 0o700 });
  mkdirSync(join(home, "master"));
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
  tg = startFakeTelegram(MASTER);
});

afterEach(() => {
  tg.stop();
  if (TMUX) tmux("kill-server");
  rmSync(home, { recursive: true, force: true });
});

let nextUpdate = 980_000;
const press = (data: string, messageId: number): Update => ({
  update_id: nextUpdate++,
  callback_query: {
    id: `cb${nextUpdate}`,
    from: { id: OWNER, is_bot: false, first_name: "u" },
    chat_instance: "ci",
    data,
    message: { message_id: messageId, date: 0, chat: { id: OWNER, type: "private", first_name: "u" }, from: { id: ME.id, is_bot: true, first_name: "m" }, text: "?" } as any,
  },
});

describe.skipIf(!TMUX)("pemilih bot di proses master-bot sungguhan", () => {
  test("/logs, /revoke dua langkah, cancel, dan /delete lewat tombol", async () => {
    botFolder("bot-hidup", [String(OWNER), GUEST, "777002"]);
    botFolder("bot-mati", [String(OWNER), GUEST]);
    const script = join(home, "layar.sh");
    writeFileSync(script, "for i in $(seq 1 30); do echo \"baris $i\"; done\necho selesai\nsleep 300\n");
    expect(tmux("new-session", "-d", "-s", "bot-hidup", "-x", "200", "-y", "80", "sh", script).exitCode).toBe(0);
    const sessionsBefore = sessions();
    expect(sessionsBefore).toEqual(["bot-hidup"]);

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
    const sent = () => tg.calls.filter((c) => c.method === "sendMessage");
    const texts = () => sent().map((c) => String(c.params.text));
    const edits = () => tg.calls.filter((c) => c.method === "editMessageText");
    const labels = (i: number): string[][] => ((sent()[i]!.params.reply_markup as any)?.inline_keyboard ?? []).map((r: any[]) => r.map((b) => b.text));
    const data = (i: number, label: string): string =>
      ((sent()[i]!.params.reply_markup as any).inline_keyboard as any[][]).flat().find((b) => b.text === label).callback_data;
    let regBefore = "";
    try {
      const until = async (cond: () => boolean, what: string) => {
        for (const end = Date.now() + 10_000; !cond(); await Bun.sleep(50)) {
          if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
        }
      };
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      await until(() => tmux("capture-pane", "-p", "-t", "=bot-hidup:").stdout.toString().includes("selesai"), "layar siap");
      // Ditulis setelah polling berjalan, supaya penyalaan otomatis tidak ikut campur.
      writeFileSync(
        registryPath(home),
        JSON.stringify({
          bots: {
            "bot-mati": { telegramId: 2, username: "mati_bot", status: "stopped", createdAt: "x" },
            "bot-hidup": { telegramId: 1, username: "hidup_bot", status: "stopped", createdAt: "x" },
          },
        }),
      );
      regBefore = readFileSync(registryPath(home), "utf8");

      // 0-1: /logs tanpa nama, lalu tombol bot-hidup.
      tg.push(ownerDm("/logs"));
      await until(() => sent().length >= 1, "pemilih /logs");
      expect(texts()[0]).toBe(pickBotQuestion("logs", 2, 2));
      expect(labels(0)).toEqual([["bot-hidup", "bot-mati"], ["cancel"]]);
      tg.push(press(data(0, "bot-hidup"), 101));
      await until(() => sent().length >= 2, "layar bot-hidup");
      expect(texts()[1]).toStartWith("Layar @hidup_bot ('bot-hidup'), 20 baris terakhir:");
      expect(texts()[1]).toContain("baris 30\nselesai");
      expect(edits()[0]!.params).toMatchObject({ message_id: 101, text: pickedBotText("logs", "bot-hidup") });
      expect(edits()[0]!.params.reply_markup).toBeUndefined();

      // 2: tombol yang sama sekali lagi: kedaluwarsa.
      tg.push(press(data(0, "bot-mati"), 101));
      await until(() => sent().length >= 3, "kedaluwarsa");
      expect(texts()[2]).toContain("kedaluwarsa");

      // 3-5: /revoke tanpa argumen, bot, lalu user_id.
      tg.push(ownerDm("/revoke"));
      await until(() => sent().length >= 4, "pemilih /revoke");
      tg.push(press(data(3, "bot-hidup"), 102));
      await until(() => sent().length >= 5, "pemilih user_id");
      expect(texts()[4]).toBe(pickUserQuestion("bot-hidup", "hidup_bot", 2, 2));
      expect(labels(4)).toEqual([[GUEST, "777002"], ["cancel"]]);
      tg.push(press(data(4, GUEST), 103));
      await until(() => sent().length >= 6, "akses dicabut");
      expect(texts()[5]).toBe(`Akses dicabut: pesan ${GUEST} ke @hidup_bot ('bot-hidup') mulai sekarang diabaikan.`);
      expect(edits()[2]!.params).toMatchObject({ message_id: 103, text: pickedUserText("bot-hidup", GUEST) });
      expect(JSON.parse(readFileSync(accessFile("bot-hidup"), "utf8")).allowFrom).toEqual([String(OWNER), "777002"]);
      expect(JSON.parse(readFileSync(accessFile("bot-mati"), "utf8")).allowFrom).toEqual([String(OWNER), GUEST]);

      // 6: /stop tanpa nama lalu cancel: tidak ada yang berubah.
      tg.push(ownerDm("/stop"));
      await until(() => sent().length >= 7, "pemilih /stop");
      tg.push(press(data(6, "cancel"), 104));
      await until(() => edits().length >= 4, "cancel");
      expect(edits()[3]!.params).toMatchObject({ message_id: 104, text: pickCancelledText("stop") });

      // 7-9: /delete tanpa nama, bot, konfirmasi biasa, Batal.
      tg.push(ownerDm("/delete"));
      await until(() => sent().length >= 8, "pemilih /delete");
      tg.push(press(data(7, "bot-mati"), 105));
      await until(() => sent().length >= 9, "konfirmasi /delete");
      expect(texts()[8]).toBe(deleteQuestion("bot-mati", "mati_bot"));
      expect(labels(8)).toEqual([["Hapus", "Batal"]]);
      tg.push(press(data(8, "Batal"), 106));
      await until(() => sent().length >= 10, "penghapusan dibatalkan");
      expect(texts()[9]).toBe("Penghapusan 'bot-mati' dibatalkan. Tidak ada yang diubah.");
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }

    expect(sent().length).toBe(10);
    expect(readFileSync(registryPath(home), "utf8")).toBe(regBefore);
    expect(sessions()).toEqual(sessionsBefore);
    for (const c of tg.calls) {
      expect(JSON.stringify(c.params)).not.toContain(BOT_TOKEN);
      expect(JSON.stringify(c.params)).not.toContain(MASTER);
    }
  }, 40_000);
});
