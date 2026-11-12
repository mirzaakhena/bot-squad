import type { Update } from "grammy/types";

export type Call = { method: string; params: Record<string, unknown> };
type Reply = { status?: number; body: unknown };
type Handler = (params: Record<string, unknown>) => Reply | Promise<Reply>;

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
  const base: Record<string, Handler> = {
    getMe: () => ok(ME),
    setMyCommands: () => ok(true),
    deleteWebhook: () => ok(true),
    sendMessage: (p) => ok({ message_id: calls.length, date: 0, chat: { id: p.chat_id, type: "private" }, text: p.text }),
    getUpdates: async () => {
      const batch = pending;
      pending = [];
      if (batch.length === 0) await Bun.sleep(20);
      return ok(batch);
    },
    ...handlers,
  };
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(url.pathname);
      const urlToken = m ? decodeURIComponent(m[1]!) : "";
      if (m && urlToken !== token && Object.hasOwn(otherBots, urlToken)) {
        otherCalls.push({ token: urlToken, method: m[2]! });
        if (m[2] !== "getMe") return Response.json({ ok: false, error_code: 400, description: "hanya getMe" }, { status: 400 });
        const r = await otherBots[urlToken]!({});
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
      const h = base[method] ?? (() => ok(true));
      const r = await h(params);
      return Response.json(r.body, { status: r.status ?? 200 });
    },
  });
  return {
    apiRoot: `http://127.0.0.1:${server.port}`,
    calls,
    otherCalls,
    stray,
    push: (...u: Update[]) => pending.push(...u),
    stop: () => server.stop(true),
  };
}
