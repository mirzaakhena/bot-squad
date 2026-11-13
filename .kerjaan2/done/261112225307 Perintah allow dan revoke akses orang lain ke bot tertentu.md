---
type: feature
priority: low
lane: strict
labels: []
blocked_by: []
related: []
touches: [master/src/bot.ts, master/src/access-admin.ts, master/src/list.ts, master/test/, CLAUDE.md]
created: 2026-11-12 22:53
---

## Background

Saat ini setiap bot hanya melayani pemilik. Pemilik ingin bisa mengizinkan orang lain memakai bot tertentu saja (CLAUDE.md, bagian Pengguna). Bot berjalan dengan izin bebas, jadi siapa pun yang diizinkan bisa menyuruh bot menjalankan apa saja di server.

## Request

Pemilik bisa menambah dan mencabut akses orang lain ke satu bot tertentu dari master-bot, tanpa memberi mereka akses ke master-bot atau bot lain.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara yang berisi SALINAN, tanpa symlink; cek `find <folder> -type l` sebelum menulis ke dalamnya. Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S`. Pemilik sedang menjalankan master-bot, uji-03, dan uji-01 di server tmux default: jangan disentuh.
- Tanpa token asli.
- Berkas sementara di scratchpad sesi, di subfolder ber-ID tiket ini, bukan di repo.
- Kalau pengaman izin menolak kill, laporkan dan jangan cari jalan memutar.

## Done when

- [x] /allow <nama> <user_id> membuat orang itu bisa mengobrol dengan bot itu saja; bot lain dan master-bot tetap menolaknya.
- [x] /revoke <nama> <user_id> mencabut akses itu, dan pesan orang itu setelahnya diabaikan.
- [x] Pemilik tidak bisa mencabut aksesnya sendiri dari bot.
- [x] `/access <nama>` menampilkan daftar user_id yang punya akses ke bot itu dengan pemilik ditandai, dan `/list` menampilkan jumlah orang yang punya akses per bot (Q1).
- [x] Balasan /allow mengingatkan bahwa orang itu bisa menjalankan perintah apa pun di server lewat bot, dan juga bisa memakai perintah plugin di chat bot itu (`/context` menampilkan kuota akun Claude pemilik, `/status`), sama dengan pemilik (Q2); plugin tidak diubah.
- [x] Dibuktikan dengan tes otomatis.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Cara melihat siapa saja yang punya akses ke sebuah bot? Opsi A (rekomendasi): perintah /access <nama> yang menampilkan daftar user_id di allowFrom bot itu, pemilik ditandai, dan blok yang sama ditambahkan singkat di /list (jumlah orang). Opsi B: hanya /access <nama>. Opsi C: hanya lewat /list (satu baris per bot dengan semua user_id).
  → /access + jumlah di /list (Recommended). (owner, 2026-11-13)
- Q2 [answered] Orang yang diizinkan memakai bot juga bisa memakai perintah plugin di chat bot itu (/context menampilkan kuota akun Claude pemilik, /status). Opsi A (rekomendasi): ya, sama dengan pemilik, karena mereka toh bisa menjalankan apa saja di server lewat bot, jadi menyembunyikan kuota tidak melindungi apa pun; balasan /allow menyebutnya. Opsi B: /context dan /status hanya untuk pemilik (perlu ubah plugin/context.ts dan plugin/server.ts). Opsi C: tunda keputusan, tiket ini tidak menyentuh plugin dan perilaku sekarang (semua allowFrom) dicatat di CLAUDE.md.
  → Sama dengan pemilik (Recommended). (owner, 2026-11-13)

## Assumptions
- A1 [unseen] access.json ditulis atomik (berkas sementara + rename, 0600) dan semua kolom lain dipertahankan; berlaku tanpa restart karena plugin membaca access.json setiap pesan. Penting: plugin memindahkan access.json yang rusak dan kembali ke dmPolicy pairing, jadi penulisan setengah jadi tidak boleh terjadi
  Why: plugin/server.ts readAccessFile/saveAccess
  If wrong: -
- A2 [unseen] user_id harus bilangan bulat positif; /allow untuk ID yang sudah ada dan /revoke untuk ID yang tidak ada dijawab tanpa mengubah berkas; bot harus terdaftar, status apa pun (juga stopped); dmPolicy tetap allowlist
  Why: Validasi input dan idempoten, seperti /stop
  If wrong: Tolak bot yang tidak aktif

## Decisions
- Lane strict: memberi orang lain akses ke bot yang berjalan bebas izin di server
- Tidak solo dan tidak menunggu: ketiga tiket perintah master-bot (261112225303, 261112225306, 261112225307) sama-sama menambah COMMANDS dan handler di master/src/bot.ts serta CLAUDE.md, tetapi tidak saling membaca hasilnya; berjalan berdampingan, merge queue menyelesaikan bentrok
- 2026-11-13 moved to todo: Disetujui pemilik setelah jawaban tercatat
- Red-proof: pengaman dirusak satu per satu dan dipulihkan dari salinan — tolak cabut pemilik, aturan user_id (regex dan safe integer), aturan nama di /allow /revoke, bot harus terdaftar, allowFrom harus daftar teks, access.json harus objek, tidak menulis untuk ID yang sudah ada/tidak ada, penulisan atomik (rename dan kait sebelum rename), mode 0600, access.json yang tidak ada tidak dibuat; all red
- access.json yang tidak ada ditolak (tidak dibuat oleh /allow): launch.ts yang membuatnya saat start, jadi master-bot tidak punya dua tempat yang membuat berkas itu
- Penulisan access.json diantrekan lewat serialized() registry.ts supaya /allow dan /revoke bersamaan tidak saling menimpa; penulisan oleh plugin sendiri (pairing, skill access) tidak ikut terkunci, tetapi bot master-bot memakai dmPolicy allowlist sehingga plugin tidak menulisnya

## Handoff
Perintah baru master-bot /allow, /revoke, /access (master/src/allow.ts, disambungkan di bot.ts; lookup nama dipecah jadi lookupName). Hanya allowFrom di state/access.json bot yang disebut yang berubah, ditulis atomik (tmp wx 0600, fsync, rename) lewat serialized() registry.ts; kolom lain dan dmPolicy dipertahankan; berkas yang tidak ada, rusak, atau allowFrom bukan daftar teks tidak pernah ditimpa, karena plugin memindahkan access.json rusak dan jatuh ke pairing. Pemilik tidak bisa dicabut (changeAccess). /list menambah baris 'akses: N orang' di akhir blok tiap bot. Yang tidak boleh rusak: penjaga isOwnerUpdate master-bot, tidak menyentuh bot lain, dan COMMANDS kini sembilan (run.test/menu.test memeriksa urutannya).

## Review
- 2026-11-13 strict, round 1, at aee541b: passed.
  1: allow.test.ts e2e (dua server plugin sungguhan, tidak dilewati: 73 pass, 0 skip di salinan) membuktikan teman diteruskan di bot-01 dan dibuang di bot-02; tes 'orang yang diizinkan tetap ditolak master-bot'. Rusak: /allow ikut menulis semua bot -> 5 merah (termasuk e2e); isOwnerUpdate menerima teman -> merah.
  2: e2e setelah /revoke: teman 'dibuang' di plugin.log dan tidak sampai ke Claude, pemilik tetap diteruskan. Rusak: filter revoke tidak menghapus -> 3 merah (unit, master-bot, e2e).
  3: changeAccess menolak revoke ID pemilik sebelum membaca berkas; tes cek isi dan mtime tetap di semua bot. Rusak: hapus penjaga -> 3 merah (termasuk e2e).
  4: /access menandai '(pemilik)', hanya membaca (isi+mtime); /list menambah 'akses: N orang'. Rusak: hapus baris akses di list.ts -> 2 merah; hapus penanda pemilik -> 1 merah.
  5: allowWarning memuat 'perintah apa pun di server', /context (kuota akun Claude pemilik), /status, 'sama dengan pemilik'; git diff main...HEAD -- plugin kosong. Rusak: buang teks /context -> 1 merah.
  6: bun test penuh lulus menurut brief pada e06c129591; allow.test.ts 73 pass di salinan scratchpad. Tidak ada cek lain dari repo selain bun test.
  note: CLAUDE.md diperbarui sesuai perilaku; tidak ada pelanggaran aturan proyek yang ditemukan. Uji di salinan scratchpad, tanpa ~/.bot-squad, tanpa tmux, tanpa token asli.
- 2026-11-13 conflict resolution, at bb9ffa1: passed.
  Gabungan bb9ffa1 (=HEAD) bersih: diff dari main = diff tiket persis, diff dari aee541b = 261112235501 persis; hunk CLAUDE.md memuat baris cutoff main dan perintah /allow /revoke /access. Land exit 1 tak tereproduksi: 4 berkas tes peka waktu 3x di salinan, 123 pass tiap kali.
