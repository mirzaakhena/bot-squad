---
type: bug
priority: medium
lane: strict
labels: []
blocked_by: []
related: []
touches: [master/src/main.ts, master/src/config.ts, master/test/run.test.ts, CLAUDE.md]
created: 2026-11-12 21:10
---

## Background

master-bot dijalankan dengan satu token. Telegram hanya mengizinkan satu penerima pesan per token. Saat review terbukti bahwa kalau master-bot dijalankan untuk kedua kalinya, Telegram menolak instance yang lama, bukan yang baru. Akibatnya master-bot yang sedang berjalan berhenti dengan pesan "sudah berjalan di tempat lain", sementara instance baru diam-diam mengambil alih. Pesan itu menyesatkan, dan pemilik bisa kehilangan master-bot yang selama ini berjalan tanpa sadar.

## Request

Menjalankan master-bot kedua kalinya di mesin yang sama harus langsung ditolak oleh instance yang baru, sementara yang lama tetap berjalan. Kalau Telegram tetap melaporkan bentrok, misalnya karena master-bot dijalankan di mesin lain, pesannya harus menjelaskan apa yang sebenarnya terjadi.

## Done when

- [x] Menjalankan master-bot kedua dengan folder data yang sama (kunci BOT_SQUAD_HOME/master/master.pid, dibuat atomik dan berisi pid) langsung berhenti dengan pesan jelas di terminal bahwa master-bot sudah berjalan, kode keluar 1, tanpa memanggil API Telegram apa pun dan tanpa pesan ke pemilik. Instance pertama tetap berjalan.
- [x] Kunci dianggap basi kalau pid di dalamnya sudah mati atau prosesnya bukan master/src/main.ts. Kunci dihapus saat master berhenti normal.
- [x] Kalau master-bot sebelumnya mati mendadak, master-bot bisa dijalankan lagi tanpa langkah manual.
- [x] Pesan untuk bentrok dari Telegram menjelaskan bahwa proses ini digantikan oleh master-bot lain, bukan sekadar "sudah berjalan di tempat lain".
- [x] Token tidak pernah muncul di pesan mana pun.
- [x] Perilaku di atas dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Cakupan kunci 'mesin yang sama'. Pilihan: (a) satu kunci per folder data (BOT_SQUAD_HOME/master/master.pid); (b) satu kunci per token/ID master-bot di folder global mesin. Rekomendasi (a): registry dan bot ada di folder data, sederhana, dan tes bisa memakai folder sementara. Dua folder data berbeda dengan token sama tetap berujung 409, yang pesannya dijelaskan (Done when 3).
  → (a) per folder data (BOT_SQUAD_HOME/master/master.pid). (owner, 2026-11-12)
- Q2 [answered] Cara menilai kunci basi setelah master mati mendadak. Rekomendasi: kunci dibuat atomik (seperti kunci install plugin), berisi pid; kunci dianggap basi kalau pid itu sudah mati ATAU proses dengan pid itu bukan master-bot (perintahnya tidak menjalankan master/src/main.ts), untuk menghindari pid yang dipakai ulang OS. Kunci dihapus saat master berhenti normal. Setuju?
  → Setuju. (owner, 2026-11-12)
- Q3 [answered] Saat instance kedua ditolak, apakah pemilik juga diberi tahu lewat Telegram? Rekomendasi: tidak; cukup pesan di terminal dan kode keluar 1, dan instance kedua tidak memanggil API Telegram sama sekali (tidak ada getMe, setMyCommands, atau getUpdates), supaya instance pertama tidak terganggu.
  → Setuju. (owner, 2026-11-12)

## Assumptions
- A1 [confirmed] Kunci diambil sebelum panggilan Telegram apa pun, setelah konfigurasi terbaca
  Why: Done when: instance pertama tetap berjalan; getUpdates dari instance kedua akan mengusir yang pertama
  If wrong: -
  Confirmed by owner, 2026-11-12
- A2 [confirmed] Bukti otomatis memakai dua proses main.ts sungguhan dengan fake-telegram dan BOT_SQUAD_HOME sementara (seperti run.test.ts); kunci basi disimulasikan dengan file berisi pid yang sudah mati
  Why: Pola tes yang ada di master/test/run.test.ts; agen tidak boleh mematikan proses di luar buatannya
  If wrong: -
  Confirmed by owner, 2026-11-12
- A3 [confirmed] Proses dianggap master-bot kalau salah satu argumennya master/src/main.ts (path apa pun di depannya) atau src/main.ts / ./src/main.ts, karena 'bun run --cwd master start' tampil di ps sebagai 'bun src/main.ts'
  Why: Perintah start resmi di CLAUDE.md menghasilkan path relatif; tanpa itu kunci master yang berjalan normal dianggap basi
  If wrong: Ubah isMasterCommand di master/src/lock.ts
  Confirmed by owner, 2026-11-12
- A4 [confirmed] Kalau pid di kunci hidup tetapi perintahnya tidak bisa dibaca lewat ps, kunci dianggap masih dipegang (start ditolak)
  Why: Lebih aman menolak start daripada mengusir master-bot yang sedang berjalan; ps tersedia di macOS dan Linux
  If wrong: Di acquireMasterLock, perlakukan cmd === null sebagai basi
  Confirmed by owner, 2026-11-12

## Decisions
- Lane strict: kunci instance tunggal panel kontrol; kunci yang salah bisa mengunci pemilik di luar atau menghilangkan master-bot diam-diam
- Tidak solo dan tidak menunggu: tidak ada tiket lain yang membaca hasilnya; berbagi file (main.ts, CLAUDE.md) diselesaikan merge queue
- Red-proof: cek kunci dipegang di run(), return held, cek pid hidup, cek perintah master-bot, perintah tak terbaca dianggap dipegang, cek pid sendiri, pola src/main.ts relatif dan master/src/main.ts absolut, link atomik, verifikasi pengambilalihan kunci basi, release di run(), release hanya kunci milik sendiri, pesan 409 baru, kunci sebelum panggilan Telegram; all red
- Proses main.ts menerima MASTER_BOT_API_ROOT (hanya untuk tes) supaya dua proses main.ts sungguhan bisa diarahkan ke Telegram tiruan; tanpa itu bukti dua proses tidak bisa dibuat tanpa token asli
- Kunci basi diambil alih dengan rename lalu memastikan isinya masih pid basi yang tadi dibaca; kalau ternyata kunci baru milik proses lain, dikembalikan, supaya dua instance yang start bersamaan tidak sama-sama lolos

## Handoff
Baru: master/src/lock.ts (acquireMasterLock, isMasterCommand, psCommand). run() di main.ts mengambil kunci BOT_SQUAD_HOME/master/master.pid tepat setelah konfigurasi terbaca dan sebelum panggilan Telegram apa pun; isi lama run() pindah ke serve(), dan kunci dilepas di finally serta di handler fatal. Kunci basi bila pid mati, pid sendiri, atau perintah ps bukan master/src/main.ts atau src/main.ts. Pesan 409 kini menyebut proses ini digantikan master-bot lain. Entry main.ts membaca MASTER_BOT_API_ROOT hanya untuk tes. Yang tidak boleh rusak: tidak ada panggilan API sebelum kunci, instance kedua tidak boleh polling, dan tes in-process run() bergantung pada aturan pid sendiri dianggap basi.

## Review
- 2026-11-12 strict, round 1, at 32c2bde: passed.
  1: Tes dua proses main.ts: proses kedua exit 1, pesan pid+path, Telegram tiruan kedua 0 panggilan, pertama tetap membalas /help. Uji manual dua kali 'bun run --cwd master start' (ps: 'bun src/main.ts') hasilnya sama. Mutasi abaikan held di run(): 2 tes merah.
  2: Mutasi buang isMasterCommand dari cek held: 4 merah; balik cek alive: 7 merah; hapus lock.release() di finally: 3 merah. Kunci hilang setelah SIGTERM, juga di uji manual.
  3: Tes kill -9 lalu start ulang mengambil alih kunci pid mati tanpa langkah manual; merah saat cek alive dibalik.
  4: Mutasi kembali ke teks lama 409: 3 tes merah di run.test.ts dan menu.test.ts.
  5: Semua tes keluaran (instance kedua, pertama, 409, run()) memeriksa not.toContain(TOKEN); pesan kunci hanya pid dan path.
  6: lock.test.ts 27 tes plus penyesuaian run/menu; tiap mutasi di atas merah. Repo tidak punya cek lain selain bun test.
  note: MASTER_BOT_API_ROOT bisa mengirim token ke URL lain bila ter-set; bukan celah baru (yang bisa set env juga bisa baca master/.env), terdokumentasi; F1 usul batasi ke loopback.
  note: pengambilalihan kunci basi punya celah sempit bila tiga instance start bersamaan (rename lalu link balik); dinilai dengan membaca saja.

## Follow-ups
- F1 [ticketed] MASTER_BOT_API_ROOT di master/src/main.ts (entry produksi) menerima URL apa pun dari environment dan grammY mengirim token master-bot ke URL itu (path /bot<token>/...). Saat ini hanya dipakai tes. Kalau variabel ini ter-set di lingkungan produksi (shell profile, tmux global env), token bocor ke server lain tanpa peringatan. Penghuni mesin yang sama sudah bisa membaca master/.env, jadi ini pertahanan berlapis, bukan celah baru. Usul: hanya terima http(s)://127.0.0.1, ::1 atau localhost, tolak lainnya dengan kode 1, dan cetak peringatan di terminal saat aktif; tambahkan tes.
  → 261112223101
