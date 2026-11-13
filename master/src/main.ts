import { GrammyError, type ApiClientOptions } from "grammy";
import { createMasterBot } from "./bot.ts";
import { ConfigError, dataDir, loadConfig, type ConfigSource } from "./config.ts";
import { createLogger, describeError, redact } from "./log.ts";
import { launchBot, realLaunchDeps } from "./launch.ts";
import { realStopDeps, stopBot } from "./stop.ts";
import { createBotLocks } from "./busy.ts";
import { syncCommandMenu } from "./menu.ts";
import { acquireMasterLock, type LockDeps } from "./lock.ts";
import { resolveApiRoot } from "./api-root.ts";
import { reviveAndReport } from "./revive.ts";
import { installTelegramCutoff, STOP_GRACE_MS } from "./cutoff.ts";

export type RunOptions = ConfigSource & {
  /** Penulis log; default stderr. */
  write?: (line: string) => void;
  client?: ApiClientOptions;
  /** Menghentikan polling dengan rapi saat dibatalkan. */
  signal?: AbortSignal;
  /** Pengganti cek pid untuk kunci instance tunggal (tes). */
  lock?: LockDeps;
};

/** Token yang sudah dibaca, untuk menyensor error yang lolos dari run(). */
const knownSecrets: string[] = [];

/** Menjalankan master-bot sampai berhenti. Mengembalikan kode keluar proses. */
export async function run(opts: RunOptions = {}): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stderr.write(line + "\n"));

  let config;
  try {
    config = loadConfig(opts);
  } catch (err) {
    if (err instanceof ConfigError) {
      write(`master-bot: ${err.message}`);
      return 1;
    }
    throw err;
  }

  knownSecrets.push(config.token);
  const log = createLogger([config.token], write);
  const dir = dataDir(opts);

  // Kunci diambil sebelum panggilan Telegram apa pun: getUpdates dari
  // instance kedua akan mengusir instance pertama, bukan sebaliknya.
  const lock = acquireMasterLock(dir, opts.lock);
  if (lock.kind === "held") {
    write(
      `master-bot: master-bot sudah berjalan di mesin ini (pid ${lock.pid}, kunci ${lock.path}).\n` +
        `Instance ini dibatalkan tanpa menghubungi Telegram; master-bot yang sedang berjalan tidak terganggu.\n` +
        `Untuk menjalankan ulang, hentikan dulu proses ${lock.pid}.`,
    );
    return 1;
  }
  releaseLock = lock.release;
  try {
    return await serve(opts, config, dir, log, write);
  } finally {
    releaseLock = undefined;
    lock.release();
  }
}

/** Pelepas kunci yang sedang dipegang, untuk jalur keluar darurat. */
let releaseLock: (() => void) | undefined;

async function serve(
  opts: RunOptions,
  config: ReturnType<typeof loadConfig>,
  dir: string,
  log: ReturnType<typeof createLogger>,
  write: (line: string) => void,
): Promise<number> {
  const launchDeps = realLaunchDeps(dir, config.ownerId, log, opts.signal);
  const stopDeps = realStopDeps(dir, log);
  // Penyalaan, /stop dan /restart yang masih berjalan; ditunggu sebentar
  // saat berhenti supaya status dan log-nya tertulis (tiket 261112223102).
  const launches = new Set<Promise<void>>();
  const track = (done: Promise<void>) => {
    launches.add(done);
    void done.finally(() => launches.delete(done));
  };
  // Satu kunci per bot untuk /register, /stop, /restart, dan penyalaan otomatis.
  const locks = createBotLocks();
  const probe = { tmux: launchDeps.tmux, isAlive: launchDeps.isAlive };
  const bot = createMasterBot({
    token: config.token,
    ownerId: config.ownerId,
    log,
    client: opts.client,
    dataDir: dir,
    signal: opts.signal,
    launch: (name) => launchBot(name, launchDeps),
    stop: (name) => stopBot(name, stopDeps),
    locks,
    probe,
    onLaunch: track,
  });

  const explain = (err: unknown): string => {
    if (err instanceof GrammyError && err.error_code === 401) {
      return (
        `Telegram menolak token master-bot (401 Unauthorized).\n` +
        `Periksa MASTER_BOT_TOKEN di ${config.envPath}, atau minta token baru di @BotFather.`
      );
    }
    if (err instanceof GrammyError && err.error_code === 409) {
      return (
        `proses ini digantikan oleh master-bot lain yang memakai token yang sama (409 Conflict). ` +
        `Telegram hanya mengizinkan satu penerima pesan per token dan memilih yang paling baru, ` +
        `jadi master-bot yang lain itulah yang sekarang menerima pesan, bukan proses ini.\n` +
        `Kemungkinan master-bot itu berjalan di mesin lain atau dengan folder data (BOT_SQUAD_HOME) lain. ` +
        `Hentikan yang tidak dipakai; kalau yang ini yang mau dipakai, jalankan lagi setelah yang lain berhenti.`
      );
    }
    return `master-bot berhenti karena error: ${describeError(err)}`;
  };

  if (opts.signal?.aborted) return 0;
  // Setiap panggilan Telegram bisa diputus saat berhenti (tiket 261112235501):
  // tanpa ini, bot.init mencoba ulang tanpa henti dan getUpdates terakhir di
  // bot.stop() bisa menggantung sampai batas client grammY (500 detik).
  const cutoff = installTelegramCutoff(bot.api);
  /** Polling sudah dimulai (onStart); sebelum itu Telegram belum terjangkau penuh. */
  let polling = false;
  let phase = "getMe";
  // bot.stop() memanggil getUpdates sekali lagi; kegagalannya harus ditangkap
  // di sini, karena error jaringan grammY memuat URL yang berisi token.
  let stopping: Promise<void> | undefined;
  let onAbort: () => void = () => {};
  const aborted = new Promise<void>((r) => (onAbort = r));
  /** Panggilan yang masih menunggu saat berhenti diminta, sebelum diputus. */
  let waitingAtStop: { method: string; since: number; at: number } | undefined;
  const stop = () => {
    const w = cutoff.oldestPending();
    if (w) waitingAtStop = { ...w, at: Date.now() };
    // Sebelum polling: tidak ada yang perlu dikonfirmasi ke Telegram, putus
    // sekarang. Sesudahnya: getUpdates konfirmasi diberi waktu singkat.
    if (polling) cutoff.cutAfter(STOP_GRACE_MS);
    else cutoff.cut();
    stopping = bot.stop().catch((err) => log(`peringatan saat berhenti: ${describeError(err)}`));
    onAbort();
  };
  opts.signal?.addEventListener("abort", stop, { once: true });

  /** Pesan saat berhenti sebelum polling berjalan: Telegram belum terjangkau. */
  const notReached = () => {
    const parts = [`master-bot: dihentikan sebelum Telegram terjangkau (tahap: ${phase}); belum ada pesan yang dilayani.`];
    const waiting = waitingAtStop;
    if (waiting) {
      parts.push(`Panggilan ${waiting.method} belum dijawab Telegram setelah ${Math.round((waiting.at - waiting.since) / 1000)} detik.`);
    }
    const last = cutoff.lastFailure();
    if (last) parts.push(`Kegagalan terakhir: ${last}`);
    parts.push("Periksa koneksi server ke api.telegram.org.");
    write(redact(parts.join("\n"), [config.token]));
    return 0;
  };

  let started: Promise<void> | undefined;
  try {
    await bot.init(opts.signal);
    phase = "menu perintah";
    await syncCommandMenu(bot.api, config.ownerId, log, opts.signal);
    if (opts.signal?.aborted) return notReached();
    phase = "mulai polling";
    // Penyalaan otomatis (tiket 261112225304) berjalan di latar belakang,
    // supaya master-bot langsung melayani perintah.
    track(
      reviveAndReport({
        dataDir: dir,
        launch: (name) => launchBot(name, launchDeps),
        probe,
        locks,
        log,
        send: (text, signal) => bot.api.sendMessage(config.ownerId, text, { parse_mode: "HTML" }, signal),
        signal: opts.signal,
      }),
    );
    started = bot.start({
      onStart: (me) => {
        polling = true;
        log(`berjalan sebagai @${me.username}, hanya melayani pemilik ${config.ownerId}`);
      },
    });
    await Promise.race([started, aborted]);
    if (opts.signal?.aborted) {
      // Kegagalan bot.start setelah berhenti diminta bukan error (mis.
      // deleteWebhook yang diputus); ditelan supaya tidak jadi unhandled.
      started.catch(() => {});
      if (!polling) {
        await Promise.all([within(Promise.allSettled([started, stopping]), STOP_GRACE_MS), settleLaunches(launches, log)]);
        return notReached();
      }
      // Polling dan getUpdates terakhir diberi batas yang sama dengan
      // pemutus; penyalaan ditunggu bersamaan, jadi total tetap < 5 detik.
      await Promise.all([
        within(Promise.allSettled([started, stopping]), STOP_GRACE_MS + 500),
        settleLaunches(launches, log),
      ]);
    } else {
      await started;
      await stopping;
      await settleLaunches(launches, log);
    }
    log("berhenti");
    return 0;
  } catch (err) {
    if (opts.signal?.aborted && !polling) {
      started?.catch(() => {});
      await settleLaunches(launches, log);
      return notReached();
    }
    write(redact(`master-bot: ${explain(err)}`, [config.token]));
    return 1;
  } finally {
    opts.signal?.removeEventListener("abort", stop);
  }
}

/** Menunggu `p` paling lama `ms`; yang belum selesai ditinggal. */
async function within(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([p, new Promise((r) => (timer = setTimeout(r, ms)))]);
  clearTimeout(timer);
}

/**
 * Batas tunggu penyalaan yang sedang berjalan setelah berhenti. Penyalaan
 * melihat signal yang sama, jadi biasanya selesai dalam hitungan milidetik;
 * batas ini menjaga master-bot keluar dalam 5 detik (keputusan pemilik, Q3).
 */
export const LAUNCH_SETTLE_MS = 3_000;

async function settleLaunches(launches: Set<Promise<void>>, log: (m: string) => void): Promise<void> {
  if (launches.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    Promise.allSettled([...launches]).then(() => false),
    new Promise<boolean>((r) => (timer = setTimeout(() => r(true), LAUNCH_SETTLE_MS))),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    log(`${launches.size} penyalaan bot belum selesai ${LAUNCH_SETTLE_MS / 1000} detik setelah berhenti; master-bot tetap keluar`);
  }
}

if (import.meta.main) {
  const fatal = (err: unknown) => {
    try {
      releaseLock?.();
    } catch {}
    process.stderr.write(redact(`master-bot: error tak terduga: ${describeError(err)}`, knownSecrets) + "\n");
    process.exit(1);
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  process.once("SIGTERM", () => ac.abort());
  // MASTER_BOT_API_ROOT hanya untuk tes dengan Telegram tiruan, dan hanya
  // boleh menunjuk ke mesin lokal; dicek sebelum token dibaca.
  const apiRoot = resolveApiRoot(process.env);
  if (apiRoot.kind === "rejected") {
    process.stderr.write(`master-bot: ${apiRoot.message}\n`);
    process.exit(1);
  }
  if (apiRoot.kind === "local") process.stderr.write(`master-bot: ${apiRoot.warning}\n`);
  process.exit(await run({ signal: ac.signal, client: apiRoot.kind === "local" ? { apiRoot: apiRoot.apiRoot } : undefined }));
}
