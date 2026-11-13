import type { Update } from "grammy/types";

export type Call = { method: string; params: Record<string, unknown> };
type Reply = { status?: number; body: unknown };
/** `next` menjalankan penangan bawaan untuk metode yang sama. */
type Handler = (params: Record<string, unknown>, next: () => Reply | Promise<Reply>) => Reply | Promise<Reply>;

export const ME = {
  id: 999000,
  is_bot: true as const,
  first_name: "master",
  username: "uji_master_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

export type Command = { command: string; description: string };
export type Scope = Record<string, unknown> & { type: string };

/** Kunci menu: cakupan (default kalau tidak diisi) + kode bahasa. */
function menuKey(scope: unknown, languageCode: unknown): string {
  const sc = (scope as Scope | undefined) ?? { type: "default" };
  const id = "chat_id" in sc ? String(sc.chat_id) : "";
  const uid = "user_id" in sc ? String(sc.user_id) : "";
  return `${sc.type}|${id}|${uid}|${typeof languageCode === "string" ? languageCode : ""}`;
}

/**
 * Urutan Telegram: dari cakupan paling khusus ke paling umum; di setiap
 * cakupan, menu dengan kode bahasa user dipakai lebih dulu, lalu tanpa bahasa.
 */
function resolveMenu(menus: Map<string, Command[]>, scopes: Scope[], languageCode?: string): Command[] {
  for (const sc of scopes) {
    if (languageCode) {
      const m = menus.get(menuKey(sc, languageCode));
      if (m) return m;
    }
    const m = menus.get(menuKey(sc, undefined));
    if (m) return m;
  }
  return [];
}

export const ok = (result: unknown): Reply => ({ body: { ok: true, result } });
export const fail = (status: number, description: string): Reply => ({
  status,
  body: { ok: false, error_code: status, description },
});

/**
 * Server Telegram tiruan. Mencatat setiap panggilan API dan memeriksa bahwa
 * token di URL adalah token yang diharapkan.
 */
export function startFakeTelegram(
  token: string,
  handlers: Record<string, Handler> = {},
  /** getMe untuk token bot lain (token -> jawaban), dipakai tes /register. */
  otherBots: Record<string, Handler> = {},
) {
  const calls: Call[] = [];
  /** Panggilan dengan token selain token master-bot. */
  const otherCalls: Array<{ token: string; method: string }> = [];
  /** Jumlah permintaan dengan token yang tidak dikenal sama sekali. */
  const stray = { count: 0 };
  let pending: Update[] = [];
  /** Menu perintah per cakupan + kode bahasa, seperti yang disimpan Telegram. */
  const menus = new Map<string, Command[]>();
  const defaults: Record<string, (params: Record<string, unknown>) => Reply | Promise<Reply>> = {
    getMe: () => ok(ME),
    setMyCommands: (p) => {
      menus.set(menuKey(p.scope, p.language_code), (p.commands as Command[]).map((c) => ({ ...c })));
      return ok(true);
    },
    deleteMyCommands: (p) => {
      menus.delete(menuKey(p.scope, p.language_code));
      return ok(true);
    },
    getMyCommands: (p) => ok(menus.get(menuKey(p.scope, p.language_code)) ?? []),
    deleteWebhook: () => ok(true),
    sendMessage: (p) => ok({ message_id: calls.length, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text }),
    getUpdates: async () => {
      const batch = pending;
      pending = [];
      if (batch.length === 0) await Bun.sleep(20);
      return ok(batch);
    },
  };
  const server = Bun.serve({
    // Wajib 127.0.0.1, bukan bawaan Bun (semua alamat, *:port). macOS mau
    // memberi port 0 yang sama dengan pendengar 127.0.0.1:port milik proses
    // lain (sesi Claude Code, Chrome), dan permintaan ke 127.0.0.1 lalu sampai
    // ke proses itu: 404 "not found", jawaban kosong, atau koneksi diputus.
    // Inilah kegagalan acak tiket 261113194401.
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(url.pathname);
      const urlToken = m ? decodeURIComponent(m[1]!) : "";
      if (m && urlToken !== token && Object.hasOwn(otherBots, urlToken)) {
        otherCalls.push({ token: urlToken, method: m[2]! });
        if (m[2] !== "getMe") return Response.json({ ok: false, error_code: 400, description: "hanya getMe" }, { status: 400 });
        const r = await otherBots[urlToken]!({}, () => ok(true));
        return Response.json(r.body, { status: r.status ?? 200 });
      }
      if (!m || urlToken !== token) {
        stray.count++;
        return Response.json({ ok: false, error_code: 404, description: "Not Found" }, { status: 404 });
      }
      const method = m[2]!;
      const text = await req.text();
      const params = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      calls.push({ method, params });
      const fallback = () => (defaults[method] ?? (() => ok(true)))(params);
      const h = handlers[method];
      const r = h ? await h(params, fallback) : await fallback();
      return Response.json(r.body, { status: r.status ?? 200 });
    },
  });
  return {
    apiRoot: `http://127.0.0.1:${server.port}`,
    calls,
    otherCalls,
    stray,
    menus,
    /** Mengisi menu sisa, seolah didaftarkan bot lain dengan token yang sama. */
    seedMenu: (scope: Scope, commands: Command[], languageCode?: string) =>
      menus.set(menuKey(scope, languageCode), commands),
    /** Menu yang dilihat user di chat pribadinya, mengikuti urutan cakupan Telegram. */
    privateMenu: (userId: number, languageCode?: string) => resolveMenu(menus, [{ type: "chat", chat_id: userId }, { type: "all_private_chats" }, { type: "default" }], languageCode),
    /** Menu yang dilihat anggota biasa di sebuah grup. */
    groupMenu: (chatId: number, languageCode?: string) => resolveMenu(menus, [{ type: "chat", chat_id: chatId }, { type: "all_group_chats" }, { type: "default" }], languageCode),
    /** Menu yang dilihat admin di sebuah grup. */
    groupAdminMenu: (chatId: number, languageCode?: string) =>
      resolveMenu(menus, [{ type: "chat_administrators", chat_id: chatId }, { type: "chat", chat_id: chatId }, { type: "all_chat_administrators" }, { type: "all_group_chats" }, { type: "default" }], languageCode),
    push: (...u: Update[]) => pending.push(...u),
    stop: () => server.stop(true),
  };
}
