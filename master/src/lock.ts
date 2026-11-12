import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isAlive } from "./launch.ts";

/** Lokasi kunci instance tunggal master-bot di sebuah folder data. */
export function masterLockPath(dataDir: string): string {
  return join(dataDir, "master", "master.pid");
}

export type LockDeps = {
  /** pid proses ini; default process.pid. */
  pid?: number;
  isAlive?: (pid: number) => boolean;
  /** Baris perintah proses dengan pid itu, atau null kalau tidak bisa dibaca. */
  commandOf?: (pid: number) => string | null;
};

export type LockResult =
  | { kind: "acquired"; path: string; release: () => void }
  | { kind: "held"; path: string; pid: number };

/** Baris perintah sebuah proses lewat `ps` (ada di macOS dan Linux). */
export function psCommand(pid: number): string | null {
  const r = Bun.spawnSync(["ps", "-o", "command=", "-p", String(pid)], { stdout: "pipe", stderr: "ignore" });
  if (r.exitCode !== 0) return null;
  const out = r.stdout.toString().trim();
  return out || null;
}

/**
 * Apakah baris perintah ini menjalankan master-bot: salah satu argumennya
 * master/src/main.ts (dengan path apa pun di depannya), atau src/main.ts
 * seperti yang dijalankan `bun run start` dari folder master/.
 */
export function isMasterCommand(command: string): boolean {
  return command
    .split(/\s+/)
    .some((arg) => arg === "src/main.ts" || arg === "./src/main.ts" || arg === "master/src/main.ts" || arg.endsWith("/master/src/main.ts"));
}

function readPid(path: string): number | null {
  try {
    const text = readFileSync(path, "utf8").trim();
    if (!/^[1-9][0-9]*$/.test(text)) return null;
    return Number(text);
  } catch {
    return null;
  }
}

/**
 * Mengambil kunci BOT_SQUAD_HOME/master/master.pid. Kunci dibuat atomik
 * (file sementara berisi pid, lalu link yang gagal kalau kunci sudah ada),
 * jadi tidak pernah terlihat kosong. Kunci yang ada dianggap basi kalau
 * pid-nya sudah mati, pid itu milik proses ini sendiri (pid dipakai ulang
 * OS), atau prosesnya bukan master-bot; kunci basi diambil alih.
 */
export function acquireMasterLock(dataDir: string, deps: LockDeps = {}): LockResult {
  const pid = deps.pid ?? process.pid;
  const alive = deps.isAlive ?? isAlive;
  const commandOf = deps.commandOf ?? psCommand;
  const path = masterLockPath(dataDir);
  mkdirSync(join(dataDir, "master"), { recursive: true });

  const tmp = `${path}.${pid}.tmp`;
  writeFileSync(tmp, `${pid}\n`, { mode: 0o644 });
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        linkSync(tmp, path);
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          // Hanya kunci milik proses ini yang dihapus.
          if (readPid(path) === pid) rmSync(path, { force: true });
        };
        return { kind: "acquired", path, release };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }

      const holder = readPid(path);
      if (holder !== null && holder !== pid && alive(holder)) {
        const cmd = commandOf(holder);
        // Kalau perintahnya tidak terbaca, anggap masih dipegang: lebih aman
        // menolak start daripada mengusir master-bot yang sedang berjalan.
        if (cmd === null || isMasterCommand(cmd)) return { kind: "held", path, pid: holder };
      }

      // Basi. Dipindah dulu (atomik), lalu dipastikan yang dipindah memang
      // kunci basi tadi, bukan kunci baru dari proses lain yang lebih cepat.
      const aside = `${path}.${pid}.stale`;
      try {
        renameSync(path, aside);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      if (readPid(aside) !== holder) {
        try {
          linkSync(aside, path);
        } catch {}
      }
      rmSync(aside, { force: true });
    }
    throw new Error(`kunci ${path} tidak bisa diambil`);
  } finally {
    rmSync(tmp, { force: true });
  }
}
