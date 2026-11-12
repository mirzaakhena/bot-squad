import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * registry.json: daftar bot terdaftar, sumber kebenaran master-bot.
 * Token tidak pernah disimpan di sini; token hanya ada di state/.env bot.
 */
export type BotStatus = "registered" | "active" | "failed";

export type BotRecord = {
  telegramId: number;
  username: string;
  status: BotStatus;
  createdAt: string;
};

export type Registry = { bots: Record<string, BotRecord> };

export class RegistryError extends Error {}

export function registryPath(dataDir: string): string {
  return join(dataDir, "registry.json");
}

/** Membaca registry. File yang belum ada dianggap kosong; file rusak dilempar sebagai RegistryError. */
export function readRegistry(dataDir: string): Registry {
  const file = registryPath(dataDir);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { bots: {} };
    throw new RegistryError(`registry.json tidak bisa dibaca (${(err as NodeJS.ErrnoException).code ?? "error"})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RegistryError("registry.json rusak (bukan JSON yang sah)");
  }
  const bots = (parsed as { bots?: unknown } | null)?.bots;
  if (!bots || typeof bots !== "object" || Array.isArray(bots)) {
    throw new RegistryError("registry.json rusak (field 'bots' tidak ada)");
  }
  return { bots: bots as Record<string, BotRecord> };
}

/** Kait untuk tes: dipanggil setelah file sementara ditulis, sebelum rename. */
export type WriteHooks = { beforeRename?: (tmpFile: string) => void };

/**
 * Menulis registry secara atomik: tulis ke file sementara di folder yang
 * sama, fsync, lalu rename. Kalau proses mati di tengah, registry.json lama
 * tetap utuh; yang tertinggal paling banyak sebuah file .tmp.
 */
export function writeRegistry(dataDir: string, reg: Registry, hooks: WriteHooks = {}): void {
  const file = registryPath(dataDir);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let renamed = false;
  try {
    const fd = openSync(tmp, "wx", 0o600);
    try {
      writeSync(fd, JSON.stringify(reg, null, 2) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    hooks.beforeRename?.(tmp);
    renameSync(tmp, file);
    renamed = true;
  } finally {
    if (!renamed) rmSync(tmp, { force: true });
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Menjalankan fn satu per satu, supaya dua /register yang bersamaan tidak saling menimpa registry. */
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

/**
 * Mengubah status satu bot di registry (satu per satu, lewat serialized).
 * Mengembalikan false kalau bot itu tidak ada di registry.
 */
export function setBotStatus(dataDir: string, name: string, status: BotStatus, hooks: WriteHooks = {}): Promise<boolean> {
  return serialized(async () => {
    const reg = readRegistry(dataDir);
    const rec = reg.bots[name];
    if (!rec || !Object.hasOwn(reg.bots, name)) return false;
    reg.bots[name] = { ...rec, status };
    writeRegistry(dataDir, reg, hooks);
    return true;
  });
}
