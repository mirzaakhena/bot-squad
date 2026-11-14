import { expect, test } from "bun:test";
import { ALBUM_DEBOUNCE_MS, ALBUM_HARD_CAP_MS, buildAlbum, createAlbumBuffer, sortAlbum, type AlbumEntry } from "../album.ts";

/** Tiket 261114101204: aturan penggabungan album, dengan jam palsu. */

function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (t: unknown) => void timers.delete(t as number),
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    count: () => timers.size,
  };
}

function buffer(opts: { maxItems?: number } = {}) {
  const clock = fakeClock();
  const flushed: Array<{ key: string; items: number[] }> = [];
  const buf = createAlbumBuffer<number>({
    onFlush: (key, items) => flushed.push({ key, items }),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...opts,
  });
  return { clock, flushed, buf };
}

test("angka bawaan sama dengan mirza-bots", () => {
  expect(ALBUM_DEBOUNCE_MS).toBe(1500);
  expect(ALBUM_HARD_CAP_MS).toBe(8000);
});

test("item album ditahan sampai 1,5 detik tanpa item baru, lalu diteruskan sekali", () => {
  const { clock, flushed, buf } = buffer();
  buf.add("a", 1);
  clock.advance(1000);
  buf.add("a", 2);
  clock.advance(1000); // 1 detik sejak item terakhir: masih ditahan
  expect(flushed).toEqual([]);
  buf.add("a", 3);
  clock.advance(1499);
  expect(flushed).toEqual([]);
  clock.advance(1);
  expect(flushed).toEqual([{ key: "a", items: [1, 2, 3] }]);
  expect(clock.count()).toBe(0);
  clock.advance(10_000);
  expect(flushed.length).toBe(1);
});

test("batas keras 8 detik walau item terus datang", () => {
  const { clock, flushed, buf } = buffer({ maxItems: 100 });
  buf.add("a", 0);
  for (let i = 1; i <= 7; i++) {
    clock.advance(1000);
    buf.add("a", i);
  }
  expect(flushed).toEqual([]);
  clock.advance(1000); // t = 8 s
  expect(flushed).toEqual([{ key: "a", items: [0, 1, 2, 3, 4, 5, 6, 7] }]);
  expect(clock.count()).toBe(0);
});

test("maks. 10 item: item ke-10 langsung meneruskan, item ke-11 jadi pesan berikutnya", () => {
  const { clock, flushed, buf } = buffer();
  for (let i = 1; i <= 11; i++) buf.add("a", i);
  expect(flushed).toEqual([{ key: "a", items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }]);
  clock.advance(1500);
  expect(flushed[1]).toEqual({ key: "a", items: [11] });
});

test("album berbeda tidak tercampur", () => {
  const { clock, flushed, buf } = buffer();
  buf.add("a", 1);
  buf.add("b", 2);
  buf.add("a", 3);
  clock.advance(1500);
  expect([...flushed].sort((x, y) => x.key.localeCompare(y.key))).toEqual([{ key: "a", items: [1, 3] }, { key: "b", items: [2] }]);
});

test("stopAll membuang tanpa meneruskan dan melepas semua timer", () => {
  const { clock, flushed, buf } = buffer();
  buf.add("a", 1);
  buf.add("b", 2);
  expect(buf.pending()).toBe(2);
  expect(buf.stopAll().sort()).toEqual([1, 2]);
  expect(clock.count()).toBe(0);
  clock.advance(10_000);
  expect(flushed).toEqual([]);
});

test("urutan album menurut message_id, bukan urutan tiba", () => {
  expect(sortAlbum([{ messageId: 12 }, { messageId: 10 }, { messageId: 11 }]).map((e) => e.messageId)).toEqual([10, 11, 12]);
});

const photo = (id: number, caption?: string, ok = true): AlbumEntry => ({
  messageId: id,
  kind: "photo",
  caption,
  imagePath: ok ? `/inbox/${id}.jpg` : undefined,
});

test("album foto: semua foto, kapsi diberi label per foto", () => {
  const { content, meta } = buildAlbum([photo(10, "pantai"), photo(11), photo(12, "gunung\nbaris dua")]);
  expect(content).toBe("(album of 3 items)\nPhoto 1: pantai\nPhoto 2\nPhoto 3: gunung\nbaris dua");
  expect(meta).toEqual({
    album_size: "3",
    album_message_ids: "10,11,12",
    image_path: "/inbox/10.jpg",
    image_path_1: "/inbox/10.jpg",
    image_path_2: "/inbox/11.jpg",
    image_path_3: "/inbox/12.jpg",
  });
});

test("satu kapsi saja tetap diberi label foto pemiliknya", () => {
  expect(buildAlbum([photo(1), photo(2, "yang ini")]).content).toBe("(album of 2 items)\nPhoto 1\nPhoto 2: yang ini");
});

test("foto gagal diunduh: foto lain tetap ada, Claude diberi tahu nomornya", () => {
  const one = buildAlbum([photo(1, "a"), photo(2, "b", false), photo(3)]);
  expect(one.meta.album_failed).toBe("2");
  expect(one.meta).not.toHaveProperty("image_path_2");
  expect(one.meta.image_path_1).toBe("/inbox/1.jpg");
  expect(one.meta.image_path_3).toBe("/inbox/3.jpg");
  expect(one.content).toContain("Photo 2 (download failed): b");
  expect(one.content).toContain("(photo 2 could not be downloaded — tell the sender; the other items arrived)");

  const firstFailed = buildAlbum([photo(1, undefined, false), photo(2, undefined, false), photo(3)]);
  expect(firstFailed.meta.album_failed).toBe("1,2");
  expect(firstFailed.meta.image_path).toBe("/inbox/3.jpg");
  expect(firstFailed.content).toContain("(photos 1, 2 could not be downloaded");

  const allFailed = buildAlbum([photo(1, undefined, false), photo(2, undefined, false)]);
  expect(allFailed.meta).not.toHaveProperty("image_path");
  expect(allFailed.meta.album_failed).toBe("1,2");
});

test("album campuran: foto diunduh, video jadi lampiran bernomor", () => {
  const { content, meta } = buildAlbum([
    photo(1, "foto"),
    { messageId: 2, kind: "video", caption: "klip", attachment: { file_id: "vid", size: 1000, mime: "video/mp4", name: "klip.mp4", tooLarge: false } },
    { messageId: 3, kind: "video", attachment: { file_id: "big", size: 30 * 1024 * 1024, name: "besar.mp4", tooLarge: true } },
  ]);
  expect(content.split("\n").slice(0, 4)).toEqual(["(album of 3 items)", "Photo 1: foto", 'Video 2 "klip.mp4": klip', 'Video 3 "besar.mp4"']);
  expect(content).toContain('Video 3: (video "besar.mp4" (30.0 MB) is larger than');
  expect(meta).toMatchObject({
    image_path_1: "/inbox/1.jpg",
    attachment_2_kind: "video",
    attachment_2_file_id: "vid",
    attachment_2_size: "1000",
    attachment_2_mime: "video/mp4",
    attachment_2_name: "klip.mp4",
    attachment_3_kind: "video",
    attachment_3_too_large: "true",
    attachment_3_name: "besar.mp4",
  });
  expect(meta).not.toHaveProperty("attachment_3_file_id");
  expect(meta).not.toHaveProperty("album_failed");
});

test("album dokumen: semua jadi lampiran bernomor, tanpa image_path", () => {
  const { content, meta } = buildAlbum([
    { messageId: 5, kind: "document", attachment: { file_id: "d1", name: "a.pdf", tooLarge: false } },
    { messageId: 6, kind: "document", caption: "kedua", attachment: { file_id: "d2", name: "b.pdf", tooLarge: false } },
  ]);
  expect(content).toBe('(album of 2 items)\nDocument 1 "a.pdf"\nDocument 2 "b.pdf": kedua');
  expect(meta).toMatchObject({ attachment_1_file_id: "d1", attachment_2_file_id: "d2", attachment_1_kind: "document" });
  expect(Object.keys(meta).some((k) => k.startsWith("image_path"))).toBe(false);
});

test("kunci meta hanya huruf, angka, dan garis bawah", () => {
  const { meta } = buildAlbum([
    photo(1),
    photo(2, undefined, false),
    { messageId: 3, kind: "video_note", attachment: { file_id: "x", tooLarge: false } },
  ]);
  for (const k of Object.keys(meta)) expect(k).toMatch(/^[a-z0-9_]+$/);
});
