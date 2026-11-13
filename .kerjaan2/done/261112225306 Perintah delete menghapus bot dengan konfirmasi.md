---
type: feature
priority: low
lane: strict
labels: []
blocked_by: [261112225302]
related: []
touches: [master/src/bot.ts, master/src/delete.ts, master/src/stop.ts, master/src/registry.ts, master/src/busy.ts, master/src/config.ts, master/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Bot yang tidak dipakai lagi saat ini hanya bisa dihapus dengan mengedit daftar bot dan menghapus foldernya secara manual di server, seperti yang dilakukan pemilik untuk uji-03.

## Request

Pemilik bisa menghapus sebuah bot dari master-bot. Karena tidak bisa dibatalkan, penghapusan harus dikonfirmasi lebih dulu, dan hasil kerja bot di workspace tidak langsung hilang.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [x] /delete <nama> meminta konfirmasi lewat tombol sebelum melakukan apa pun; tanpa konfirmasi tidak ada yang berubah.
- [x] Setelah dikonfirmasi, bot dimatikan, dihapus dari daftar bot, dan foldernya tidak lagi berada di tempat bot aktif.
- [x] Seluruh folder `bots/<nama>` (workspace dan state) dipindah utuh dalam satu langkah ke `$BOT_SQUAD_HOME/archive/<nama>-<YYYYMMDD-HHMMSS>/`, tidak dihapus permanen dan tidak pernah dihapus otomatis (Q1); balasan menyebut di mana arsipnya.
- [x] Token bot tidak ikut tersimpan di arsip (`state/.env` dihapus sebelum folder dipindah).
- [x] Nama itu bisa didaftarkan lagi setelah dihapus.
- [x] Dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Bentuk arsip /delete? Opsi A (rekomendasi): seluruh folder bots/<nama> dipindah (rename, satu langkah) ke ~/.bot-squad/archive/<nama>-<YYYYMMDD-HHMMSS>/ setelah state/.env dihapus; workspace, access.json, dan plugin.log ikut tersimpan, arsip tidak pernah dihapus otomatis. Opsi B: hanya workspace yang diarsipkan, folder state dihapus permanen. Opsi C: dikemas jadi satu berkas .tar.gz di archive/ lalu folder asli dihapus.
  → Pindah folder utuh (Recommended). (owner, 2026-11-13)

## Assumptions
- A1 [confirmed] Tombol konfirmasi berisi Hapus dan Batal, sekali pakai, berlaku 5 menit; tombol kedaluwarsa atau sudah dipakai dijawab 'kedaluwarsa' tanpa mengubah apa pun; hanya callback dari pemilik di chat pribadinya (isOwnerUpdate)
  Why: Pagar konfirmasi mirza-bots dan aturan pemilik saja
  If wrong: Ubah masa berlaku
  Confirmed by owner, 2026-11-13
- A2 [confirmed] Penghapusan memakai BotLocks yang sama (label 'dihapus'), langkah henti dari stop.ts; kalau bot tidak bisa dihentikan bersih, penghapusan dibatalkan dan registry serta folder tidak berubah; entri registry dihapus lewat writeRegistry setelah folder dipindah
  Why: Sama dengan /restart yang batal kalau bot lama tidak mati bersih (Q2 261112225302)
  If wrong: Hapus walau tersisa proses
  Confirmed by owner, 2026-11-13
- A3 [confirmed] Transkrip ~/.claude/projects dan trust di ~/.claude.json tidak disentuh; token di BotFather tetap berlaku (balasan menyarankan revoke di @BotFather kalau perlu)
  Why: Di luar folder bot-squad; mencabut token butuh BotFather
  If wrong: Tambah pembersihan transkrip
  Confirmed by owner, 2026-11-13
- A4 [confirmed] Nama folder arsip memakai waktu lokal server; kalau dua penghapusan nama yang sama jatuh di detik yang sama, yang kedua diberi akhiran -2
  Why: Sama dengan plugin.log yang memakai waktu lokal; akhiran mencegah arsip tertimpa
  If wrong: Ganti archiveStamp ke UTC di master/src/delete.ts
  Confirmed by owner, 2026-11-13
- A5 [confirmed] Langkah yang gagal di tengah tidak digulung balik: kalau rename gagal, token sudah terhapus dan laporan menyebutnya; kalau registry gagal ditulis, folder sudah di arsip dan /delete lagi menghapus entrinya
  Why: Tiket mewajibkan .env dihapus sebelum dipindah; mengembalikan token berarti menyimpan salinannya
  If wrong: Simpan .env sementara di memori dan tulis ulang kalau rename gagal
  Confirmed by owner, 2026-11-13

## Decisions
- Lane strict: menghapus data bot dan entri registry, tidak bisa dibatalkan kalau salah
- Tidak solo dan tidak menunggu: ketiga tiket perintah master-bot (261112225303, 261112225306, 261112225307) sama-sama menambah COMMANDS dan handler di master/src/bot.ts serta CLAUDE.md, tetapi tidak saling membaca hasilnya; berjalan berdampingan, merge queue menyelesaikan bentrok
- 2026-11-13 moved to todo: Disetujui pemilik setelah jawaban tercatat
- Red-proof: masa berlaku tombol, tombol sekali pakai, tombol Batal, tombol harus dari pertanyaan yang dikirim, cek henti bersih sebelum arsip, hapus state/.env sebelum pindah, hapus entri registry, tolak /delete saat bot sibuk, kunci 'dihapus', tolak bots/<nama> symlink, akhiran arsip detik sama, cek ulang terdaftar saat tombol ditekan; all red
- Arsip ditulis di dalam serialized() registry supaya /register nama yang sama tidak menyela; cap waktu memakai waktu lokal server, dengan akhiran -2, -3 kalau detiknya sama supaya arsip lama tidak tertimpa (rename ke folder kosong menimpa diam-diam di POSIX)
- Red-proof: cek identitas tombol saat ditekan (seluruhnya, telegramId saja, createdAt saja), cek identitas di archiveBot, buang tombol lain setelah berhasil, masa berlaku, sekali pakai, Batal, henti bersih, hapus .env, hapus entri registry, tolak saat sibuk, kunci 'dihapus', symlink, akhiran, cek ulang terdaftar; all red. Pagar 'tidak terdaftar saat bertanya' tetap hijau karena tidak terjangkau, jadi dihapus
- Tombol /delete mengikat telegramId dan createdAt entri registry; createdAt ikut supaya token yang sama didaftarkan ulang dengan nama sama juga tidak cocok. Cek diulang di dalam serialized() archiveBot

## Handoff
/delete <nama> di master/src/bot.ts (COMMANDS, perintah, callbackQuery del:yes|no:<16hex>) dan master/src/delete.ts (archiveBot). Tidak ada yang berubah sebelum Hapus; tombol sekali pakai, 5 menit, di Map per createMasterBot, dan terikat pada telegramId+createdAt entri registry, dicek saat ditekan dan lagi di archiveBot. Setelah berhasil semua tombol nama itu dibuang. Hapus: kunci BotLocks 'dihapus', opts.stop; tidak bersih berarti batal. Di dalam serialized(): hapus state/.env, rename bots/<nama> ke archive/<nama>-<YYYYMMDD-HHMMSS>, hapus entri. Jangan menyalin-lalu-hapus atau menghapus arsip. Handler callback_query umum harus tetap terakhir.

## Review
- 2026-11-13 strict, round 1, at 5b8dd4a: sent back.
  1 (BLOCKING, bug): pendingDeletes di master/src/bot.ts hanya menyimpan { name, expires }; saat Hapus, bot apa pun yang kini terdaftar dengan nama itu dihapus. Reproduksi (tes tambahan di salinan): /delete dl-a (simpan tombol 1); /delete dl-a lalu Hapus tombol 2; /register dl-a <token baru> (@dl_baru_bot); tekan tombol 1 (< 5 menit). Hasil: calls [stop,launch,stop], laporan 'Bot @dl_baru_bot (dl-a) dihapus ... archive/dl-a-20261113-090807-2', registry tanpa dl-a. Bot baru dimatikan, tokennya dihapus, diarsipkan tanpa pernah dikonfirmasi (pertanyaan menyebut @dl_a_bot).
  1 (perbaikan): simpan telegramId (atau createdAt) di pendingDeletes, tolak dengan DELETE_EXPIRED kalau entri registry sekarang berbeda; buang juga semua tombol tertunda untuk nama itu setelah penghapusan berhasil. Tambah tes untuk skenario di atas. Instans lain kelas ini tidak ditemukan (Batal dan cek busy tidak merusak).
  2: terpenuhi menurut delete.test.ts (stop dipanggil, entri dan bots/dl-a hilang, batal kalau tidak bersih: pidsLeft/sessionLeft/error/throw). Uji tmux nyata tidak saya ulang.
  3: terpenuhi: snapshot arsip sama, inode sama (rename), archive/ 0700, akhiran -2, path di balasan.
  4: terpenuhi; mutasi hapus rmSync state/.env -> suite penuh merah (2 tes).
  5: terpenuhi: /register dl-a setelah /delete diterima, arsip lama utuh.
  6: mutasi cek kedaluwarsa (if (!p) saja) -> suite merah (1 tes). Celah: tidak ada tes tombol lama setelah daftar ulang (lihat 1).
  note: delete.test.ts 20x berturut-turut lewat k2 test: 20/20 lulus; suite penuh 2x hanya gagal di tes yang dimutasi. Kegagalan answerCallbackQuery yang dilaporkan tidak tereproduksi.
  note: status tidak ditulis 'stopped' sebelum henti; crash master-bot di antara henti dan arsip membuat penyalaan otomatis menghidupkan bot itu lagi. Tidak blocking. Repo tidak punya lint/CI selain bun test.
- 2026-11-13 strict, round 2, at b7a05bf: passed.
  1: tombol kini mengikat telegramId+createdAt (cek saat ditekan dan di archiveBot, tombol lain dibuang). Skenario ronde 1 kini jadi tes dan lulus. Mutasi tiap pagar (cek bot.ts, cek archiveBot, pembuangan tombol) -> delete.test.ts merah (2, 2, 1 tes).
  2: dibawa dari ronde 1; kode henti tidak berubah, hanya cek identitas sebelum klaim kunci.
  3: dibawa dari ronde 1; jalur rename dan arsip tidak berubah.
  4: dibawa dari ronde 1 (mutasi rmSync .env merah); kode tidak berubah.
  5: dibawa dari ronde 1; tes daftar ulang tetap lulus.
  6: delete.test.ts 31 tes, 10x lewat k2 test: 10/10 lulus; semua mutasi di atas merah.
  note: status tidak ditulis 'stopped' sebelum henti (ronde 1) masih ada, tidak blocking. Tidak ada lint/CI selain bun test.
