---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-15 19:51
---

## Background

Sesi Claude Code sebuah bot kadang berhenti di dialog yang menunggu jawaban dari keyboard, dan selama itu bot tidak membalas apa pun di Telegram. Kejadian nyata (2026-11-15, bot-02 di server): pemilik meminta bot pindah model, bot mengetik `/model opus` ke sesinya sendiri, lalu Claude Code menampilkan dialog "Switch model?" dengan pilihan "1. Yes, switch to Opus 5.5" dan "2. No, go back". Pesan pemilik berikutnya menumpuk tanpa jawaban. Pemilik baru tahu sebabnya lewat `/logs bot-02` di master-bot, dan tidak punya cara menjawab dialog itu tanpa masuk ke server dan membuka tmux.

Dialog seperti ini perilaku wajar Claude Code dan tidak bisa diperkirakan semuanya. Master-bot sudah bisa membaca layar bot (`/logs`) dan sudah mengirim tombol Enter ke sesi bot saat menyalakannya, tetapi pemilik belum bisa mengirim tombol sendiri.

Keputusan pemilik (2026-11-15): tambah perintah `/keys` di master-bot, dengan daftar tombol tertutup, dan balasannya berisi layar sesudah tombol dikirim.

## Request

Pemilik bisa mengirim urutan tombol ke sesi sebuah bot dari master-bot, misalnya `/keys bot-02 down down enter`, dan langsung melihat layar sesudahnya.

Rancangan yang disetujui pemilik:
- Bentuk: `/keys <nama> <tombol> [<tombol> ...]`. Nama bot wajib.
- Tombol yang diterima, daftar tertutup: `up`, `down`, `left`, `right`, `enter`, `esc`, `tab`, `space`, `backspace`, angka `0` sampai `9`, `y`, `n`. Tidak ada teks bebas dan tidak ada `ctrl-c`. Huruf besar-kecil tidak dibedakan.
- Paling banyak 20 tombol per perintah.
- Tombol dikirim berurutan dengan jeda pendek di antaranya, supaya layar Claude Code sempat mengikuti.
- Balasan: sekitar satu detik setelah tombol terakhir, master-bot membalas dengan tombol apa yang dikirim dan 20 baris terakhir layar bot yang tidak kosong, dengan aturan tampilan dan sensor token yang sama dengan `/logs`.
- Nama dicek seperti `/logs`: harus lolos aturan nama dan terdaftar; kalau sesi bot tidak hidup, dijawab bahwa bot tidak hidup dan tidak ada tombol yang dikirim.
- Selama bot itu sedang dinyalakan, dinyalakan ulang, dihentikan, atau dihapus, `/keys` ditolak dengan pesan yang sama seperti `/stop` (master-bot sendiri sedang membaca layar dan menekan Enter saat itu).
- Argumen yang salah (tanpa tombol, tombol di luar daftar, lebih dari 20) dijawab dengan cara pakai yang menyebut daftar tombol, dan tidak ada satu tombol pun yang dikirim, juga kalau hanya satu dari beberapa tombol yang salah.
- Seperti semua perintah master-bot, hanya pemilik di chat pribadinya yang dilayani.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot pemilik sedang berjalan). Jangan menulis apa pun di `~/.claude` atau `~/.claude.json`.
- Repo yang dipakai adalah `/Users/mirza/Workspace/bot-squad`. Jangan menyentuh salinan lama `/Users/mirza/Workspace/mirbot/bot-squad`.
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`).
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot pemilik di server tmux default jangan disentuh, dan jangan pernah mengirim tombol ke sana.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo. Jalankan `bun install --cwd plugin` di worktree supaya tes plugin tidak dilewati atau gagal.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] `/keys <nama> <tombol...>` mengirim tombol-tombol itu, dalam urutan yang ditulis, ke sesi bot itu saja; sesi bot lain tidak menerima apa pun.
- [x] Semua tombol di daftar tertutup diterima dan sampai sebagai tombol yang benar (panah sebagai panah, `enter` sebagai Enter, `esc` sebagai Escape, angka dan `y`/`n` sebagai karakternya), dibuktikan dengan program penerima di sesi tmux uji.
- [x] Tombol di luar daftar (termasuk `ctrl-c` dan teks bebas), tanpa tombol, atau lebih dari 20 tombol dijawab dengan cara pakai, dan tidak ada tombol yang dikirim.
- [x] Nama yang tidak sah atau tidak terdaftar ditolak seperti `/logs`; bot yang sesinya tidak hidup dijawab tidak hidup; tidak ada tombol yang dikirim di kedua kasus.
- [x] Selama bot sedang dinyalakan, dinyalakan ulang, dihentikan, atau dihapus, `/keys` untuk bot itu ditolak dengan pesan "sedang ..." dan tidak ada tombol yang dikirim.
- [x] Balasan memuat tombol yang dikirim dan layar bot sesudahnya, dengan sensor token yang sama dengan `/logs` (token bot, token master-bot, dan isi `.env` tidak pernah tampil).
- [x] `/help` dan menu master-bot memuat `/keys`.
- [x] Ada tes untuk butir-butir di atas, termasuk dengan master-bot sungguhan dan server tmux terpisah, dan seluruh tes tetap lulus.
- [x] Dokumentasi proyek mencatat perintah ini, daftar tombolnya, dan keputusan pemilik (tanpa teks bebas, tanpa `ctrl-c`).
- [ ] (owner) Setelah master-bot dijalankan dari kode baru: saat sebuah bot berhenti di dialog (misalnya minta bot pindah model), `/keys <nama> enter` menjawab dialognya, balasan menampilkan layar sesudahnya, dan bot kembali membalas di Telegram.

## Out of scope

- Mengetik teks bebas atau slash command ke sesi bot (tiket 261112230302).
- `ctrl-c` dan kombinasi tombol lain.
- Mendeteksi sendiri bahwa bot berhenti di dialog dan memberi tahu pemilik.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Decisions
- /keys memegang kunci BotLocks berlabel baru 'dikirimi tombol' sampai balasannya terkirim dan berjalan di latar belakang: /stop, /restart, /delete, /keys lain, dan penyalaan otomatis tidak bisa menyela urutan tombol, dan perintah lain tetap dilayani selama jeda antartombol.
- Bot yang sesi tmux-nya ada tetapi server plugin-nya mati tetap dikirimi tombol (seperti /logs yang tetap menampilkan layarnya): dialog bisa muncul justru di keadaan itu.

## Manual checks
- M1 [waiting] (item 10) 1. Hentikan master-bot yang berjalan (Ctrl+C), lalu dari root repo jalankan: bun run --cwd master start.
  2. Di chat master-bot kirim /help dan pastikan /keys ada.
  3. Di chat sebuah bot (misalnya bot-02) minta bot pindah model sampai bot berhenti membalas.
  4. Di master-bot kirim /logs bot-02 dan pastikan dialog 'Switch model?' terlihat.
  5. Kirim /keys bot-02 enter (atau down enter untuk pilihan kedua).
  6. Yang harus terlihat: balasan 'Tombol dikirim ke @... (bot-02): enter' dengan layar sesudahnya tanpa dialog, dan bot-02 kembali membalas pesan di Telegram.

## Handoff
Perintah baru /keys <nama> <tombol...> di master-bot (master/src/keys.ts, kait di bot.ts). Tombol dari daftar tertutup dipetakan ke argumen tetap tmux send-keys ke =<nama>:, satu per satu dengan jeda 200 ms; balasan memuat tombol terkirim dan layar lewat logsReport (LogsDeps mendapat budget opsional). BusyAction bertambah 'dikirimi tombol'. Yang tidak boleh rusak: kata dari pemilik tidak pernah sampai ke tmux; argumen salah, nama tak terdaftar, sesi mati, atau bot sedang diproses berarti nol tombol; sensor layar sama dengan /logs; tes yang membuat createMasterBot dan memanggil /keys wajib memberi sendKey tiruan supaya tidak menyentuh tmux default.

## Review
- 2026-11-15 standard, round 1, at f49b6f3: passed.
  1: Uji mandiri (main.ts sungguhan, tmux -S terpisah): 14 tombol tiba berurutan di penerima sesi uji-1, uji-10 menerima 0 byte; saat hanya uji-10 hidup, /keys uji-1 dan /keys uji dijawab 'tidak hidup' dan uji-10 tetap 0 byte (target persis, bukan awalan).
  2: Byte di penerima raw: panah 1b5b41/42/44/43, enter 0d, esc 1b, tab 09, space 20, backspace 7f, angka dan y/n sebagai karakternya (uji mandiri); keys-process.test.ts mencakup ke-21 tombol dan lulus.
  3: Uji mandiri: C-c, c-c, ctrl-c, Enter;, -t, --, F1, PPage, halo, a, q, 'enter F1', 'down C-c enter', 'enter ; kill-server', tanpa tombol, 21 tombol: semua dijawab cara pakai, kedua penerima 0 byte. Kata pemilik hanya jadi kunci Object.hasOwn ke daftar tetap.
  4: Uji mandiri: 'uji-1:', '=uji-1', 'UJI-1', 'uji-1.0', '-t' dijawab cara pakai; uji-2 'tidak terdaftar. Tidak ada tombol yang dikirim.'; bot terdaftar tanpa sesi 'tidak hidup (mati)'; 0 byte di semua penerima.
  5: keys.test.ts dijalankan dan lulus: BotLocks sungguhan untuk dinyalakan, dinyalakan ulang, dihentikan, dihapus memberi "'bot-01' sedang ..., coba lagi setelah selesai." tanpa satu pun sendKey; /restart yang ditahan juga menolak. Tmux di tes ini tiruan.
  6: Uji mandiri: balasan 'Tombol dikirim ke @u1_bot ('uji-1'): ...' lalu layar; bagian <pre> identik dengan /logs untuk layar yang sama; token bot, token master, nilai .env jadi <token disembunyikan>, tak ada potongan 8 karakter di sendMessage mana pun.
  7: Uji mandiri: /help memuat '/keys - ' dan ketiga setMyCommands ke Telegram tiruan memuat keys; menu.test.ts dan run.test.ts lulus.
  8: keys.test.ts dan keys-process.test.ts (main.ts sungguhan, tmux terpisah) lulus lewat k2 test, asersinya nyata (byte penerima, nol byte saat ditolak). Seluruh tes: catatan k2 lulus pada 0a38661b92, tidak diulang sesuai brief.
  9: Dengan membaca (dokumen): docs/master-bot.md memuat butir /keys, daftar tombol, batas 20, keputusan pemilik 2026-11-15 tanpa teks bebas dan tanpa ctrl-c; daftar perintah di CLAUDE.md dan docs diperbarui.
  10: (owner) M1 bisa diikuti dari awal dan berakhir pada yang harus terlihat; kepala balasan di M1 cocok dengan keluaran nyata.
  note: docs/master-bot.md menulis /stop, /restart, /delete, /keys lain 'menunggu' selama /keys berjalan; sebenarnya ditolak dengan 'sedang dikirimi tombol', tidak diantrekan. Hanya kata.
  note: Tidak ada pemeriksaan lain di repo selain bun test. Tidak ada sisa proses, sesi tmux, atau berkas uji.
