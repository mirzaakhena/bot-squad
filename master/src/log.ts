export type Logger = (message: string) => void;

const REDACTED = "<token disembunyikan>";
/** Bentuk umum token bot Telegram: <angka>:<35 karakter>. */
const TOKEN_SHAPE = /\b\d{5,}:[A-Za-z0-9_-]{30,}\b/g;

/** Menghapus token dari teks: token yang diketahui dan apa pun yang berbentuk token. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s) out = out.split(s).join(REDACTED);
  }
  return out.replace(TOKEN_SHAPE, REDACTED);
}

/** Logger yang selalu menyensor token sebelum menulis. */
export function createLogger(
  secrets: readonly string[],
  write: (line: string) => void = (line) => process.stderr.write(line + "\n"),
): Logger {
  return (message) => write(redact(`master-bot: ${message}`, secrets));
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
