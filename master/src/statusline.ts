import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRIDGE_FILE, CHAIN_FILE, INSTALL_FILE, STATUS_FILE, type InstallRecord } from "../../plugin/context.ts";

/**
 * Memasang statusline bridge plugin untuk satu sesi bot (tiket 261112230304),
 * dengan pagar dari mirza-bots (README "/context dan pagar statusline",
 * cc-plugin/src/engine/context/chain.ts dan install.ts):
 *
 * 1. Pendahulu dicari mengikuti presedens Claude Code: settings.local.json
 *    workspace, lalu settings.json workspace, lalu settings user.
 * 2. Rantai ditulis lalu dibaca ulang; tidak cocok berarti batal.
 * 3. Kalau tidak bisa dipastikan apa yang terpasang (berkas tak terbaca, JSON
 *    rusak, atau yang efektif ternyata bridge kita sendiri), bridge TIDAK
 *    dipasang, dan /context melapor alasannya.
 *
 * Bedanya dengan mirza-bots: tidak ada berkas pengaturan Claude yang ditulis.
 * Bridge dipasang lewat `--settings` sesi itu saja (claudeArgv); yang ditulis
 * hanya berkas di folder state bot.
 */

export type StatuslineSetup =
  | { kind: "installed"; command: string; chained: string | null }
  | { kind: "refused" | "rolled-back"; reason: string };

export type StatuslineOptions = {
  workspace: string;
  stateDir: string;
  pluginDir: string;
  /** ~/.claude/settings.json (atau $CLAUDE_CONFIG_DIR/settings.json). Hanya dibaca. */
  userSettings: string;
  now: () => number;
  /** Disuntik tes untuk memaksa penulisan gagal. */
  writeFile?: (path: string, data: string) => void;
};

/** Kutip tunggal untuk shell POSIX. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function bridgeCommand(pluginDir: string, stateDir: string): string {
  return `bun ${shQuote(join(pluginDir, BRIDGE_FILE))} ${shQuote(stateDir)}`;
}

/** Bridge bot-squad versi apa pun, dari folder plugin mana pun. */
export function isOurBridge(command: string): boolean {
  return command.replace(/\\/g, "/").includes(`/${BRIDGE_FILE}`);
}

type Layer = { ok: true; statusLine: unknown } | { ok: false; reason: string };

/** Berkas yang belum ada itu sah (tidak ada pendahulu); yang ada tetapi tak terbaca berarti tidak tahu. */
export function readLayer(path: string): Layer {
  if (!existsSync(path)) return { ok: true, statusLine: undefined };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: `${path} bukan objek JSON -- tidak memasang apa pun` };
    }
    return { ok: true, statusLine: (parsed as Record<string, unknown>).statusLine };
  } catch {
    return { ok: false, reason: `${path} tidak bisa dibaca -- tidak memasang apa pun` };
  }
}

function commandOf(statusLine: unknown): string | null {
  if (typeof statusLine !== "object" || statusLine === null || Array.isArray(statusLine)) return null;
  const c = (statusLine as { command?: unknown }).command;
  if (typeof c !== "string" || c.trim() === "") return null;
  return c;
}

export type ChainResult = { kind: "none" } | { kind: "found"; command: string } | { kind: "ours"; command: string };

/** `statusLines` urut dari presedens tertinggi. Murni. */
export function resolveChain(statusLines: unknown[]): ChainResult {
  for (const s of statusLines) {
    const c = commandOf(s);
    if (c === null) continue;
    return isOurBridge(c) ? { kind: "ours", command: c } : { kind: "found", command: c };
  }
  return { kind: "none" };
}

export function settingsLayers(workspace: string, userSettings: string): string[] {
  return [join(workspace, ".claude", "settings.local.json"), join(workspace, ".claude", "settings.json"), userSettings];
}

/** Tidak pernah melempar. Hasilnya juga dicatat di <state>/statusline.json untuk /context. */
export function prepareStatusline(o: StatuslineOptions): StatuslineSetup {
  const write = o.writeFile ?? ((p: string, d: string) => writeFileSync(p, d, { mode: 0o600 }));
  const chainPath = join(o.stateDir, CHAIN_FILE);
  // Tangkapan sesi sebelumnya bukan milik sesi baru: /context harus bilang
  // "belum ada data", bukan menampilkan angka sesi lama.
  try {
    rmSync(join(o.stateDir, STATUS_FILE), { force: true });
  } catch {}

  const result = decide(o, chainPath, write);
  const record: InstallRecord =
    result.kind === "installed"
      ? { kind: "installed", chained: result.chained, at_ms: o.now() }
      : { kind: result.kind, reason: result.reason, at_ms: o.now() };
  try {
    writeFileSync(join(o.stateDir, INSTALL_FILE), JSON.stringify(record) + "\n", { mode: 0o600 });
  } catch {}
  return result;
}

function decide(o: StatuslineOptions, chainPath: string, write: (p: string, d: string) => void): StatuslineSetup {
  const lines: unknown[] = [];
  for (const path of settingsLayers(o.workspace, o.userSettings)) {
    const layer = readLayer(path);
    if (!layer.ok) return { kind: "refused", reason: layer.reason };
    lines.push(layer.statusLine);
  }
  const chain = resolveChain(lines);
  if (chain.kind === "ours") {
    return {
      kind: "refused",
      reason: `statusline yang terpasang sudah bridge bot-squad (${chain.command}), jadi pendahulunya tidak diketahui -- tidak memasang apa pun`,
    };
  }
  const chained = chain.kind === "found" ? chain.command : null;
  try {
    write(chainPath, chained ?? "");
    const written = readFileSync(chainPath, "utf8");
    if (written !== (chained ?? "")) throw new Error(`rantai tersimpan "${written}", seharusnya "${chained ?? ""}"`);
  } catch (err) {
    try {
      rmSync(chainPath, { force: true });
    } catch {}
    return { kind: "rolled-back", reason: `gagal menyimpan rantai statusline: ${(err as Error).message}` };
  }
  return { kind: "installed", command: bridgeCommand(o.pluginDir, o.stateDir), chained };
}
