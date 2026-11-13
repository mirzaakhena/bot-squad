---
type: bug
priority: low
lane: standard
labels: []
blocked_by: []
related: [261112225306]
touches: [master/src/bot.ts, master/src/delete.ts, master/test/delete.test.ts, master/test/revive.test.ts, CLAUDE.md]
created: 2026-11-13 19:07
---

## Background

Perintah hapus bot di master-bot (tiket 261112225306) menghentikan bot lebih dulu, lalu memindahkan foldernya ke arsip dan menghapus catatannya dari daftar bot. Selama langkah-langkah itu, status bot di daftar tidak diubah menjadi "dihentikan". Reviewer tiket 261112225306 mencatat celah ini sebagai temuan yang tidak memblokir.

## How to reproduce

1. Daftarkan sebuah bot yang statusnya aktif.
2. Jalankan perintah hapus untuk bot itu dan tekan tombol konfirmasi Hapus.
3. Matikan paksa master-bot tepat setelah bot dihentikan, sebelum foldernya diarsipkan.
4. Nyalakan master-bot lagi: bot yang sedang dihapus ikut dinyalakan ulang otomatis.

## Request

Bot yang sedang dihapus tidak pernah dinyalakan ulang otomatis kalau master-bot berhenti mendadak di tengah penghapusan.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik), termasuk `status.json` bot yang sedang berjalan.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`; soketnya boleh di `/tmp/k2-<id tiket>-*` dan dihapus sesudahnya. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Kalau master-bot mati mendadak setelah bot dihentikan tetapi sebelum diarsipkan, bot itu tidak dinyalakan lagi saat master-bot menyala, dan ringkasan penyalaan menyebutnya sebagai bot yang dihentikan.
- [x] Status 'stopped' dicatat di registry sebelum bot dihentikan; kalau penulisan status gagal, penghapusan batal sebelum apa pun disentuh dan laporan mengatakannya (Q1).
- [x] Kalau bot tidak bisa dihentikan dengan bersih, penghapusan tetap dibatalkan seperti sekarang, status tetap 'stopped', dan laporan menyarankan /restart <nama> untuk menyalakan lagi atau /delete <nama> untuk mencoba lagi (Q1).
- [x] Perilaku hapus yang lain (konfirmasi, arsip, token dihapus) tidak berubah, dan tes yang ada tetap lulus.
- [x] Ada tes yang gagal di kode lama untuk skenario mati mendadak itu.
- [x] Catatan proyek (CLAUDE.md) menjelaskan urutan status saat bot dihapus.

## Out of scope

- Menggulung balik langkah hapus yang gagal di tengah (asumsi A5 tiket 261112225306 sudah dikonfirmasi pemilik).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Urutan status saat /delete? (a) 'stopped' dicatat sebelum bot dihentikan (seperti /stop); kalau penulisan status gagal, penghapusan batal sebelum apa pun disentuh; kalau bot tidak bersih dihentikan, penghapusan batal, status tetap 'stopped', dan laporan menyarankan /restart <nama> atau /delete <nama> lagi. (b) Seperti (a), tetapi kalau tidak bersih status dikembalikan ke nilai sebelumnya. (c) Seperti (a), tetapi kalau penulisan status gagal penghapusan tetap lanjut (seperti /stop). Rekomendasi (a): niat menghapus berarti bot tidak boleh hidup otomatis lagi, dan tanpa status tercatat celah crash tiket ini tetap terbuka.
  → Catat 'stopped' dulu (Recommended) = (a) (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Kalau master-bot mati setelah folder diarsipkan tetapi sebelum entri registry dihapus, entri yang tersisa berstatus 'stopped' sehingga tidak dinyalakan, dan /delete <nama> lagi menyelesaikannya seperti sekarang; teks ringkasan penyalaan otomatis ('dihentikan pemilik') dipakai apa adanya
  Why: Perilaku 'langkah gagal di tengah' dan ringkasan revive.ts sudah dikonfirmasi di 261112225306 dan 261112225304
  If wrong: Tambahkan label khusus 'sedang dihapus' di ringkasan

## Decisions
- Lane standard: urutan status registry saat hapus; arsip tetap ada, tidak ada data yang hilang permanen karena perubahan ini
- Tidak solo dan tidak menunggu: bentrok berkas dengan 261113194401 (delete.test.ts) hanya tumpang tindih berkas, diselesaikan antrean merge

## Handoff
Tombol Hapus /delete kini lebih dulu mencatat status 'stopped' lewat markStoppedForDelete (delete.ts, di dalam serialized(), hanya untuk entri dengan telegramId+createdAt yang dikonfirmasi). Gagal dicatat berarti batal sebelum stop dipanggil, dengan laporan deleteNotMarkedReport. Setelah itu langkah henti, arsip, dan hapus entri tidak berubah; laporan batal karena tidak bersih kini menyebut status 'stopped' dan menyarankan /restart atau /delete. Yang tidak boleh rusak: entri registry yang tertinggal setelah crash di tengah /delete harus selalu 'stopped' supaya revive.ts tidak menyalakannya. Tes: delete.test.ts (dalam proses) dan delete-process.test.ts (main.ts sungguhan dimatikan SIGKILL saat server plugin bandel menahan langkah henti).

## Review
- 2026-11-13 standard, round 1, at 506bef5: passed.
  1: delete-process.test.ts (main.ts sungguhan, SIGKILL setelah sesi mati sebelum arsip) lulus di salinan HEAD; master-bot kedua tidak menyalakan bot, ringkasan 'Dibiarkan ... dihentikan pemilik'. Tes dalam proses 'master-bot mati mendadak...' (active/registered, dan sebelum folder dipindah) juga lulus.
  2: delete.test.ts 'bot (...) tidak bisa dimatikan bersih' memeriksa status sudah 'stopped' saat stop dipanggil; 'status stopped gagal dicatat' memeriksa stop tidak dipanggil, folder identik, laporan 'Tidak ada yang diubah'. Lulus.
  3: delete.test.ts untuk active/registered/failed/stopped x (pid sisa, sesi sisa, error ps) dan stop melempar: folder dan entri tetap, status 'stopped', laporan memuat /restart <nama> dan /delete <nama>. Lulus.
  4: suite penuh lulus menurut k2 pada 5ccfc8c7ff; delete.test.ts + delete-process.test.ts saya jalankan ulang lewat k2 test di salinan: 40 pass. Perubahan tes lama hanya menyesuaikan Q1 (status 'stopped').
  5: salinan dengan master/src/bot.ts dan delete.ts dari main (plus stub markStoppedForDelete supaya impor jalan): 3 tes mati mendadak dalam proses gagal (dl-a ikut dinyalakan) dan delete-process.test.ts gagal (status 'active').
  6: CLAUDE.md bagian /delete kini menjelaskan urutan (1) stopped dicatat, (2) henti, (3) arsip dan hapus entri, beserta jalur gagal; dinilai dengan membaca.
  note: di kode lama delete-process.test.ts gagal di pemeriksaan antara (status 'stopped' sebelum SIGKILL), bukan di hasil penyalaan ulang; hasil itu dibuktikan tes dalam proses. Tidak ada AGENTS.md; pemeriksaan selain bun test tidak tersedia di repo.
