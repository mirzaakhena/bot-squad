import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { botPaths, PLUGIN_DIR } from "../src/launch.ts";
import { readRegistry } from "../src/registry.ts";
import { findStrayServers, listServerProcesses } from "../src/strays.ts";
import { ok, startFakeTelegram } from "./fake-telegram.ts";
import { OWNER, ownerDm } from "./updates.ts";

/**
 * Tiket 261113190701: master-bot sungguhan dimatikan paksa (SIGKILL) saat
 * /delete sudah menghentikan bot tetapi belum mengarsipkannya (server plugin
 * tiruan yang bandel menahan langkah henti). Master-bot yang menyala lagi
 * tidak boleh menyalakan bot itu. HOME dan BOT_SQUAD_HOME sementara tanpa
 * symlink, server tmux terpisah (TMUX_TMPDIR, -S), Telegram tiruan, token palsu.
 */

const MASTER = "123456789:AAFakeMasterTokenForDeleteCrashTest_a";
const BOT = "5001:AAFakeBotTokenForDeleteCrashTests_aaaaa";
const NAME = "dlc-01";
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const TMUX = Bun.which("tmux");
const BUN = process.execPath;
const home = mkdtempSync(join(tmpdir(), "bsq-delcrash-"));
const bin = join(home, "bin"), tmuxDir = join(home, "tmux");
mkdirSync(bin); mkdirSync(join(tmuxDir, `tmux-${process.getuid!()}`), { recursive: true, mode: 0o700 });
mkdirSync(join(home, "master")); mkdirSync(join(home, "srv"));
writeFileSync(join(home, "master", ".env"), `MASTER_BOT_TOKEN=${MASTER}\nOWNER_TELEGRAM_ID=${OWNER}\n`, { mode: 0o600 });
const script = (n: string, b: string) => { writeFileSync(join(bin, n), `#!/bin/sh\n${b}\n`); chmodSync(join(bin, n), 0o755); };
script("bun", "exit 0");
writeFileSync(join(home, "srv", "server.ts"), `import { writeFileSync } from "node:fs";
writeFileSync(process.env.TELEGRAM_STATE_DIR + "/bot.pid", String(process.pid));
process.on("SIGHUP", () => {}); process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`);
script("claude", `echo "bypass permissions on"\nCLAUDE_PLUGIN_ROOT='${PLUGIN_DIR}' '${BUN}' '${join(home, "srv", "server.ts")}' &\nwhile :; do sleep 1; done`);
const tg = startFakeTelegram(MASTER, {}, { [BOT]: () => ok({ id: 5001, is_bot: true, first_name: "u", username: "uji_dlc_bot" }) });
const socket = join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const tmux = (...a: string[]) => Bun.spawnSync([TMUX!, "-S", socket, ...a], { stdout: "pipe", stderr: "pipe" });
const servers = () => findStrayServers(listServerProcesses(), { stateDir: botPaths(home, NAME).state, pluginDir: PLUGIN_DIR });
const texts = () => tg.calls.filter((c: any) => c.method === "sendMessage").map((c: any) => String(c.params.text));
function symlinks(dir: string): string[] { const out: string[] = []; for (const e of readdirSync(dir)) { const p = join(dir, e); const st = lstatSync(p); if (st.isSymbolicLink()) out.push(p); else if (st.isDirectory()) out.push(...symlinks(p)); } return out; }

const masters: Bun.Subprocess[] = [];
function start() {
  expect(symlinks(home)).toEqual([]);
  const p = Bun.spawn([BUN, MAIN], { env: { PATH: [bin, dirname(TMUX!), "/usr/bin", "/bin"].join(":"), HOME: home, BOT_SQUAD_HOME: home, TMUX_TMPDIR: tmuxDir, MASTER_BOT_API_ROOT: tg.apiRoot, HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "localhost,127.0.0.1,::1,[::1]" }, stdout: "ignore", stderr: "pipe" });
  masters.push(p);
  let log = ""; void (async () => { const d = new TextDecoder(); for await (const c of p.stderr as any) log += d.decode(c); })();
  return { p, log: () => log };
}
const until = async (cond: () => boolean, what: string, ms = 30_000) => { for (const end = Date.now() + ms; !cond(); await Bun.sleep(50)) if (Date.now() > end) throw new Error("tidak terjadi: " + what + "\n" + texts().join("\n---\n")); };

afterAll(() => { for (const m of masters) m.kill("SIGKILL"); if (!TMUX) return rmSync(home, { recursive: true, force: true }); for (const pid of servers()) try { process.kill(pid, "SIGKILL"); } catch {} tmux("kill-server"); tg.stop(); rmSync(home, { recursive: true, force: true }); });

describe.skipIf(!TMUX)("/delete di proses sungguhan", () => {
test("master-bot mati paksa setelah bot dihentikan, sebelum diarsipkan: bot tidak dinyalakan lagi", async () => {
  const a = start();
  await until(() => tg.calls.some((c: any) => c.method === "getUpdates"), "polling A");
  tg.push(ownerDm(`/register ${NAME} ${BOT}`));
  await until(() => texts().some((t) => t.includes("aktif")), "aktif");
  expect(readRegistry(home).bots[NAME].status).toBe("active");
  tg.push(ownerDm(`/delete ${NAME}`));
  await until(() => tg.calls.some((c: any) => c.method === "sendMessage" && c.params.reply_markup), "pertanyaan");
  const q = tg.calls.filter((c: any) => c.method === "sendMessage" && c.params.reply_markup).pop()!;
  const data = (q.params.reply_markup as any).inline_keyboard[0][0].callback_data;
  tg.push({ update_id: 777001, callback_query: { id: "cb1", from: { id: OWNER, is_bot: false, first_name: "u" }, chat_instance: "ci", data, message: { message_id: 5, date: 0, chat: { id: OWNER, type: "private" }, text: "Hapus?" } } } as any);
  await until(() => texts().includes(`Menghapus '${NAME}'...`), "Menghapus");
  await until(() => tmux("has-session", "-t", `=${NAME}`).exitCode !== 0, "sesi mati", 10_000);
  await Bun.sleep(1000);
  // Bot sudah dihentikan, server plugin bandel menahan langkah berikutnya.
  expect(readRegistry(home).bots[NAME].status).toBe("stopped");
  a.p.kill("SIGKILL"); await a.p.exited;
  expect(existsSync(join(botPaths(home, NAME).state, ".env"))).toBe(true);
  expect(existsSync(join(home, "archive"))).toBe(false);
  // Server plugin yang tersisa mati juga (mis. reboot).
  for (const pid of servers()) process.kill(pid, "SIGKILL");
  await Bun.sleep(500);
  expect(servers()).toEqual([]);
  const n = texts().length;
  const b = start();
  await until(() => texts().slice(n).some((t) => t.startsWith("master-bot menyala")), "ringkasan B");
  await Bun.sleep(1500);
  b.p.kill("SIGTERM"); await b.p.exited;
  const after = texts().slice(n);
  expect(after).toHaveLength(1);
  expect(after[0]).toContain(`Dibiarkan:\n- @uji_dlc_bot ('${NAME}'): dihentikan pemilik. Nyalakan dengan /restart ${NAME}`);
  expect(after[0]).not.toContain("Dinyalakan ulang");
  expect(readRegistry(home).bots[NAME].status).toBe("stopped");
  expect(tmux("has-session", "-t", `=${NAME}`).exitCode).not.toBe(0);
  expect(b.log()).not.toContain(BOT);
}, 120_000);
});
