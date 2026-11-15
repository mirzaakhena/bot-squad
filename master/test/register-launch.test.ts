import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMasterBot, launchReport } from "../src/bot.ts";
import type { ConversationMode, LaunchResult } from "../src/launch.ts";
import { readRegistry } from "../src/registry.ts";
import { ME, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

// Token palsu.
const MASTER = "123456789:AAFakeMasterTokenForLaunchFlow_abcd";
const GOOD = "5001:AAGoodFakeTokenForLaunchFlow_aaaaaaaaa";
const GOOD2 = "5002:AASecondFakeTokenForLaunchFlow_bbbbbbb";
const botMe = (id: number, username: string) => ok({ id, is_bot: true, first_name: username, username });

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;
let logs: string[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-reglaunch-"));
  logs = [];
  tg = startFakeTelegram(MASTER, {}, { [GOOD]: () => botMe(5001, "uji_satu_bot"), [GOOD2]: () => botMe(5002, "uji_dua_bot") });
});
afterEach(() => {
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

function makeBot(launch: (name: string, mode: ConversationMode) => Promise<LaunchResult>) {
  const pending: Promise<void>[] = [];
  const bot = createMasterBot({
    token: MASTER,
    ownerId: OWNER,
    log: (m) => logs.push(m),
    client: { apiRoot: tg.apiRoot },
    botInfo: ME,
    dataDir: home,
    getMeTimeoutMs: 200,
    launch,
    onLaunch: (p) => pending.push(p),
  });
  return { bot, settle: () => Promise.all(pending) };
}

const messages = () => tg.calls.filter((c) => c.method === "sendMessage");

describe("/register menyalakan bot", () => {
  test("berhasil: 'menyalakan', lalu 'aktif'; status active", async () => {
    const launched: string[] = [];
    const modes: string[] = [];
    const { bot, settle } = makeBot(async (name, mode) => {
      launched.push(name);
      modes.push(mode);
      return { kind: "active", pid: 4242, conversation: { kind: "new", why: "requested" } };
    });
    await bot.handleUpdate(ownerDm(`/register bot-01 ${GOOD}`));
    await settle();
    expect(launched).toEqual(["bot-01"]);
    // Bot baru selalu mulai dari percakapan kosong (tiket 261115100301), dan laporannya tidak membahas percakapan.
    expect(modes).toEqual(["new"]);
    expect(String(messages()[1]!.params.text)).not.toMatch(/percakapan/i);
    const m = messages();
    expect(m).toHaveLength(2);
    expect(String(m[0]!.params.text)).toContain("Menyalakan 'bot-01'");
    expect(String(m[1]!.params.text)).toContain("aktif");
    expect(m[1]!.params.chat_id).toBe(OWNER);
    expect(m[1]!.params.parse_mode).toBe("HTML");
    expect(readRegistry(home).bots["bot-01"]!.status).toBe("active");
    for (const c of tg.calls) expect(JSON.stringify(c.params)).not.toContain(GOOD);
  });

  test("gagal: pesan gagal berisi layar dan tmux attach; status failed", async () => {
    const { bot, settle } = makeBot(async () => ({
      kind: "failed",
      reason: "belum siap setelah 90 detik",
      sessionAlive: true,
      screen: "baris <satu>\nbaris & dua",
    }));
    await bot.handleUpdate(ownerDm(`/register bot-01 ${GOOD}`));
    await settle();
    const text = String(messages()[1]!.params.text);
    expect(text).toContain("gagal dinyalakan: belum siap setelah 90 detik");
    expect(text).toContain("<pre>baris &lt;satu&gt;\nbaris &amp; dua</pre>");
    expect(text).toContain("<code>tmux attach -t bot-01</code>");
    expect(readRegistry(home).bots["bot-01"]!.status).toBe("failed");
  });

  test("launch melempar error: tetap dilaporkan gagal dan dicatat failed", async () => {
    const { bot, settle } = makeBot(async () => {
      throw new Error("boom");
    });
    await bot.handleUpdate(ownerDm(`/register bot-01 ${GOOD}`));
    await settle();
    expect(String(messages()[1]!.params.text)).toContain("gagal dinyalakan");
    expect(readRegistry(home).bots["bot-01"]!.status).toBe("failed");
  });

  test("sudah berjalan: dilaporkan, status tidak diubah", async () => {
    const { bot, settle } = makeBot(async () => ({ kind: "already-running", reason: "sesi tmux 'bot-01' sudah hidup" }));
    await bot.handleUpdate(ownerDm(`/register bot-01 ${GOOD}`));
    await settle();
    expect(String(messages()[1]!.params.text)).toContain("tidak dinyalakan: sesi tmux 'bot-01' sudah hidup");
    expect(readRegistry(home).bots["bot-01"]!.status).toBe("registered");
  });

  test("registrasi ditolak: tidak ada yang dinyalakan", async () => {
    let called = false;
    const { bot, settle } = makeBot(async () => ((called = true), { kind: "active", pid: 1 }));
    await bot.handleUpdate(ownerDm(`/register Bot ${GOOD}`));
    await settle();
    expect(called).toBe(false);
    expect(messages()).toHaveLength(1);
  });

  test("master-bot tetap melayani perintah lain selama menunggu", async () => {
    const releases: Array<(r: LaunchResult) => void> = [];
    const { bot, settle } = makeBot(() => new Promise((r) => releases.push(r)));
    await bot.handleUpdate(ownerDm(`/register bot-01 ${GOOD}`));
    await bot.handleUpdate(ownerDm("/help"));
    await bot.handleUpdate(ownerDm(`/register bot-02 ${GOOD2}`));
    expect(messages()).toHaveLength(3);
    expect(String(messages()[1]!.params.text)).toContain("Perintah yang tersedia");
    expect(releases).toHaveLength(2);
    for (const r of releases) r({ kind: "active", pid: 1 });
    await settle();
    expect(messages()).toHaveLength(5);
  });
});

describe("launchReport", () => {
  test("username di-escape", () => {
    expect(launchReport("a", "x<y", { kind: "active", pid: 1 })).toContain("@x&lt;y");
  });
  test("sesi sudah tidak ada: tanpa tmux attach", () => {
    const t = launchReport("a", "u", { kind: "failed", reason: "sesi berhenti saat start", sessionAlive: false });
    expect(t).not.toContain("tmux attach");
    expect(t).toContain("failed");
  });
});
