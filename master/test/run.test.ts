import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/main.ts";
import { fail, ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm, STRANGER } from "./updates.ts";

const TOKEN = "987654321:AAAnotherFakeToken_ForRunTests_xyz12345";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bot-squad-master-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function writeEnv(content: string) {
  mkdirSync(join(home, "master"), { recursive: true });
  writeFileSync(join(home, "master", ".env"), content, { mode: 0o600 });
}

const envPath = () => join(home, "master", ".env");

/** Menjalankan entrypoint asli sebagai proses terpisah. */
async function spawnMain() {
  const proc = Bun.spawn(["bun", MAIN], {
    env: { PATH: process.env.PATH ?? "", HOME: home, BOT_SQUAD_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  return { code, out: (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text()) };
}

describe("konfigurasi kurang: berhenti dengan pesan jelas", () => {
  test("file .env tidak ada", async () => {
    const { code, out } = await spawnMain();
    expect(code).toBe(1);
    expect(out).toContain("tidak ditemukan");
    expect(out).toContain(envPath());
    expect(out).toContain("MASTER_BOT_TOKEN=");
    expect(out).toContain("OWNER_TELEGRAM_ID=");
  });

  test("token kosong", async () => {
    writeEnv(`OWNER_TELEGRAM_ID=${OWNER}\n`);
    const { code, out } = await spawnMain();
    expect(code).toBe(1);
    expect(out).toContain(envPath());
    expect(out).toContain("MASTER_BOT_TOKEN belum diisi");
    expect(out).not.toContain("OWNER_TELEGRAM_ID belum diisi");
  });

  test("ID pemilik kosong, token tidak dicetak", async () => {
    writeEnv(`MASTER_BOT_TOKEN=${TOKEN}\n`);
    const { code, out } = await spawnMain();
    expect(code).toBe(1);
    expect(out).toContain(envPath());
    expect(out).toContain("OWNER_TELEGRAM_ID belum diisi");
    expect(out).not.toContain("MASTER_BOT_TOKEN belum diisi");
    expect(out).not.toContain(TOKEN);
  });

  test("keduanya kosong disebut sekaligus", async () => {
    writeEnv("# kosong\nMASTER_BOT_TOKEN=\n");
    const { code, out } = await spawnMain();
    expect(code).toBe(1);
    expect(out).toContain("MASTER_BOT_TOKEN belum diisi");
    expect(out).toContain("OWNER_TELEGRAM_ID belum diisi");
  });

  test("ID pemilik bukan angka", async () => {
    writeEnv(`MASTER_BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=@pemilik\n`);
    const { code, out } = await spawnMain();
    expect(code).toBe(1);
    expect(out).toContain("OWNER_TELEGRAM_ID harus berupa angka");
    expect(out).not.toContain(TOKEN);
  });
});

describe("Telegram menolak: berhenti dengan pesan jelas tanpa token", () => {
  test("401 dari getMe", async () => {
    writeEnv(`MASTER_BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=${OWNER}\n`);
    const tg = startFakeTelegram(TOKEN, { getMe: () => fail(401, "Unauthorized") });
    const lines: string[] = [];
    try {
      const code = await run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l), client: { apiRoot: tg.apiRoot } });
      const out = lines.join("\n");
      expect(code).toBe(1);
      expect(out).toContain("401");
      expect(out).toContain("menolak token");
      expect(out).toContain(envPath());
      expect(out).not.toContain(TOKEN);
      expect(tg.calls.map((c) => c.method)).not.toContain("getUpdates");
    } finally {
      tg.stop();
    }
  });

  test("409 dari getUpdates", async () => {
    writeEnv(`MASTER_BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=${OWNER}\n`);
    const tg = startFakeTelegram(TOKEN, {
      getUpdates: () => fail(409, "Conflict: terminated by other getUpdates request"),
    });
    const lines: string[] = [];
    try {
      const code = await run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l), client: { apiRoot: tg.apiRoot } });
      const out = lines.join("\n");
      expect(code).toBe(1);
      expect(out).toContain("409");
      expect(out).toContain("digantikan oleh master-bot lain");
      expect(out).not.toContain("sudah berjalan di tempat lain");
      expect(out).not.toContain(TOKEN);
    } finally {
      tg.stop();
    }
  });
});

test("berjalan penuh: setMyCommands, membalas pemilik, mengabaikan akun lain, token tidak di log", async () => {
  writeEnv(`MASTER_BOT_TOKEN="${TOKEN}"\nOWNER_TELEGRAM_ID=${OWNER}\n`);
  const tg = startFakeTelegram(TOKEN);
  const stranger = ownerDm("/start");
  stranger.message!.from!.id = STRANGER;
  (stranger.message!.chat as any).id = STRANGER;
  tg.push(stranger, ownerDm("/help"));
  const lines: string[] = [];
  const ac = new AbortController();
  try {
    const done = run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l), client: { apiRoot: tg.apiRoot }, signal: ac.signal });
    for (let i = 0; i < 200 && !tg.calls.some((c) => c.method === "sendMessage"); i++) await Bun.sleep(10);
    ac.abort();
    expect(await done).toBe(0);

    const cmds = tg.calls.find((c) => c.method === "setMyCommands");
    expect((cmds!.params.commands as any[]).map((c) => c.command)).toEqual(["start", "help", "register", "list", "stop", "restart", "allow", "revoke", "access"]);
    const sent = tg.calls.filter((c) => c.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.params.chat_id).toBe(OWNER);
    const out = lines.join("\n");
    expect(out).toContain(`update diabaikan dari ${STRANGER}`);
    expect(out).not.toContain(TOKEN);
    for (const c of tg.calls) expect(JSON.stringify(c.params)).not.toContain(TOKEN);
  } finally {
    ac.abort();
    tg.stop();
  }
});

test("error lain yang memuat token tetap disensor", async () => {
  writeEnv(`MASTER_BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=${OWNER}\n`);
  const tg = startFakeTelegram(TOKEN, { getMe: () => fail(400, `Bad Request: token ${TOKEN} aneh`) });
  const lines: string[] = [];
  try {
    const code = await run({ env: { BOT_SQUAD_HOME: home }, write: (l) => lines.push(l), client: { apiRoot: tg.apiRoot } });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("<token disembunyikan>");
    expect(lines.join("\n")).not.toContain(TOKEN);
  } finally {
    tg.stop();
  }
});
