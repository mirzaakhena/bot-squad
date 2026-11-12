import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type MasterConfig = {
  token: string;
  ownerId: number;
  /** Lokasi file .env master-bot, dipakai di pesan error. */
  envPath: string;
};

export class ConfigError extends Error {}

export type ConfigSource = {
  env?: Record<string, string | undefined>;
  home?: string;
};

/** Folder data bot-squad: $BOT_SQUAD_HOME, default ~/.bot-squad. */
export function dataDir(src: ConfigSource = {}): string {
  const env = src.env ?? process.env;
  const fromEnv = env.BOT_SQUAD_HOME?.trim();
  return fromEnv ? fromEnv : join(src.home ?? homedir(), ".bot-squad");
}

export function masterEnvPath(src: ConfigSource = {}): string {
  return join(dataDir(src), "master", ".env");
}

/** Parser .env sederhana: KEY=VALUE per baris, komentar '#', kutip opsional. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]!] = value;
  }
  return out;
}

const HOW_TO_FILL =
  "  MASTER_BOT_TOKEN=<token master-bot dari @BotFather>\n" +
  "  OWNER_TELEGRAM_ID=<ID Telegram pemilik, angka>";

/**
 * Membaca konfigurasi master-bot dari <folder data>/master/.env.
 * Melempar ConfigError dengan pesan yang menyebut apa yang kurang dan di mana
 * harus mengisinya. Pesan tidak pernah memuat nilai token.
 */
export function loadConfig(src: ConfigSource = {}): MasterConfig {
  const envPath = masterEnvPath(src);
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new ConfigError(
        `File konfigurasi master-bot tidak ditemukan: ${envPath}\n` +
          `Buat file itu (chmod 600) dengan isi:\n${HOW_TO_FILL}`,
      );
    }
    throw new ConfigError(
      `File konfigurasi master-bot tidak bisa dibaca: ${envPath} (${code ?? "error"})`,
    );
  }

  const vars = parseEnv(text);
  const token = vars.MASTER_BOT_TOKEN ?? "";
  const ownerRaw = vars.OWNER_TELEGRAM_ID ?? "";

  const problems: string[] = [];
  if (!token) {
    problems.push("MASTER_BOT_TOKEN belum diisi (token master-bot dari @BotFather)");
  }
  if (!ownerRaw) {
    problems.push("OWNER_TELEGRAM_ID belum diisi (ID Telegram pemilik, angka)");
  } else if (!/^[1-9][0-9]*$/.test(ownerRaw) || !Number.isSafeInteger(Number(ownerRaw))) {
    problems.push("OWNER_TELEGRAM_ID harus berupa angka ID user Telegram (contoh: 123456789)");
  }
  if (problems.length > 0) {
    throw new ConfigError(
      `Konfigurasi master-bot belum lengkap di ${envPath}:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\nIsi file itu dengan:\n${HOW_TO_FILL}`,
    );
  }

  return { token, ownerId: Number(ownerRaw), envPath };
}
