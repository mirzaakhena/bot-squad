import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { registryPath } from "../src/registry.ts";
import { startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261113192501: /quota di proses master-bot sungguhan. status.json
 * ditulis oleh bridge statusline sungguhan (plugin/bot-squad-statusline.ts)
 * dari payload berbentuk payload Claude Code. HOME dan BOT_SQUAD_HOME
 * sementara, token palsu, tanpa tmux.
 */

const MASTER = "123456789:AAFakeMasterTokenForQuotaProcess_abcd";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const BRIDGE = join(import.meta.dir, "..", "..", "plugin", "bot-squad-statusline.ts");

let home: string;
let tg: ReturnType<typeof startFakeTelegram>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsq-quota-"));
  mkdirSync(join(home, "master"));
  mkdirSync(join(home, "tmux"), { mode: 0o700 });
  writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
  tg = startFakeTelegram(MASTER);
});
afterEach(() => {
  tg.stop();
  rmSync(home, { recursive: true, force: true });
});

/** Menjalankan bridge sungguhan dengan satu payload, seperti Claude Code. */
function bridge(name: string, payload: unknown) {
  const state = join(home, "bots", name, "state");
  mkdirSync(state, { recursive: true });
  const r = Bun.spawnSync([process.execPath, BRIDGE, state], { stdin: Buffer.from(JSON.stringify(payload)), stdout: "pipe", stderr: "pipe" });
  expect(r.exitCode).toBe(0);
}

function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "master") continue; // master.pid milik proses master-bot
      const p = join(d, e.name);
      const st = statSync(p);
      out.push(`${p} ${st.size} ${st.mtimeMs} ${st.mode}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

describe("/quota di proses master-bot sungguhan", () => {
  test("membaca tangkapan bridge terbaru dan tidak mengubah apa pun", async () => {
    const resets = Math.floor(Date.now() / 1000) + 3 * 86400 + 5400;
    bridge("bot-lama", { context_window: { used_percentage: 5 }, rate_limits: { seven_day: { used_percentage: 20, resets_at: resets } } });
    await Bun.sleep(20);
    bridge("bot-baru", { context_window: { used_percentage: 7 }, rate_limits: { seven_day: { used_percentage: 36, resets_at: resets } } });

    const proc = Bun.spawn([process.execPath, MAIN], {
      env: {
        PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
        HOME: home,
        BOT_SQUAD_HOME: home,
        TMUX_TMPDIR: join(home, "tmux"),
        MASTER_BOT_API_ROOT: tg.apiRoot,
        HTTPS_PROXY: "http://127.0.0.1:9",
        NO_PROXY: "localhost,127.0.0.1,::1,[::1]",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    let before: string[] = [];
    try {
      const until = async (cond: () => boolean, what: string) => {
        for (const end = Date.now() + 10_000; !cond(); await Bun.sleep(50)) {
          if (Date.now() > end) throw new Error(`tidak terjadi: ${what}`);
        }
      };
      await until(() => tg.calls.some((c) => c.method === "getUpdates"), "master-bot polling");
      // Registry ditulis setelah start supaya penyalaan otomatis tidak ikut jalan.
      writeFileSync(
        registryPath(home),
        JSON.stringify({
          bots: {
            "bot-lama": { telegramId: 1, username: "lama_bot", status: "active", createdAt: "x" },
            "bot-baru": { telegramId: 2, username: "baru_bot", status: "stopped", createdAt: "x" },
          },
        }),
      );
      before = snapshot(home);
      tg.push(ownerDm("/quota"));
      await until(() => tg.calls.some((c) => c.method === "sendMessage"), "balasan /quota");
    } finally {
      proc.kill("SIGTERM");
      await proc.exited;
    }
    const text = String(tg.calls.find((c) => c.method === "sendMessage")!.params.text);
    expect(text).toContain("<b>7 hari</b>\n   terpakai 36% · sisa 64%\n   pulih dalam 3 hari 1 jam");
    expect(text).toContain("Data dari bot-baru (@baru_bot), diperbarui baru saja");
    expect(text).not.toContain("5 jam</b>");
    expect(snapshot(home)).toEqual(before);
  }, 30_000);
});
