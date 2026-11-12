/**
 * MASTER_BOT_API_ROOT mengganti alamat server Telegram, khusus untuk tes
 * dengan Telegram tiruan. Semua permintaan master-bot (termasuk tokennya dan
 * token bot yang dicek lewat getMe) dikirim ke alamat ini, jadi alamatnya
 * hanya boleh menunjuk ke mesin lokal.
 */
export const API_ROOT_VAR = "MASTER_BOT_API_ROOT";

/** Hostname hasil parse URL yang dianggap mesin lokal. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type ApiRootChoice =
  | { kind: "unset" }
  | { kind: "local"; apiRoot: string; warning: string }
  | { kind: "rejected"; message: string };

export function resolveApiRoot(env: Record<string, string | undefined>): ApiRootChoice {
  const raw = env[API_ROOT_VAR]?.trim();
  if (!raw) return { kind: "unset" };

  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {}
  const local =
    url !== undefined &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === "" &&
    LOCAL_HOSTS.has(url.hostname.toLowerCase());

  if (!local) {
    return {
      kind: "rejected",
      message:
        `${API_ROOT_VAR}=${JSON.stringify(raw)} ditolak: variabel ini hanya untuk tes dan hanya boleh menunjuk ` +
        `ke mesin lokal (http://localhost, http://127.0.0.1, atau http://[::1], port bebas).\n` +
        `master-bot dibatalkan tanpa menghubungi alamat itu. Hapus ${API_ROOT_VAR} dari environment ` +
        `untuk terhubung ke Telegram sungguhan.`,
    };
  }
  return {
    kind: "local",
    apiRoot: raw,
    warning:
      `PERINGATAN: ${API_ROOT_VAR}=${raw} aktif. master-bot TIDAK terhubung ke Telegram sungguhan; ` +
      `semua permintaan dikirim ke ${raw}. Variabel ini hanya untuk tes.`,
  };
}
