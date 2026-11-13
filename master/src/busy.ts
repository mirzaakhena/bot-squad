/**
 * Kunci "sedang diproses" per bot (tiket 261112225302, Q1): selama satu bot
 * sedang dinyalakan (/register, /restart), dihentikan (/stop), atau dihapus
 * (/delete, tiket 261112225306), perintah
 * lain untuk bot yang sama ditolak, supaya bot tidak pernah berjalan dua
 * kali. Satu master-bot memegang satu BotLocks (main.ts membuatnya dan
 * memberikannya ke createMasterBot); pekerjaan lain di proses yang sama yang
 * menyalakan atau menghentikan bot harus memakai objek yang sama. Antar
 * proses (start-bot.sh bersamaan) tetap dijaga cek sesi tmux di launch.ts.
 */

export type BusyAction = "dinyalakan" | "dihentikan" | "dinyalakan ulang" | "dihapus";

export type BotLocks = {
  /** Apa yang sedang dikerjakan pada bot `name`, atau null kalau bebas. */
  busyWith(name: string): BusyAction | null;
  /**
   * Mengambil kunci bot `name`. Mengembalikan pelepasnya, atau null kalau
   * bot itu sedang diproses. Pelepas aman dipanggil lebih dari sekali.
   */
  claim(name: string, action: BusyAction): (() => void) | null;
};

export function createBotLocks(): BotLocks {
  const busy = new Map<string, BusyAction>();
  return {
    busyWith: (name) => busy.get(name) ?? null,
    claim(name, action) {
      if (busy.has(name)) return null;
      busy.set(name, action);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        busy.delete(name);
      };
    },
  };
}

/** Balasan untuk perintah yang ditolak karena bot sedang diproses. */
export function busyText(name: string, action: BusyAction): string {
  return `'${name}' sedang ${action}, coba lagi setelah selesai.`;
}
