import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Tiket 261112211001: kalau proses Claude mati paksa, server plugin harus
 * keluar sendiri dalam 10 detik, bukan menjadi yatim yang memakan CPU.
 * Induk tiruan (bun) memegang pipa stdin/stdout/stderr server seperti
 * Claude, lalu dimatikan dengan SIGKILL.
 */

const PLUGIN = resolve(import.meta.dir, "..");
const hasDeps = existsSync(join(PLUGIN, "node_modules", "@modelcontextprotocol"));
if (!hasDeps) console.warn(`orphan.test: dilewati, paket plugin belum dipasang (bun install --cwd ${PLUGIN})`);

const FAKE_TOKEN = "5001:AAFakeTokenForOrphanTest_aaaaaaaaaaaaaa";
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

let state = "";
const leftovers: number[] = [];
afterEach(() => {
  for (const pid of leftovers.splice(0)) if (alive(pid)) process.kill(pid, "SIGKILL");
  if (state) rmSync(state, { recursive: true, force: true });
});

test.skipIf(!hasDeps)("server plugin keluar sendiri setelah induknya mati paksa", async () => {
  state = mkdtempSync(join(tmpdir(), "bot-squad-orphan-"));
  // Induk tiruan: menyalakan server.ts dengan pipa, mencetak pid-nya, lalu diam.
  const parentSrc = `
    const c = Bun.spawn(["bun", "server.ts"], { cwd: ${JSON.stringify(PLUGIN)}, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    console.log(c.pid);
    await Bun.sleep(1e9);
  `;
  const parent = Bun.spawn(["bun", "-e", parentSrc], {
    stdout: "pipe",
    stderr: "inherit",
    env: {
      ...process.env,
      TELEGRAM_STATE_DIR: state,
      TELEGRAM_BOT_TOKEN: FAKE_TOKEN,
      // Jangan pernah menghubungi Telegram dari tes: semua HTTPS lewat proxy mati.
      HTTPS_PROXY: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
    },
  });
  leftovers.push(parent.pid);
  const reader = (parent.stdout as ReadableStream<Uint8Array>).getReader();
  const { value } = await reader.read();
  const server = parseInt(new TextDecoder().decode(value), 10);
  expect(server).toBeGreaterThan(1);
  leftovers.push(server);

  // Tunggu server benar-benar berjalan (menulis bot.pid).
  const pidFile = join(state, "bot.pid");
  for (let i = 0; i < 100 && !existsSync(pidFile); i++) await Bun.sleep(100);
  expect(readFileSync(pidFile, "utf8")).toBe(String(server));
  await Bun.sleep(500);

  process.kill(parent.pid, "SIGKILL");
  const t0 = Date.now();
  while (alive(server) && Date.now() - t0 < 10_000) await Bun.sleep(200);
  expect(alive(server)).toBe(false);
}, 20_000);
