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

- [ ] `/keys <nama> <tombol...>` mengirim tombol-tombol itu, dalam urutan yang ditulis, ke sesi bot itu saja; sesi bot lain tidak menerima apa pun.
- [ ] Semua tombol di daftar tertutup diterima dan sampai sebagai tombol yang benar (panah sebagai panah, `enter` sebagai Enter, `esc` sebagai Escape, angka dan `y`/`n` sebagai karakternya), dibuktikan dengan program penerima di sesi tmux uji.
- [ ] Tombol di luar daftar (termasuk `ctrl-c` dan teks bebas), tanpa tombol, atau lebih dari 20 tombol dijawab dengan cara pakai, dan tidak ada tombol yang dikirim.
- [ ] Nama yang tidak sah atau tidak terdaftar ditolak seperti `/logs`; bot yang sesinya tidak hidup dijawab tidak hidup; tidak ada tombol yang dikirim di kedua kasus.
- [ ] Selama bot sedang dinyalakan, dinyalakan ulang, dihentikan, atau dihapus, `/keys` untuk bot itu ditolak dengan pesan "sedang ..." dan tidak ada tombol yang dikirim.
- [ ] Balasan memuat tombol yang dikirim dan layar bot sesudahnya, dengan sensor token yang sama dengan `/logs` (token bot, token master-bot, dan isi `.env` tidak pernah tampil).
- [ ] `/help` dan menu master-bot memuat `/keys`.
- [ ] Ada tes untuk butir-butir di atas, termasuk dengan master-bot sungguhan dan server tmux terpisah, dan seluruh tes tetap lulus.
- [ ] Dokumentasi proyek mencatat perintah ini, daftar tombolnya, dan keputusan pemilik (tanpa teks bebas, tanpa `ctrl-c`).
- [ ] (owner) Setelah master-bot dijalankan dari kode baru: saat sebuah bot berhenti di dialog (misalnya minta bot pindah model), `/keys <nama> enter` menjawab dialognya, balasan menampilkan layar sesudahnya, dan bot kembali membalas di Telegram.

## Out of scope

- Mengetik teks bebas atau slash command ke sesi bot (tiket 261112230302).
- `ctrl-c` dan kombinasi tombol lain.
- Mendeteksi sendiri bahwa bot berhenti di dialog dan memberi tahu pemilik.
