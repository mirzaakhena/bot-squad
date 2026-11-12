/**
 * Menyalakan satu bot dari terminal: bun master/src/start-cli.ts <nama-bot>.
 * Dipanggil oleh scripts/start-bot.sh; logikanya sama dengan yang dipakai
 * master-bot setelah /register (launch.ts).
 * Kode keluar: 0 siap, 1 gagal atau sudah berjalan, 2 pemakaian salah.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, masterEnvPath, parseEnv } from "./config.ts";
import { botPaths, launchBot, READY_TIMEOUT_MS, realLaunchDeps } from "./launch.ts";
import { NAME_RULE } from "./register.ts";

const name = process.argv[2] ?? "";
if (!NAME_RULE.test(name)) {
  console.error("pemakaian: start-bot.sh <nama-bot>  (huruf kecil, angka, '-')");
  process.exit(2);
}

const dir = dataDir();
let ownerRaw = "";
try {
  ownerRaw = parseEnv(readFileSync(masterEnvPath(), "utf8")).OWNER_TELEGRAM_ID ?? "";
} catch {}
const needsOwner = !existsSync(join(botPaths(dir, name).state, "access.json"));
if (needsOwner && !/^[1-9][0-9]*$/.test(ownerRaw)) {
  console.error(`start-bot: OWNER_TELEGRAM_ID tidak valid di ${masterEnvPath()}`);
  process.exit(1);
}

const secs = Number(process.env.READY_TIMEOUT);
const deps = {
  ...realLaunchDeps(dir, Number(ownerRaw) || 0, (m) => console.error(`start-bot: ${m}`)),
  timeoutMs: Number.isFinite(secs) && secs > 0 ? secs * 1000 : READY_TIMEOUT_MS,
};
const res = await launchBot(name, deps);
if (res.kind === "active") {
  console.log(`start-bot: '${name}' siap (tmux: ${name}, plugin pid ${res.pid})`);
  process.exit(0);
}
if (res.kind === "already-running") {
  console.error(`start-bot: ${res.reason}`);
  process.exit(1);
}
console.error(`start-bot: '${name}' gagal: ${res.reason}`);
if (res.screen) console.error(`--- layar terakhir ---\n${res.screen}\n---`);
if (res.sessionAlive) console.error(`lihat: tmux attach -t ${name}`);
process.exit(1);
