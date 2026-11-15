import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { botPaths } from "./launch.ts";
import { serialized } from "./registry.ts";

/**
 * /allow, /revoke, dan /access (tiket 261112225307): siapa saja yang boleh
 * mengobrol dengan satu bot, lewat allowFrom di state/access.json bot itu.
 * Hanya berkas bot yang disebut yang disentuh; master-bot sendiri tetap hanya
 * melayani pemilik (access.ts). Plugin membaca access.json setiap pesan, jadi
 * perubahan berlaku tanpa restart.
 *
 * access.json yang rusak dipindahkan plugin (lalu tidak ada yang diizinkan
 * sampai ditulis lagi), jadi berkas ini tidak pernah ditulis setengah jadi (sementara, fsync,
 * rename) dan berkas yang tidak bisa dipahami tidak pernah ditimpa.
 */

/** user_id Telegram: bilangan bulat positif (ID orang selalu positif). */
export const USER_ID_RULE = /^[1-9][0-9]{0,15}$/;

export function isUserId(s: string): boolean {
  return USER_ID_RULE.test(s) && Number.isSafeInteger(Number(s));
}

export type AccessFile = Record<string, unknown> & { allowFrom: string[]; dmPolicy?: unknown };

export type ReadAccess = { ok: true; access: AccessFile } | { ok: false; reason: string };

export function accessPath(dataDir: string, name: string): string {
  return join(botPaths(dataDir, name).state, "access.json");
}

/**
 * Membaca access.json satu bot. Gagal (dengan alasan untuk pemilik) kalau
 * berkasnya tidak ada, tidak terbaca, bukan objek JSON, atau allowFrom bukan
 * daftar teks.
 */
export function readAccess(dataDir: string, name: string): ReadAccess {
  let text: string;
  try {
    text = readFileSync(accessPath(dataDir, name), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, reason: `access.json '${name}' belum ada (biasanya dibuat saat registrasi). Nyalakan bot dengan /restart ${name} dulu` };
    }
    return { ok: false, reason: `access.json '${name}' tidak bisa dibaca (${code ?? "error"})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: `access.json '${name}' rusak (bukan JSON yang sah)` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `access.json '${name}' rusak (bukan objek JSON)` };
  }
  const obj = parsed as Record<string, unknown>;
  const allow = obj.allowFrom ?? [];
  if (!Array.isArray(allow) || !allow.every((x) => typeof x === "string")) {
    return { ok: false, reason: `access.json '${name}' rusak (allowFrom bukan daftar teks)` };
  }
  return { ok: true, access: { ...obj, allowFrom: allow as string[] } };
}

/** Kait untuk tes: dipanggil setelah berkas sementara ditulis, sebelum rename. */
export type AccessWriteHooks = { beforeRename?: (tmpFile: string) => void };

/** Menulis access.json secara atomik dengan mode 0600. */
export function writeAccess(dataDir: string, name: string, access: AccessFile, hooks: AccessWriteHooks = {}): void {
  const file = accessPath(dataDir, name);
  const tmp = join(dirname(file), `.access.json.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let renamed = false;
  try {
    // "wx": tidak pernah mengikuti symlink atau menimpa berkas yang sudah ada.
    const fd = openSync(tmp, "wx", 0o600);
    try {
      writeSync(fd, JSON.stringify(access, null, 2) + "\n");
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

export type ChangeResult =
  | { kind: "added" | "removed"; access: AccessFile }
  | { kind: "already" | "absent"; access: AccessFile }
  | { kind: "owner" }
  | { kind: "error"; reason: string };

/**
 * Menambah (allow) atau mencabut (revoke) satu user_id di allowFrom. Semua
 * kolom lain dipertahankan apa adanya, termasuk dmPolicy. Pemilik tidak bisa
 * dicabut. Tidak ada yang ditulis kalau tidak ada yang berubah.
 */
export function changeAccess(
  dataDir: string,
  name: string,
  userId: string,
  op: "allow" | "revoke",
  ownerId: number,
  hooks?: AccessWriteHooks,
): Promise<ChangeResult> {
  return serialized(async () => {
    if (op === "revoke" && userId === String(ownerId)) return { kind: "owner" };
    const read = readAccess(dataDir, name);
    if (!read.ok) return { kind: "error", reason: read.reason };
    const access = read.access;
    const has = access.allowFrom.includes(userId);
    if (op === "allow" && has) return { kind: "already", access };
    if (op === "revoke" && !has) return { kind: "absent", access };
    const next: AccessFile = {
      ...access,
      allowFrom: op === "allow" ? [...access.allowFrom, userId] : access.allowFrom.filter((x) => x !== userId),
    };
    try {
      writeAccess(dataDir, name, next, hooks);
    } catch (err) {
      return { kind: "error", reason: `access.json '${name}' gagal ditulis (${(err as NodeJS.ErrnoException).code ?? "error"}); tidak ada yang berubah` };
    }
    return { kind: op === "allow" ? "added" : "removed", access: next };
  });
}

/** Jumlah orang unik di allowFrom. */
export function accessCount(access: AccessFile): number {
  return new Set(access.allowFrom).size;
}

/** Catatan kalau dmPolicy bukan allowlist, atau null. */
export function policyNote(access: AccessFile): string | null {
  const p = access.dmPolicy;
  if (p === undefined || p === "allowlist") return null;
  if (p === "disabled") return "Catatan: dmPolicy bot ini 'disabled', jadi bot tidak menerima pesan pribadi dari siapa pun, termasuk orang di daftar ini.";
  return `Catatan: dmPolicy bot ini ${JSON.stringify(p)}, bukan 'allowlist'. Plugin memperlakukannya sebagai 'allowlist': hanya orang di daftar ini yang dilayani.`;
}

export const ALLOW_USAGE =
  "Cara pakai: /allow <nama> <user_id>\nuser_id: ID Telegram orang itu (angka positif). Nama hanya huruf kecil, angka, dan '-'.";
export const REVOKE_USAGE =
  "Cara pakai: /revoke <nama> <user_id>\nuser_id: ID Telegram orang itu (angka positif). Nama hanya huruf kecil, angka, dan '-'.";
export const ACCESS_USAGE = "Cara pakai: /access <nama>\nNama hanya huruf kecil, angka, dan '-'.";

/** Peringatan wajib di balasan /allow (Q2). */
export function allowWarning(name: string, userId: string): string {
  return (
    `Peringatan: bot ini berjalan bebas izin, jadi ${userId} bisa menyuruhnya menjalankan perintah apa pun di server ini. ` +
    `Ia juga bisa memakai perintah plugin di chat bot itu, sama dengan pemilik: /context (menampilkan kuota akun Claude pemilik) dan /status.\n` +
    `Cabut kapan saja dengan /revoke ${name} ${userId}.`
  );
}

/** Teks /access (teks biasa): daftar user_id, pemilik ditandai. */
export function accessText(name: string, username: string, access: AccessFile, ownerId: number): string {
  const ids = [...new Set(access.allowFrom)];
  const owner = String(ownerId);
  const lines = [`Akses ke @${username} ('${name}'): ${ids.length} orang`];
  if (ids.length === 0) lines.push("(kosong: tidak ada yang bisa mengobrol dengan bot ini, termasuk pemilik)");
  for (const id of ids) lines.push(`• ${id}${id === owner ? " (pemilik)" : ""}`);
  if (!ids.includes(owner)) lines.push("Pemilik tidak ada di daftar ini. Tambahkan dengan /allow " + `${name} ${owner}.`);
  const note = policyNote(access);
  if (note) lines.push(note);
  lines.push(`Tambah dengan /allow ${name} <user_id>, cabut dengan /revoke ${name} <user_id>.`);
  return lines.join("\n");
}
