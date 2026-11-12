import { GrammyError, type ApiClientOptions } from "grammy";
import { createMasterBot } from "./bot.ts";
import { ConfigError, dataDir, loadConfig, type ConfigSource } from "./config.ts";
import { createLogger, describeError, redact } from "./log.ts";
import { launchBot, realLaunchDeps } from "./launch.ts";
import { syncCommandMenu } from "./menu.ts";

export type RunOptions = ConfigSource & {
  /** Penulis log; default stderr. */
  write?: (line: string) => void;
  client?: ApiClientOptions;
  /** Menghentikan polling dengan rapi saat dibatalkan. */
  signal?: AbortSignal;
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
        `master-bot sudah berjalan di tempat lain (409 Conflict): ` +
        `Telegram hanya mengizinkan satu poller per token.\n` +
        `Hentikan proses master-bot yang lain, lalu jalankan lagi.`
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
    process.stderr.write(redact(`master-bot: error tak terduga: ${describeError(err)}`, knownSecrets) + "\n");
    process.exit(1);
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  process.once("SIGTERM", () => ac.abort());
  process.exit(await run({ signal: ac.signal }));
}
