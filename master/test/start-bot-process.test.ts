import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RESUME_THRESHOLD_ENV } from "../src/launch.ts";

/**
 * Tiket 261115105101: scripts/start-bot.sh sungguhan membuka sesi tmux yang
 * environment-nya memuat kedua ambang dialog resume. HOME dan BOT_SQUAD_HOME
 * sementara (tanpa symlink), server tmux terpisah (TMUX_TMPDIR, -S), claude
 * tiruan di depan PATH, token palsu, tanpa Telegram.
 */

const SCRIPT = join(import.meta.dir, "..", "..", "scripts", "start-bot.sh");
const TMUX = Bun.which("tmux");
const BUN = process.execPath;
const NAME = "sbp-01";

let home: string;
let bin: string;
let tmuxDir: string;

const socket = () => join(tmuxDir, `tmux-${process.getuid!()}`, "default");
const path = () => [bin, dirname(TMUX!), "/usr/bin", "/bin"].join(":");
const tmux = (...args: string[]) =>
  Bun.spawnSync([TMUX!, "-S", socket(), ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: path() } });

function symlinks(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out.push(p);
    else if (st.isDirectory()) out.push(...symlinks(p));
  }
  return out;
}

function script(name: string, body: string) {
  const p = join(bin, name);
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bsq-startbot-"));
  bin = join(home, "bin");
  tmuxDir = join(home, "tmux");
  mkdirSync(bin);
  mkdirSync(join(tmuxDir, `tmux-${process.getuid!()}`), { recursive: true, mode: 0o700 });
  mkdirSync(join(home, "master"));
  writeFileSync(join(home, "master", ".env"), "OWNER_TELEGRAM_ID=111222333\n", { mode: 0o600 });
  const state = join(home, "bots", NAME, "state");
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(join(state, ".env"), "TELEGRAM_BOT_TOKEN=5001:AAFakeBotTokenForStartBotProcess_aaaaaa\n", { mode: 0o600 });
  // bun: pemasangan paket plugin dilewati, selain itu bun asli (start-cli.ts).
  script("bun", `[ "$1" = "install" ] && exit 0\nexec '${BUN}' "$@"`);
  // claude tiruan: mencatat environment-nya, lalu langsung siap.
  script(
    "claude",
    [
      `env > "$TELEGRAM_STATE_DIR/env.dump"`,
      `echo "bypass permissions on"`,
      `echo $$ > "$TELEGRAM_STATE_DIR/bot.pid"`,
      `while :; do sleep 1; done`,
    ].join("\n"),
  );
});

afterEach(() => {
  if (TMUX) tmux("kill-server");
  rmSync(home, { recursive: true, force: true });
});

describe.skipIf(!TMUX)("scripts/start-bot.sh (proses sungguhan)", () => {
  test("sesi bot membawa kedua ambang dialog resume; lingkungan pemanggil tidak dipakai", async () => {
    expect(symlinks(home)).toEqual([]);
    const proc = Bun.spawn(["bash", SCRIPT, NAME], {
      env: {
        PATH: path(),
        HOME: home,
        BOT_SQUAD_HOME: home,
        TMUX_TMPDIR: tmuxDir,
        READY_TIMEOUT: "20",
        // Nilai kecil di lingkungan pemanggil tidak boleh sampai ke sesi bot.
        CLAUDE_CODE_RESUME_THRESHOLD_MINUTES: "1",
        CLAUDE_CODE_RESUME_TOKEN_THRESHOLD: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    expect(`${code} ${out}${err}`).toContain(`0 start-bot: '${NAME}' siap`);
    expect(tmux("has-session", "-t", `=${NAME}`).exitCode).toBe(0);
    const state = join(home, "bots", NAME, "state");
    const env = Object.fromEntries(
      readFileSync(join(state, "env.dump"), "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    expect(env.TELEGRAM_STATE_DIR).toBe(state);
    for (const [k, v] of Object.entries(RESUME_THRESHOLD_ENV)) expect(env[k]).toBe(v);
    // Konfigurasi Claude: hanya trust folder bots, tanpa resumeReturnDismissed.
    expect(Object.keys(JSON.parse(readFileSync(join(home, ".claude.json"), "utf8")))).toEqual(["projects"]);
  }, 60_000);
});
