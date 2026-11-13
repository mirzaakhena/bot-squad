import { existsSync, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { NAME_RULE } from "./register.ts";
import { readRegistry, serialized, writeRegistry, type WriteHooks } from "./registry.ts";

/**
 * Penghapusan satu bot (tiket 261112225306, Q1): setelah bot dimatikan,
 * state/.env (token) dihapus, lalu seluruh folder bots/<nama> dipindah utuh
 * dengan satu rename ke archive/<nama>-<YYYYMMDD-HHMMSS>/, lalu entri
 * registry dihapus. Arsip tidak pernah dihapus otomatis. Semua langkah
 * berjalan di dalam serialized(), sehingga /register nama yang sama tidak
 * bisa menyela di tengah.
 */

export function archiveDir(dataDir: string): string {
  return join(dataDir, "archive");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Cap waktu arsip dalam waktu lokal server: YYYYMMDD-HHMMSS. */
export function archiveStamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export type ArchiveResult =
  | {
      ok: true;
      /** Path arsip, atau null kalau folder bot memang sudah tidak ada di disk. */
      archivedTo: string | null;
    }
  | {
      ok: false;
      reason: string;
      /** state/.env sudah terhapus sebelum langkah yang gagal. */
      tokenRemoved: boolean;
      /** Folder sudah dipindah ke arsip, tetapi entri registry gagal dihapus. */
      archivedTo: string | null;
    };

export type ArchiveDeps = {
  dataDir: string;
  now?: () => Date;
  registryHooks?: WriteHooks;
  /**
   * Identitas entri registry yang dikonfirmasi pemilik. Kalau entri sekarang
   * berbeda (nama itu didaftarkan ulang), tidak ada yang diubah.
   */
  expect?: { telegramId: unknown; createdAt: unknown };
  /** Kait tes: dipanggil tepat sebelum rename folder. */
  beforeMove?: (from: string, to: string) => void;
};

const short = (err: unknown) => {
  const e = err as NodeJS.ErrnoException;
  return e?.code ?? (err instanceof Error ? err.message.split("\n")[0]!.slice(0, 200) : String(err));
};

/** Tujuan arsip yang belum dipakai; cap waktu yang sama diberi akhiran -2, -3, ... */
function freeTarget(dataDir: string, name: string, now: Date): string {
  const base = join(archiveDir(dataDir), `${name}-${archiveStamp(now)}`);
  if (!existsSync(base)) return base;
  for (let i = 2; ; i++) {
    const p = `${base}-${i}`;
    if (!existsSync(p)) return p;
  }
}

export type MarkResult = { ok: true } | { ok: false; reason: string };

/**
 * Langkah pertama /delete (tiket 261113190701, Q1): status 'stopped' dicatat
 * sebelum bot dihentikan, seperti /stop. Kalau master-bot mati di tengah
 * penghapusan, penyalaan otomatis tidak menghidupkan bot ini lagi. Hanya
 * entri yang dikonfirmasi pemilik (expect) yang diubah; kalau gagal, belum
 * ada apa pun yang disentuh.
 */
export function markStoppedForDelete(
  name: string,
  deps: Pick<ArchiveDeps, "dataDir" | "registryHooks" | "expect">,
): Promise<MarkResult> {
  return serialized(async () => {
    let reg;
    try {
      reg = readRegistry(deps.dataDir);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "registry.json tidak bisa dibaca" };
    }
    if (!Object.hasOwn(reg.bots, name)) return { ok: false, reason: "bot tidak terdaftar" };
    const rec = reg.bots[name]!;
    if (deps.expect && (rec.telegramId !== deps.expect.telegramId || rec.createdAt !== deps.expect.createdAt)) {
      return { ok: false, reason: "nama itu kini milik bot lain yang belum dikonfirmasi untuk dihapus" };
    }
    if (rec.status === "stopped") return { ok: true };
    try {
      reg.bots[name] = { ...rec, status: "stopped" };
      writeRegistry(deps.dataDir, reg, deps.registryHooks);
    } catch (err) {
      return { ok: false, reason: `registry.json gagal ditulis (${short(err)})` };
    }
    return { ok: true };
  });
}

/**
 * Mengarsipkan folder bot dan menghapusnya dari registry. Harus dipanggil
 * setelah bot benar-benar mati. Tidak pernah menghapus isi folder selain
 * state/.env.
 */
export function archiveBot(name: string, deps: ArchiveDeps): Promise<ArchiveResult> {
  return serialized(async () => {
    if (!NAME_RULE.test(name)) return { ok: false, reason: "nama bot tidak sesuai aturan", tokenRemoved: false, archivedTo: null };
    let reg;
    try {
      reg = readRegistry(deps.dataDir);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "registry.json tidak bisa dibaca", tokenRemoved: false, archivedTo: null };
    }
    if (!Object.hasOwn(reg.bots, name)) return { ok: false, reason: "bot tidak terdaftar", tokenRemoved: false, archivedTo: null };
    const rec = reg.bots[name]!;
    if (deps.expect && (rec.telegramId !== deps.expect.telegramId || rec.createdAt !== deps.expect.createdAt)) {
      return { ok: false, reason: "nama itu kini milik bot lain yang belum dikonfirmasi untuk dihapus", tokenRemoved: false, archivedTo: null };
    }

    const botDir = join(deps.dataDir, "bots", name);
    let archivedTo: string | null = null;
    let tokenRemoved = false;
    let present = false;
    try {
      present = lstatSync(botDir).isDirectory();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        return { ok: false, reason: `folder bot tidak bisa diperiksa (${short(err)})`, tokenRemoved, archivedTo };
      }
    }
    if (!present && existsSync(botDir)) {
      return { ok: false, reason: "bots/" + name + " bukan folder biasa", tokenRemoved, archivedTo };
    }

    if (present) {
      // Token tidak boleh ikut tersimpan di arsip: dihapus sebelum dipindah.
      try {
        rmSync(join(botDir, "state", ".env"), { force: true });
        tokenRemoved = true;
      } catch (err) {
        return { ok: false, reason: `token di state/.env gagal dihapus (${short(err)})`, tokenRemoved, archivedTo };
      }
      const target = freeTarget(deps.dataDir, name, deps.now?.() ?? new Date());
      try {
        mkdirSync(archiveDir(deps.dataDir), { recursive: true, mode: 0o700 });
        deps.beforeMove?.(botDir, target);
        // Satu langkah: rename di sistem berkas yang sama, tanpa salin-hapus.
        renameSync(botDir, target);
        archivedTo = target;
      } catch (err) {
        return { ok: false, reason: `folder gagal dipindah ke arsip (${short(err)})`, tokenRemoved, archivedTo };
      }
    }

    try {
      delete reg.bots[name];
      writeRegistry(deps.dataDir, reg, deps.registryHooks);
    } catch (err) {
      return { ok: false, reason: `entri registry gagal dihapus (${short(err)})`, tokenRemoved, archivedTo };
    }
    return { ok: true, archivedTo };
  });
}
