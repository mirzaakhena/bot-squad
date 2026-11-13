---
type: feature
priority: low
lane: standard
labels: []
blocked_by: []
related: []
touches: [master/src/bot.ts, master/src/logs.ts, master/src/launch.ts, master/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Untuk tahu bot sedang mengerjakan apa atau macet di mana, pemilik harus masuk ke server dan membuka sesi tmux. Isi layar bisa memuat hal sensitif, tetapi master-bot hanya melayani pemilik, jadi menurut pemilik itu dapat diterima.

## Request

Pemilik bisa melihat bagian terakhir layar sesi sebuah bot langsung dari master-bot.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [x] /logs <nama> menampilkan baris-baris terakhir layar sesi bot itu (tanpa baris kosong) dalam blok kode yang muat di satu pesan Telegram.
- [x] Pemilik bisa meminta jumlah baris tertentu: `/logs <nama> [n]`, default 20, maksimum 50 (Q1). Angka di luar 1-50 atau bukan angka dijawab dengan cara pakai; hasilnya selalu muat dalam satu pesan tanpa dibagi.
- [x] Kalau bot tidak hidup, balasannya menjelaskan itu.
- [x] Token dan isi file .env bot tidak pernah ikut terkirim, walaupun tampil di layar.
- [x] Dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Batas jumlah baris /logs <nama> [n]? Opsi A (rekomendasi): default 20 (sama dengan laporan penyalaan), maks. 100; kalau tidak muat di satu pesan (4096 karakter), yang dibuang baris paling atas dan balasan menyebut berapa baris yang tampil. Opsi B: default 20, maks. 50, selalu muat tanpa pemotongan. Opsi C: default 40, maks. 200, dibagi beberapa pesan bila perlu (bertentangan dengan 'satu pesan').
  → Default 20, maks 50 (opsi B): selalu muat dalam satu pesan. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Hanya bot di registry yang dilayani (nama lolos aturan nama); tanpa sesi tmux balasannya menjelaskan keadaan nyata dengan kata yang sama seperti /list; kalau sesi ada tetapi server plugin mati, layar tetap ditampilkan plus keterangan itu
  Why: Konsisten dengan /list dan /stop (tiket 261112225301, 261112225302)
  If wrong: Tolak juga sesi tanpa server plugin
- A2 [unseen] Sensor: token bot itu (dari state/.env), token master-bot, dan apa pun berbentuk <angka>:<20+ karakter> diganti, juga seluruh nilai setelah TELEGRAM_BOT_TOKEN= atau MASTER_BOT_TOKEN= di baris mana pun; teks layar di-escape HTML dalam <pre>
  Why: Sama dengan sensor /list dan laporan penyalaan; Done when melarang token dan isi .env
  If wrong: Perluas pola sensor
- A3 [unseen] /logs hanya membaca (tmux capture-pane), tanpa BotLocks dan tanpa mengubah sesi; boleh dipakai saat bot sedang dinyalakan atau dihentikan
  Why: Membaca tidak bentrok dengan penyalaan; /list juga tanpa kunci
  If wrong: Tolak saat bot sedang diproses
- A4 [unseen] Kalau n baris yang diminta tidak muat satu pesan (layar 200 kolom), baris teratas dibuang dan judul menyebut jumlah yang tampil; batas 4000 karakter dihitung pada HTML mentah
  Why: Q1 meminta selalu muat satu pesan tanpa dibagi, tetapi 50 baris x 200 kolom bisa melebihi 4096; membuang baris teratas sama dengan laporan penyalaan
  If wrong: Ganti dengan memotong lebar tiap baris di logsReport (master/src/logs.ts)

## Decisions
- Lane standard: hanya membaca layar tmux, tidak mengubah sesi atau berkas; risikonya kebocoran token, dijaga Done when sensor
- Tidak solo dan tidak menunggu: ketiga tiket perintah master-bot (261112225303, 261112225306, 261112225307) sama-sama menambah COMMANDS dan handler di master/src/bot.ts serta CLAUDE.md, tetapi tidak saling membaca hasilnya; berjalan berdampingan, merge queue menyelesaikan bentrok
- 2026-11-13 moved to todo: Disetujui pemilik setelah jawaban tercatat
- Sensor /logs dijalankan pada seluruh layar dengan baris disambung sebelum diambil n baris terakhir, supaya token yang patah ke dua baris atau terpotong di atas jendela tetap tersensor; bentuk token yang menyeberang baris dibatasi 35 karakter setelah ':' agar kata di baris berikutnya tidak ikut hilang

## Handoff
Menambah /logs <nama> [n] (master/src/logs.ts, handler di bot.ts, COMMANDS bertambah 'logs'). Hanya membaca: has-session, capture-pane, bot.pid, .env bot; tanpa BotLocks. n 1-50 default 20, selain itu cara pakai. Bot tanpa sesi dijawab 'tidak hidup' dengan kata keadaan /list; sesi tanpa server plugin tetap tampil plus catatan. Balasan selalu satu pesan (HTML mentah <= 4000), baris teratas dibuang bila perlu. Sensor (maskScreen) pada layar yang barisnya disambung: token bot, token master, nilai .env semua bot (>= 8 karakter) beserta potongan 8+ karakternya, bentuk token, dan nilai KEY token. Opsi baru createMasterBot: capture (tes). Yang tidak boleh rusak: tidak ada token atau potongannya di balasan, dan /logs tidak mengubah sesi atau berkas.

## Review
- 2026-11-13 standard, round 1, at a5cf724: sent back.
  1: lulus. logs.test.ts dan logs-process.test.ts (main.ts sungguhan, tmux terpisah): n baris terakhir tak kosong dalam <pre>, satu pesan. k2 test -- bun test master/test/logs.test.ts master/test/logs-process.test.ts -> 20 pass 0 fail.
  2: lulus. parseLogsArgs menolak 0/51/abc/-1/+5/5.0/1e1/dua angka; default 20, maks 50; tes n 1-50 dan layar 200 kolom <&> <= 4096; proses sungguhan '/logs bot-hidup 51' -> cara pakai.
  3: lulus. Tes 'bot tidak hidup' (mati, plugin-only), 'sesi ada tetapi server plugin mati' dengan catatan, bot-mati di proses sungguhan.
  4: GAGAL. maskScreen hanya menyensor token utuh, bentuk <angka>:<20+>, dan nilai KEY=; POTONGAN token yang diketahui lolos. T=5001234:AAFakeBotTokenForLogsCommand_aaaaaaaaaaaa di state/.env. (a) Tepi atas pane: capture-pane hanya layar terlihat, lanjutan wrap tampil tanpa awalnya. tmux terpisah -x 40 -y 4, printf 'teks panjang dengan token T di dalamnya\na\nb' -> logsReport membalas '<pre>BotTokenForLogsCommand_aaaaaaaaaaaa di d...'. maskScreen([T.slice(20),'selesai'],[T]) -> 'enForLogsCommand_aaaaaaaaaaaa'. (b) Awalan <20 karakter setelah ':' (elipsis): 'lihat '+T.slice(0,20)+'…' tidak disensor. (c) Dipisah bingkai: ['│ '+T.slice(0,30)+' │','│ '+T.slice(30)+' │'] -> baris 2 '│ ommand_aaaaaaaaaaaa │'. Perbaikan: sensor juga potongan token bot/master yang cukup panjang (mis. >=8 karakter, juga bentuk ter-encode) di awal/akhir baris, plus tes (a), (b), (c).
  5: tes lulus, tetapi tidak ada tes potongan token tanpa pasangannya di layar (lihat 4).
  note: repo tidak punya skrip lint/CI. Socket tmux reviewer di /tmp (path scratchpad terlalu panjang untuk socket unix), sudah dihapus.
- 2026-11-13 standard, round 2, at 1042f31: passed.
  1: dibawa dari ronde 1 (handler dan alur logsReport tidak berubah); k2 test logs.test.ts + logs-process.test.ts -> 26 pass 0 fail.
  2: dibawa dari ronde 1 (parseLogsArgs dan batas 4000 tidak berubah); tes yang sama lulus.
  3: dibawa dari ronde 1 (cabang tidak hidup tidak berubah); tes yang sama lulus.
  4: dibuktikan ulang: tmux terpisah 40x4, baris atas lanjutan wrap token -> balasan '<token disembunyikan> di d'; ekor wrap, awalan elipsis, bingkai, ter-encode, ekor token 35 karakter tersensor di maskScreen; teks biasa utuh.
  5: 26 pass; tes potongan memeriksa setiap jendela 8 karakter token, plus bot-sempit di proses sungguhan.
  note: potongan <8 karakter sengaja lolos (FRAGMENT_MIN). cutoff.ts/main.ts dari merge main (261112235501). Tanpa lint/CI. Socket tmux reviewer di /tmp, sudah dihapus.
- 2026-11-13 conflict resolution, at 870a515: passed.
  Merge 870a515 menjaga kedua sisi: COMMANDS logs lalu allow/revoke/access (menu.test/run.test urutan 10), opsi capture dan accessHooks berdampingan, /logs tetap lewat lookup (kini delegasi ke lookupName 225307), CLAUDE.md memuat /logs dan /allow. Tidak ada tambahan lain.
