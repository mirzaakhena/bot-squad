---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112214001]
touches: [master/src/bot.ts, master/src/main.ts, master/src/launch.ts, master/test, CLAUDE.md]
created: 2026-11-12 22:31
---

## Background

Kalau master-bot dihentikan (Ctrl+C) saat sebuah bot masih dalam proses dinyalakan, yang bisa memakan waktu sampai 90 detik, master langsung keluar tanpa menunggu proses itu. Akibatnya log tidak mencatat bahwa laporan ke pemilik tidak terkirim, dan status bot di daftar bot tertinggal "registered", bukan "active" atau "failed". Ditemukan reviewer tiket 261112214001.

## Request

Menghentikan master-bot di tengah penyalaan bot tidak boleh meninggalkan status yang menyesatkan. Pemilik bisa tahu dari log dan daftar bot apa yang terjadi pada bot itu.

## Done when

- [x] Setelah master-bot dihentikan di tengah penyalaan, status bot di daftar bot menjadi "failed" (bukan status baru), kecuali penyalaan sudah siap saat itu ("active").
- [x] Sesi tmux bot yang penyalaannya terputus dimatikan (tmux kill-session); kalau bot sudah siap ("active"), sesinya tidak disentuh.
- [x] Log master mencatat bahwa penyalaan bot itu terputus, status yang ditulis, dan bahwa laporannya tidak terkirim.
- [x] Master-bot keluar paling lama 5 detik setelah SIGINT/SIGTERM; berhenti tidak ditunda sampai penyalaan selesai.
- [x] Dibuktikan dengan tes otomatis yang menjalankan proses master sungguhan, bukan hanya fungsi di dalamnya.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Status apa yang ditulis untuk bot yang penyalaannya terputus karena master-bot berhenti? Pilihan: (a) 'failed', ditambah baris log yang menjelaskan bahwa penyalaan terputus; (b) status baru, misalnya 'interrupted'. Rekomendasi (a): bentuk registry tidak berubah, jadi tiket berikutnya (/list 261112225301, hidup-ulang saat start 261112225304) tidak perlu menunggu perubahan bentuk data, dan alasannya tetap tercatat di log.
  → (a) 'failed' ditambah baris log. (owner, 2026-11-12)
- Q2 [answered] Sesi tmux bot yang sedang dinyalakan, diapakan saat master-bot berhenti? Pilihan: (a) dimatikan (tmux kill-session), sehingga status 'failed' benar-benar sesuai kenyataan; (b) dibiarkan hidup, seperti sesi gagal biasa yang dibiarkan untuk dilihat. Rekomendasi (a): kalau master berhenti sebelum dialog development channel dijawab, tidak ada lagi yang menekan Enter, jadi sesi macet selamanya di dialog itu dan memblokir start berikutnya ('sudah berjalan'); kalau sudah lewat dialog, bot bisa hidup diam-diam padahal tercatat 'failed'. Kalau penyalaan ternyata sudah siap saat itu, hasilnya 'active' dan sesi tidak disentuh.
  → (a) sesi dimatikan dengan kill-session, kecuali bot sudah siap ('active', sesi tidak disentuh). (owner, 2026-11-12)
- Q3 [answered] Berapa batas 'berhenti dalam waktu singkat' yang diuji? Rekomendasi: master-bot keluar paling lama 5 detik setelah SIGINT/SIGTERM walau penyalaan sedang menunggu (master tidak menunggu server plugin bot benar-benar keluar). Pilihan lain: angka lain yang Anda tentukan.
  → Paling lama 5 detik. (owner, 2026-11-12)

## Assumptions
- A1 [unseen] Lingkup hanya master-bot. Ctrl+C pada scripts/start-bot.sh (start-cli.ts) tidak diubah.
  Why: Background dan Request hanya membahas master-bot dan laporannya ke pemilik.
  If wrong: Buat tiket terpisah untuk start-cli.
- A2 [unseen] Tes proses sungguhan menjalankan master/src/main.ts dengan HOME dan BOT_SQUAD_HOME di folder sementara baru (salinan, tanpa symlink; dicek find -type l), MASTER_BOT_API_ROOT ke Telegram tiruan di 127.0.0.1, claude tiruan di depan PATH yang tidak pernah siap, dan server tmux terpisah lewat TMUX_TMPDIR sementara. Server tmux pemilik, sesi uji-01..03, master-bot pemilik, dan ~/.bot-squad tidak pernah disentuh atau dimatikan.
  Why: Arahan foreman (data asli dan proses pemilik terlarang) dan pelajaran tiket sebelumnya (tmux mengambil PATH dari klien pertama; scratchpad lama berisi symlink ke data asli).
  If wrong: Ganti cara tes.
- A3 [unseen] Log memuat dua baris: 'penyalaan <nama> terputus: master-bot berhenti' beserta status yang ditulis, lalu baris yang sudah ada 'laporan penyalaan <nama> tidak terkirim: master-bot berhenti sebelum laporan terkirim'. Kalau penulisan status gagal saat berhenti, itu juga dicatat di log.
  Why: Mengikuti pola log yang sudah ada di bot.ts dan retry.ts.
  If wrong: Ubah teks log.

## Decisions
- Lane standard: mengubah status registry dan jalur berhenti master-bot; tidak ada data yang tak bisa dipulihkan atau izin.
- Tidak solo dan tidak menunggu: bentuk registry tidak berubah (bila Q1 dijawab failed). Tes proses sungguhan memakai MASTER_BOT_API_ROOT ke 127.0.0.1, yang tetap diizinkan oleh 261112223101, jadi keduanya bisa berdampingan.
- Batas tunggu penyalaan saat berhenti 3 detik (LAUNCH_SETTLE_MS), bukan 5: sisa waktu untuk bot.stop dan keluar proses, supaya batas 5 detik pemilik tetap terpenuhi walau ada langkah yang tidak bisa dibatalkan (pembersihan server sisa bisa 2 detik).

## Handoff
Signal berhenti master-bot kini diteruskan ke launchBot lewat LaunchDeps.signal (realLaunchDeps argumen ke-4). Penyalaan memeriksa signal sebelum tiap langkah dan di loop tunggu (sleep bisa dibatalkan); install plugin dan tunggu kuncinya ikut dibatalkan. Saat putus: satu tangkapan layar terakhir; kalau siap hasilnya active dan sesi tidak disentuh, kalau tidak sesi di-kill-session dan hasilnya failed dengan interrupted: true. bot.ts mencatat baris 'terputus' dan status yang ditulis; laporan tetap tidak dikirim (sendWithRetry berhenti). main.ts melacak penyalaan lewat onLaunch dan menunggunya paling lama 3 detik setelah bot.stop. Tmux kini punya killSession: tmux tiruan di tes baru wajib mengisinya. Jangan buat berhenti menunggu penyalaan selesai penuh.

## Review
- 2026-11-12 standard, round 1, at cf209f0: passed.
  1: shutdown.test.ts (main.ts sungguhan, salinan HEAD): SIGINT/SIGTERM belum siap -> 'failed'; siap saat berhenti -> 'active'. Mutasi: tanpa settleLaunches status tertinggal 'registered'; tanpa cek siap di interrupted() tes active gagal, jadi tes active melewati jalur putus.
  2: tes proses: has-session gagal setelah berhenti pada kasus belum siap, sesi tetap hidup pada kasus siap; tes unit launch.test.ts memeriksa kill-session hanya bila belum siap dan kegagalannya dicatat.
  3: tes proses memeriksa baris sesi dimatikan, 'penyalaan henti-01 terputus: master-bot berhenti; status ditulis failed', dan 'laporan ... tidak terkirim: master-bot berhenti sebelum laporan terkirim'; tidak ada laporan terkirim.
  4: tes proses mengukur sinyal sampai keluar < 5000 ms untuk SIGINT dan SIGTERM (58 pass 0 fail di launch+shutdown). Batas 3 detik LAUNCH_SETTLE_MS untuk langkah tak bisa dibatalkan dinilai dengan membaca.
  5: shutdown.test.ts menjalankan main.ts sebagai proses, HOME/BOT_SQUAD_HOME mkdtemp tanpa symlink, Telegram tiruan 127.0.0.1, tmux -S + TMUX_TMPDIR sendiri. Versi akhir (cf209f0) adalah tes henti-01 tiket ini; diff tanpa berkas tiket 261112230301.
  note: repo tidak punya skrip/CI selain bun test. Mutasi tanpa settleLaunches sempat lolos untuk SIGTERM (timing), tapi SIGINT dan kasus active menangkapnya.
- 2026-11-12 conflict resolution, at 52bbd91: passed.
  Konflik hanya di CLAUDE.md: baris laporan penyalaan memakai versi tiket ini, baris keterlambatan memakai versi main (rujukan plugin.log 261112230301). Diff HEAD terhadap 6a618f0 hanya perubahan tiket ini; plugin/ sama persis dengan main.
