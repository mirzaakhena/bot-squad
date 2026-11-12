---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261112223103]
touches: [plugin/server.ts, plugin/test, CLAUDE.md]
created: 2026-11-12 23:03
---

## Background

Pesan pertama ke bot baru kadang terlambat sampai beberapa menit (tiket 261112223103). Penyebabnya belum bisa dibuktikan karena tidak ada rekaman dari saat kejadian. stderr server plugin tidak tersimpan di mana pun, dan percobaan ulang `getUpdates` dari grammY tidak menulis apa pun kecuali `DEBUG=grammy:error` aktif. Pemilik memutuskan tiket 261112223103 dipecah: tiket ini menyiapkan rekaman yang selalu aktif, sedangkan pencarian penyebab menunggu sampai rekaman menangkap keterlambatan berikutnya.

## Request

Setiap bot selalu merekam kapan pesan masuk diterima dan diteruskan ke Claude, serta setiap gangguan saat mengambil pesan dari Telegram. Rekaman disimpan di folder state bot itu, sehingga keterlambatan berikutnya bisa dibuktikan dari log.

## Done when

- [x] Server plugin setiap bot selalu menulis `state/plugin.log` di folder state bot itu (`TELEGRAM_STATE_DIR`), dengan permission 0600, tanpa perlu variabel atau flag tambahan.
- [x] Setiap pesan masuk menghasilkan satu baris berisi tanggal pesan dari Telegram, waktu diterima plugin, waktu diteruskan ke Claude, dan selisihnya. Isi pesan tidak pernah ditulis.
- [x] Setiap kegagalan atau percobaan ulang `getUpdates` dicatat dengan waktu dan alasannya, termasuk percobaan ulang internal grammY yang selama ini hanya terlihat dengan `DEBUG=grammy:error`. Mulai polling (`polling as @...`) dan berhenti juga dicatat dengan waktu.
- [x] Token tidak pernah muncul di `plugin.log`, termasuk dari URL atau stack trace error grammY.
- [x] Kalau `plugin.log` melewati sekitar 1 MB, file diputar sekali (`plugin.log.1` lama ditimpa), jadi total paling besar sekitar 2 MB per bot.
- [x] Gagal menulis log (misalnya disk penuh atau folder tidak bisa ditulis) tidak menghentikan plugin dan tidak menghambat penerusan pesan ke Claude.
- [x] CLAUDE.md menjelaskan letak log, arti tiap baris, dan cara membaca keterlambatan dari log itu.
- [x] Dibuktikan dengan tes otomatis yang memakai Telegram tiruan, tanpa token asli.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Agen tidak pernah menyalakan bot dengan token asli pemilik (uji-01..03), termasuk dari salinan folder state, dan tidak menyentuh ~/.bot-squad maupun proses pemilik. Semua uji memakai Telegram tiruan dan folder state sementara (salinan, tanpa symlink).
  Why: Satu poller per token (CLAUDE.md) dan arahan foreman.
  If wrong: Pemilik menyediakan token bot uji khusus agen.
- A2 [unseen] Baris pesan masuk boleh memuat chat_id dan message_id (bukan rahasia, dibutuhkan untuk mencocokkan dengan transkrip), dengan waktu dalam ISO 8601 beserta zona waktu.
  Why: Pemilik hanya melarang isi pesan dan token; ID dibutuhkan untuk mencocokkan kejadian.
  If wrong: Hapus ID dari baris log.
- A3 [unseen] Log ditulis oleh server plugin, bukan dengan menangkap stderr dari luar, jadi berlaku untuk setiap jalur penyalaan (master-bot dan start-bot.sh). Baris stderr yang sudah ada tetap dipertahankan.
  Why: Pelajaran proyek: stderr plugin tidak masuk ke log Claude, dan shim bun hanya bekerja di server tmux baru.
  If wrong: Pindahkan perekaman ke launch.ts.
- A4 [unseen] Untuk tes, server plugin menerima BOT_SQUAD_TELEGRAM_API_ROOT yang hanya boleh menunjuk localhost/127.0.0.1/[::1]; alamat lain membuat server keluar kode 1 tanpa mencetak token
  Why: Done when meminta tes dengan Telegram tiruan memakai server plugin sungguhan; aturannya sama dengan tiket 261112223101 untuk master-bot
  If wrong: Hapus blok API_ROOT di plugin/server.ts dan uji server lewat cara lain
- A5 [unseen] Pesan yang tidak diteruskan (dibuang, pairing, perintah /start /help /status, jenis tak didukung) tetap mendapat satu baris pesan dengan hasil=... dan kolom waktu teruskan '-'
  Why: 'Setiap pesan masuk menghasilkan satu baris'; pesan yang dibuang juga bukti bahwa pesan sampai ke plugin
  If wrong: Hanya panggil logInbound untuk hasil diteruskan/izin
- A6 [unseen] 'Diteruskan ke Claude' = saat notifikasi MCP selesai ditulis ke stdout; 'diterima' = saat getUpdates mengembalikan pesan itu, bukan saat handler mulai
  Why: Handler grammY berjalan berurutan, jadi waktu handler bisa tertunda oleh pesan sebelumnya; yang ingin dibuktikan adalah jeda sebelum plugin menerima
  If wrong: Ubah titik pencatatan di transformer dan handleInbound

## Decisions
- Lane standard: menambah log di plugin; tidak menyentuh login, izin, atau data yang tak bisa dipulihkan. Token harus tetap tersensor.
- Tidak solo dan tidak menunggu: berpusat di plugin/, tidak bersinggungan dengan 261112223101 dan 261112223102.
- Dipecah dari 261112223103 atas keputusan pemilik (Q4 a). Batas 5 detik dan percobaan pemilik tetap di 261112223103; tiket ini cukup membuktikan rekamannya.
- Pencatatan ditaruh di transformer API grammY, bukan DEBUG=grammy:error atau menangkap stderr: transformer melihat setiap getUpdates di dalam loop ulang internal grammY tanpa bergantung pada modul debug, dan berlaku untuk semua jalur penyalaan.

## Handoff
Server plugin kini selalu menulis state/plugin.log lewat plugin/log.ts (sensor token, rotasi sekali di ~1 MB, 0600, gagal tulis ditelan dan diberitahu sekali di stderr). Di server.ts: transformer bot.api.config.use mengamati setiap getUpdates (gagal/pulih, termasuk ulang internal grammY) dan mencatat waktu terima per update_id; middleware bot.use pertama plus logInbound menulis satu baris per pesan, ditulis setelah notifikasi MCP selesai sehingga log tidak pernah mendahului penerusan. shutdown() kini menerima alasan. Variabel tes BOT_SQUAD_TELEGRAM_API_ROOT hanya menerima localhost. Jangan sampai: isi pesan atau token masuk log, middleware log dipindah setelah bot.command, atau penulisan log dipindah sebelum mcp.notification.

## Review
- 2026-11-12 standard, round 1, at 7788563: passed.
  1: plugin-log.test.ts (k2 test, 9 pass) menyalakan server.ts sungguhan hanya dengan TELEGRAM_STATE_DIR dan token palsu: plugin.log terbentuk 0600; unit membuktikan file lama 0644 dikencangkan
  2: tes integrasi: satu baris per pesan (diteruskan, dibuang, /start) dengan tanggal/diterima/diteruskan ISO+zona, telat_terima >=4.9s untuk pesan 5 detik lalu; isi pesan tidak ada di log
  3: tes memicu 500, 429 retry_after 1, koneksi ditolak, 409: getUpdates-gagal (ulang 3s/1s/3s/oleh-plugin), pulih, polling-gagal/mulai/berhenti, berhenti; cocok dengan handlePollingError grammY 1.41.1 (dibaca)
  4: unit redact (mentah, ter-encode, bentuk token, HttpError berisi URL) dan integrasi: token dan bagian rahasianya tidak ada di plugin.log maupun stderr penolakan
  5: unit batas 200 byte (sekali diputar, .1 ditimpa, tanpa .2, 0600) dan integrasi file 999991 byte pindah ke plugin.log.1 saat start
  6: integrasi plugin.log berupa folder: server hidup, pesan tetap diteruskan, peringatan stderr tepat sekali; unit folder read-only tidak melempar
  7: dibaca: CLAUDE.md bagian 'Log tiap bot' memuat letak, rotasi, sensor, tabel peristiwa, cara membaca keterlambatan
  8: kedua file tes memakai Telegram tiruan 127.0.0.1 dan token palsu; lulus lewat k2 test dalam 18 detik tanpa timeout
  note: API_ROOT diuji skrip terpisah: host validator WHATWG selalu sama dengan host tujuan fetch grammY; localhost@evil.com, 127.0.0.1:80@evil.com, evil.com\@127.0.0.1, localhost.evil.com, 127.0.0.2 ditolak; penolakan sebelum Bot dibuat
  note: file lama longgar yang langsung diputar membuat plugin.log.1 tetap bermode lama (chmod hanya plugin.log); isinya tanpa token
  note: kalau rename ke plugin.log.1 gagal terus, log berhenti ditulis sampai diperbaiki; plugin tetap jalan. Tidak ada pemeriksaan repo lain selain bun test
