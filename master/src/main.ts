import { GrammyError, type ApiClientOptions } from "grammy";
import { createMasterBot } from "./bot.ts";
import { ConfigError, dataDir, loadConfig, type ConfigSource } from "./config.ts";
import { createLogger, describeError, redact } from "./log.ts";
import { launchBot, realLaunchDeps } from "./launch.ts";
import { syncCommandMenu } from "./menu.ts";
import { acquireMasterLock, type LockDeps } from "./lock.ts";
import { resolveApiRoot } from "./api-root.ts";

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
  const launchDeps = realLaunchDeps(dir, config.ownerId, log);
  const bot = createMasterBot({
    token: config.token,
    ownerId: config.ownerId,
    log,
    client: opts.client,
    dataDir: dir,
    signal: opts.signal,
    launch: (name) => launchBot(name, launchDeps),
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
  // bot.stop() memanggil getUpdates sekali lagi; kegagalannya harus ditangkap
  // di sini, karena error jaringan grammY memuat URL yang berisi token.
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping = bot.stop().catch((err) => log(`peringatan saat berhenti: ${describeError(err)}`));
  };
  opts.signal?.addEventListener("abort", stop, { once: true });

  try {
    await bot.init();
    await syncCommandMenu(bot.api, config.ownerId, log);
    if (opts.signal?.aborted) return 0;
    await bot.start({
      onStart: (me) => log(`berjalan sebagai @${me.username}, hanya melayani pemilik ${config.ownerId}`),
    });
    await stopping;
    log("berhenti");
    return 0;
  } catch (err) {
    write(redact(`master-bot: ${explain(err)}`, [config.token]));
    return 1;
  } finally {
    opts.signal?.removeEventListener("abort", stop);
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
