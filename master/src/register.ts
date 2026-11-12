import { chmodSync, closeSync, existsSync, mkdirSync, openSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";
import { readRegistry, RegistryError, serialized, writeRegistry, type WriteHooks } from "./registry.ts";

/** Aturan nama yang diputuskan pemilik: 1-32 karakter, tidak diawali '-'. */
export const NAME_RULE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const RESERVED_NAMES: readonly string[] = ["master"];
/** Bentuk token bot Telegram. Token lain ditolak tanpa menghubungi Telegram. */
export const TOKEN_SHAPE = /^[0-9]{1,20}:[A-Za-z0-9_-]{20,100}$/;
export const GETME_TIMEOUT_MS = 10_000;

export const USAGE =
  "Pemakaian: /register <nama> <token>\n" +
  "Contoh: /register bot-01 123456789:AA...\n" +
  "Nama: huruf kecil, angka, dan '-', 1-32 karakter, tidak diawali '-'.";

export type ParsedArgs = { ok: true; name: string; token: string } | { ok: false };

/** Memecah argumen /register. Harus tepat dua: nama dan token. */
export function parseRegisterArgs(match: string): ParsedArgs {
  const parts = match.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return { ok: false };
  return { ok: true, name: parts[0]!, token: parts[1]! };
}

/** Alasan nama ditolak, atau null kalau nama sah. Alasan tidak pernah memuat nama itu sendiri. */
export function nameProblem(name: string): string | null {
  if (!NAME_RULE.test(name)) {
    return "Nama tidak sesuai aturan: hanya huruf kecil, angka, dan '-', 1-32 karakter, tidak diawali '-'.";
  }
  if (RESERVED_NAMES.includes(name)) return `Nama '${name}' dicadangkan, pakai nama lain.`;
  return null;
}

export type GetMeResult =
  | { kind: "ok"; id: number; username: string }
  | { kind: "invalid" }
  | { kind: "unreachable" };

/**
 * Memanggil getMe dengan token bot baru. Tidak pernah polling. Hasilnya hanya
 * jenis kegagalan, tanpa pesan error, karena error jaringan bisa memuat URL
 * yang berisi token.
 */
export async function checkToken(
  token: string,
  apiRoot = "https://api.telegram.org",
  timeoutMs = GETME_TIMEOUT_MS,
): Promise<GetMeResult> {
  let res: Response;
  try {
    res = await fetch(`${apiRoot}/bot${token}/getMe`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { kind: "unreachable" };
  }
  if (res.status === 401 || res.status === 404) return { kind: "invalid" };
  if (!res.ok) return { kind: "unreachable" };
  try {
    const body = (await res.json()) as { ok?: boolean; result?: { id?: unknown; username?: unknown; is_bot?: unknown } };
    const r = body.result;
    if (body.ok && r && typeof r.id === "number" && typeof r.username === "string" && r.is_bot === true) {
      return { kind: "ok", id: r.id, username: r.username };
    }
  } catch {
    // jatuh ke unreachable
  }
  return { kind: "unreachable" };
}

export type RegisterDeps = {
  dataDir: string;
  ownerId: number;
  masterToken: string;
  masterBotId: number;
  apiRoot?: string;
  getMeTimeoutMs?: number;
  /** Kait untuk tes penulisan registry. */
  registryHooks?: WriteHooks;
};

export type RegisterResult = { ok: true; username: string } | { ok: false; reason: string };

const UNREACHABLE = "Tidak bisa menghubungi Telegram untuk memeriksa token. Coba lagi sebentar lagi.";
const INVALID_TOKEN = "Token tidak valid: Telegram menolaknya. Periksa token dari @BotFather.";

/**
 * Memvalidasi lalu mendaftarkan satu bot: membuat folder state dan workspace,
 * .env (0600), access.json berisi pemilik saja, dan catatan di registry.json.
 * Semua penolakan terjadi sebelum ada yang ditulis; kegagalan saat menulis
 * menghapus kembali folder yang baru dibuat. Alasan penolakan tidak pernah
 * memuat token.
 */
export function registerBot(name: string, token: string, deps: RegisterDeps): Promise<RegisterResult> {
  return serialized(async () => {
    const problem = nameProblem(name);
    if (problem) return { ok: false, reason: problem };

    let registry;
    try {
      registry = readRegistry(deps.dataDir);
    } catch (err) {
      if (err instanceof RegistryError) {
        return { ok: false, reason: `Registrasi dibatalkan: ${err.message}. Perbaiki file itu dulu.` };
      }
      throw err;
    }
    if (Object.hasOwn(registry.bots, name)) {
      return { ok: false, reason: `Nama '${name}' sudah terdaftar.` };
    }
    const botDir = join(deps.dataDir, "bots", name);
    if (existsSync(botDir)) {
      return {
        ok: false,
        reason: `Folder untuk '${name}' sudah ada di disk tetapi tidak terdaftar. Tidak ada yang diubah; hapus folder itu sendiri kalau memang tidak dipakai.`,
      };
    }

    if (!TOKEN_SHAPE.test(token)) {
      return { ok: false, reason: "Token tidak valid: bentuknya bukan token bot dari @BotFather (<angka>:<kode>)." };
    }
    if (token === deps.masterToken) {
      return { ok: false, reason: "Token itu milik master-bot sendiri, tidak bisa didaftarkan sebagai bot." };
    }

    const me = await checkToken(token, deps.apiRoot, deps.getMeTimeoutMs);
    if (me.kind === "invalid") return { ok: false, reason: INVALID_TOKEN };
    if (me.kind === "unreachable") return { ok: false, reason: UNREACHABLE };
    if (me.id === deps.masterBotId) {
      return { ok: false, reason: "Token itu milik master-bot sendiri, tidak bisa didaftarkan sebagai bot." };
    }
    const taken = Object.entries(registry.bots).find(([, b]) => b.telegramId === me.id);
    if (taken) {
      return { ok: false, reason: `Token itu milik @${me.username}, yang sudah terdaftar sebagai '${taken[0]}'.` };
    }

    const bots = join(deps.dataDir, "bots");
    mkdirSync(bots, { recursive: true, mode: 0o700 });
    // mkdir tanpa recursive gagal kalau folder sudah ada: tidak pernah menimpa data lain.
    mkdirSync(botDir, { mode: 0o700 });
    try {
      chmodSync(botDir, 0o700);
      const state = join(botDir, "state");
      const workspace = join(botDir, "workspace");
      mkdirSync(state, { mode: 0o700 });
      chmodSync(state, 0o700);
      mkdirSync(workspace, { mode: 0o700 });
      chmodSync(workspace, 0o700);
      writeNewFile(join(state, ".env"), `TELEGRAM_BOT_TOKEN=${token}\n`);
      writeNewFile(
        join(state, "access.json"),
        JSON.stringify({ dmPolicy: "allowlist", allowFrom: [String(deps.ownerId)], groups: {}, pending: {} }, null, 2) + "\n",
      );
      registry.bots[name] = {
        telegramId: me.id,
        username: me.username,
        status: "registered",
        createdAt: new Date().toISOString(),
      };
      writeRegistry(deps.dataDir, registry, deps.registryHooks);
    } catch (err) {
      rmSync(botDir, { recursive: true, force: true });
      throw err;
    }
    return { ok: true, username: me.username };
  });
}

/** Membuat file baru dengan mode 0600; gagal kalau file sudah ada. */
function writeNewFile(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);
}
