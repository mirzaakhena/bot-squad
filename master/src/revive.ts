import { conversationNote, runningReason, type Conversation, type ConversationMode, type LaunchDeps, type LaunchResult } from "./launch.ts";
import { busyText, type BotLocks } from "./busy.ts";
import { describeError, type Logger } from "./log.ts";
import { readRegistry, setBotStatus, type BotStatus, type WriteHooks } from "./registry.ts";
import { STATUS_NOT_RECORDED } from "./bot.ts";
import { sendWithRetry, type RetryPolicy } from "./retry.ts";

/**
 * Tiket 261112225304: saat master-bot menyala, bot yang seharusnya hidup
 * (status active atau registered, keputusan pemilik Q1) tetapi tidak berjalan
 * dinyalakan ulang lewat launchBot. Bot failed dan stopped dibiarkan; bot yang
 * sudah berjalan tidak disentuh (cek runningReason yang sama dengan launch.ts).
 * Hasilnya satu pesan ringkasan untuk pemilik (Q2).
 */

export type ReviveDeps = {
  dataDir: string;
  /** Menyalakan satu bot (asli: launchBot dengan realLaunchDeps). Tidak boleh dianggap tidak melempar. */
  launch: (name: string, mode: ConversationMode) => Promise<LaunchResult>;
  /** Cek "sudah berjalan" untuk bot yang tidak dinyalakan; sama dengan launch.ts. */
  probe: Pick<LaunchDeps, "tmux" | "isAlive">;
  /** BotLocks milik master-bot ini (objek yang sama dengan /stop dan /restart). */
  locks: BotLocks;
  log: Logger;
  registryHooks?: WriteHooks;
};

export type ReviveEntry = { name: string; username: string } & (
  | { kind: "revived"; statusRecorded: boolean; conversation?: Conversation }
  | { kind: "failed"; reason: string; sessionAlive: boolean; statusRecorded: boolean }
  | { kind: "left"; why: string; hint?: string }
);

export type ReviveOutcome =
  | { kind: "empty" }
  | { kind: "registry-error"; message: string }
  | { kind: "done"; entries: ReviveEntry[] };

const SHOULD_RUN: ReadonlySet<string> = new Set<BotStatus>(["active", "registered"]);

/** Mencocokkan registry dengan keadaan nyata dan menyalakan bot yang perlu. Tidak pernah melempar. */
export async function reviveBots(d: ReviveDeps): Promise<ReviveOutcome> {
  let bots;
  try {
    bots = readRegistry(d.dataDir).bots;
  } catch (err) {
    d.log(`penyalaan otomatis dibatalkan: ${describeError(err)}`);
    return { kind: "registry-error", message: err instanceof Error ? err.message : "registry.json tidak bisa dibaca" };
  }
  const names = Object.keys(bots).sort();
  if (names.length === 0) return { kind: "empty" };

  // Semua bot diproses bersamaan; satu bot yang gagal hanya masuk ringkasan.
  const entries = await Promise.all(
    names.map(async (name): Promise<ReviveEntry> => {
      const username = String(bots[name]?.username ?? "");
      try {
        return await reviveOne(name, username, String(bots[name]?.status), d);
      } catch (err) {
        d.log(`penyalaan otomatis '${name}' error: ${describeError(err)}`);
        return { name, username, kind: "failed", reason: "error di master-bot saat menyalakan", sessionAlive: false, statusRecorded: false };
      }
    }),
  );
  return { kind: "done", entries };
}

async function reviveOne(name: string, username: string, status: string, d: ReviveDeps): Promise<ReviveEntry> {
  const base = { name, username };
  if (!SHOULD_RUN.has(status)) {
    let running: string | null = null;
    try {
      running = await runningReason(name, { dataDir: d.dataDir, ...d.probe });
    } catch (err) {
      d.log(`penyalaan otomatis '${name}': tmux tidak bisa diperiksa: ${describeError(err)}`);
    }
    if (running) return { ...base, kind: "left", why: `sudah berjalan (${running}); status '${status}' tidak diubah` };
    if (status === "stopped") return { ...base, kind: "left", why: "dihentikan pemilik", hint: `Nyalakan dengan /restart ${name}` };
    if (status === "failed") return { ...base, kind: "left", why: "gagal dinyalakan sebelumnya (status failed)", hint: `Coba lagi dengan /restart ${name}` };
    return { ...base, kind: "left", why: `status '${status}' tidak dikenal`, hint: `Nyalakan dengan /restart ${name}` };
  }

  const release = d.locks.claim(name, "dinyalakan");
  if (!release) {
    const why = busyText(name, d.locks.busyWith(name) ?? "dinyalakan");
    d.log(`penyalaan otomatis '${name}' dilewati: ${why}`);
    return { ...base, kind: "left", why: `sedang diproses perintah lain (${d.locks.busyWith(name) ?? "dinyalakan"})` };
  }
  try {
    let res: LaunchResult;
    try {
      // Penyalaan otomatis melanjutkan percakapan terakhir (tiket 261115100301).
      res = await d.launch(name, "continue");
    } catch (err) {
      d.log(`penyalaan otomatis '${name}' error: ${describeError(err)}`);
      res = { kind: "failed", reason: "error di master-bot saat menyalakan", sessionAlive: false };
    }
    d.log(
      `penyalaan otomatis '${name}': ${res.kind}` +
        (res.kind === "active" ? (res.conversation ? ` (${conversationNote(res.conversation)})` : "") : ` (${res.reason})`),
    );
    if (res.kind === "already-running") return { ...base, kind: "left", why: `sudah berjalan (${res.reason})` };
    const statusRecorded = await record(name, res.kind === "active" ? "active" : "failed", d);
    if (res.kind === "active") {
      return { ...base, kind: "revived", statusRecorded, ...(res.conversation ? { conversation: res.conversation } : {}) };
    }
    return { ...base, kind: "failed", reason: res.reason, sessionAlive: res.sessionAlive, statusRecorded };
  } finally {
    release();
  }
}

async function record(name: string, status: BotStatus, d: ReviveDeps): Promise<boolean> {
  try {
    const ok = await setBotStatus(d.dataDir, name, status, d.registryHooks);
    if (!ok) d.log(`status '${name}' gagal dicatat: tidak ada di registry`);
    return ok;
  } catch (err) {
    d.log(`status '${name}' gagal dicatat: ${describeError(err)}`);
    return false;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const who = (e: ReviveEntry) => (e.username ? `@${esc(e.username)} ('${e.name}')` : `'${e.name}'`);

/** Pesan ringkasan (HTML), atau null kalau tidak ada yang perlu dikirim (registry kosong). */
export function reviveReport(o: ReviveOutcome): string | null {
  if (o.kind === "empty") return null;
  if (o.kind === "registry-error") {
    return `master-bot menyala, tetapi tidak ada bot yang dinyalakan otomatis: ${esc(o.message)}. Lihat log master-bot.`;
  }
  const revived = o.entries.filter((e) => e.kind === "revived");
  const failed = o.entries.filter((e) => e.kind === "failed");
  const left = o.entries.filter((e) => e.kind === "left");
  const parts = [`master-bot menyala. Keadaan ${o.entries.length} bot terdaftar:`];
  if (revived.length > 0) {
    parts.push(
      [
        "Dinyalakan ulang:",
        ...revived.map(
          (e) =>
            `- ${who(e)}${e.conversation ? `: ${lowerFirst(esc(conversationNote(e.conversation)).replace(/\.$/, ""))}` : ""}` +
            (e.statusRecorded ? "" : `. ${STATUS_NOT_RECORDED}`),
        ),
      ].join("\n"),
    );
  }
  if (failed.length > 0) {
    parts.push(
      [
        "Gagal dinyalakan ulang:",
        ...failed.map((e) => {
          const line = [`- ${who(e)}: ${esc(e.reason)}.`];
          if (e.sessionAlive) line.push(`Lihat di server: <code>tmux attach -t ${e.name}</code>.`);
          line.push(e.statusRecorded ? `Status tercatat 'failed'.` : STATUS_NOT_RECORDED);
          line.push(`Coba lagi dengan /restart ${e.name}`);
          return line.join(" ");
        }),
      ].join("\n"),
    );
  }
  if (left.length > 0) {
    parts.push(["Dibiarkan:", ...left.map((e) => `- ${who(e)}: ${esc(e.why)}${e.hint ? `. ${e.hint}` : ""}`)].join("\n"));
  }
  return parts.join("\n\n");
}

/** Menyalakan bot yang seharusnya hidup, lalu mengirim satu ringkasan. Tidak pernah melempar. */
export async function reviveAndReport(
  d: ReviveDeps & {
    send: (text: string, signal?: AbortSignal) => Promise<unknown>;
    signal?: AbortSignal;
    retry?: RetryPolicy;
  },
): Promise<void> {
  try {
    const outcome = await reviveBots(d);
    const text = reviveReport(outcome);
    if (text === null) return;
    const out = await sendWithRetry((signal) => d.send(text, signal), d.signal, d.retry, ({ attempt, waitMs, reason }) =>
      d.log(`ringkasan penyalaan otomatis gagal dikirim (percobaan ${attempt}): ${reason}; dicoba lagi dalam ${Math.round(waitMs / 1000)} detik`),
    );
    if (!out.ok) d.log(`ringkasan penyalaan otomatis tidak terkirim: ${out.reason}`);
    else if (out.attempts > 1) d.log(`ringkasan penyalaan otomatis terkirim pada percobaan ${out.attempts}`);
  } catch (err) {
    d.log(`penyalaan otomatis error: ${describeError(err)}`);
  }
}
