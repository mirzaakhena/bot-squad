import { expect, test } from "bun:test";
import { ackEmoji, createTypingKeepalive, TYPING_MAX_MS, TYPING_PING_INTERVAL_MS } from "../typing.ts";

/**
 * Tiket 261114101201: keepalive "typing…" dengan jam palsu, jadi batas 300
 * detik diuji tanpa menunggu waktu sungguhan.
 */
function fakeClock() {
  let nowMs = 0;
  const timers = new Map<number, { fn: () => void; every: number; next: number }>();
  let nextId = 1;
  return {
    now: () => nowMs,
    setInterval: (fn: () => void, every: number) => {
      const id = nextId++;
      timers.set(id, { fn, every, next: nowMs + every });
      return id;
    },
    clearInterval: (h: unknown) => void timers.delete(h as number),
    advance(ms: number) {
      const target = nowMs + ms;
      for (;;) {
        let due: { fn: () => void; every: number; next: number } | undefined;
        for (const t of timers.values()) if (t.next <= target && (!due || t.next < due.next)) due = t;
        if (!due) break;
        nowMs = due.next;
        due.next = nowMs + due.every;
        due.fn();
      }
      nowMs = target;
    },
    live: () => timers.size,
  };
}

function setup() {
  const clock = fakeClock();
  const sent: Array<{ chat: string; at: number }> = [];
  const k = createTypingKeepalive({ send: (c) => void sent.push({ chat: c, at: clock.now() }), ...clock });
  return { clock, sent, k };
}

test("konstanta sama dengan mirza-bots: 4 detik, 300 detik", () => {
  expect(TYPING_PING_INTERVAL_MS).toBe(4_000);
  expect(TYPING_MAX_MS).toBe(300_000);
});

test("ping pertama segera, lalu diperbarui setiap 4 detik", () => {
  const { clock, sent, k } = setup();
  k.start("1");
  expect(sent.map((s) => s.at)).toEqual([0]);
  clock.advance(12_000);
  expect(sent.map((s) => s.at)).toEqual([0, 4_000, 8_000, 12_000]);
  expect(k.active("1")).toBe(true);
});

test("berhenti di balasan pertama: tidak ada ping lagi dan timer dilepas", () => {
  const { clock, sent, k } = setup();
  k.start("1");
  clock.advance(9_000);
  k.stop("1");
  const n = sent.length;
  clock.advance(60_000);
  expect(sent.length).toBe(n);
  expect(clock.live()).toBe(0);
  expect(k.active("1")).toBe(false);
  k.stop("1"); // balasan kedua: tidak apa-apa
});

test("tanpa balasan: berhenti sendiri paling lama 300 detik setelah pesan masuk", () => {
  const { clock, sent, k } = setup();
  k.start("1");
  clock.advance(TYPING_MAX_MS + 60_000);
  const last = sent[sent.length - 1]!.at;
  expect(last).toBeLessThan(TYPING_MAX_MS);
  expect(last).toBe(TYPING_MAX_MS - TYPING_PING_INTERVAL_MS);
  expect(clock.live()).toBe(0);
  expect(k.active("1")).toBe(false);
});

test("pesan baru saat typing hidup: batas dihitung dari pesan terbaru, timer tidak menumpuk", () => {
  const { clock, sent, k } = setup();
  k.start("1");
  clock.advance(200_000);
  k.start("1");
  expect(clock.live()).toBe(1);
  clock.advance(500_000);
  const last = sent[sent.length - 1]!.at;
  expect(last).toBeGreaterThanOrEqual(200_000 + TYPING_MAX_MS - TYPING_PING_INTERVAL_MS);
  expect(last).toBeLessThan(200_000 + TYPING_MAX_MS);
  // Laju tetap satu ping per 4 detik.
  const gaps = sent.slice(1).map((s, i) => s.at - sent[i]!.at).filter((g) => g > 0);
  expect(Math.min(...gaps)).toBe(TYPING_PING_INTERVAL_MS);
});

test("chat lain tidak saling menghentikan", () => {
  const { clock, sent, k } = setup();
  k.start("1");
  k.start("2");
  k.stop("1");
  clock.advance(8_000);
  expect(sent.filter((s) => s.chat === "1").length).toBe(1);
  expect(sent.filter((s) => s.chat === "2").length).toBe(3);
  k.stopAll();
  expect(clock.live()).toBe(0);
});

test("kirim yang gagal (throw atau reject) ditelan dan ping berikutnya tetap jalan", async () => {
  const clock = fakeClock();
  let calls = 0;
  const k = createTypingKeepalive({
    send: () => {
      calls++;
      if (calls === 1) throw new Error("429");
      return Promise.reject(new Error("jaringan"));
    },
    ...clock,
  });
  k.start("1");
  clock.advance(8_000);
  await Bun.sleep(10);
  expect(calls).toBe(3);
});

test("ackEmoji: bawaan 👀, string kosong mematikan, isian dipakai apa adanya", () => {
  expect(ackEmoji(undefined)).toBe("👀");
  expect(ackEmoji(null)).toBe("👀");
  expect(ackEmoji("")).toBeNull();
  expect(ackEmoji("👍")).toBe("👍");
});
