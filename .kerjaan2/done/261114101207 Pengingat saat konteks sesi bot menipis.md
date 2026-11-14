---
type: feature
priority: low
lane: standard
labels: []
blocked_by: []
related: []
touches: [plugin/server.ts, plugin/context.ts, plugin/reminder.ts, plugin/test/reminder.test.ts, CLAUDE.md]
created: 2026-11-14 10:12
---

## Background

Sesi Claude sebuah bot bisa berjalan lama sampai konteksnya hampir penuh, dan pemilik baru tahu kalau mengetik /context. Di mirza-bots, saat konteks terpakai melewati ambang (400 ribu token di sana), pesan berikutnya ke AI membawa pengingat. Pengingat itu hanya menempel pada pesan yang memang datang (tidak membangunkan AI sendiri) dan hilang sendiri begitu kondisinya tidak lagi terpenuhi. Keputusan memulai percakapan baru tetap milik pemilik. Data konteks sudah tersedia di bot-squad lewat statusline yang dipakai /context.

Rujukan: /Users/mirza/Workspace/mirza-bots/README.md (bagian "Fitur") dan kode cc-plugin di folder yang sama. Dipilih pemilik pada 2026-11-14 dari daftar fitur mirza-bots yang tidak mengetik ke sesi Claude.

## Request

Saat konteks sesi bot menipis, Claude diingatkan supaya bisa memberi tahu pemilik, tanpa pemilik harus memeriksa sendiri.

Aturan uji yang wajib (dari pemilik, berlaku untuk worker dan reviewer):
- Jangan membaca atau menulis `~/.bot-squad` (data asli dan token pemilik; bot-01..03 pemilik sedang berjalan).
- Uji dengan HOME dan BOT_SQUAD_HOME sementara berisi SALINAN, tanpa symlink (cek `find <folder> -type l`). Insiden sebelumnya: `.env` master asli pernah terpotong kosong lewat symlink di scratchpad.
- Server tmux terpisah lewat TMUX_TMPDIR atau `tmux -S` (soket boleh di `/tmp/k2-<id tiket>-*`, dihapus sesudahnya). Master-bot dan bot-01..03 pemilik di server tmux default jangan disentuh.
- Tanpa token asli dan tanpa kredensial akun Claude; Telegram tiruan untuk semua uji.
- Berkas sementara di scratchpad sesi, subfolder ber-ID tiket, bukan di repo.
- Kalau pengaman izin menolak kill atau rm, laporkan dan jangan cari jalan memutar.

## Done when

- [x] Saat pemakaian konteks sesi bot melewati ambang (di atas 400 ribu token terpakai ATAU di atas 50% jendela konteks, mana yang lebih dulu), pesan pemilik berikutnya yang diteruskan ke Claude membawa pengingat bahwa konteks menipis beserta angkanya.
- [x] Pengingat tidak pernah dikirim sendirian (tidak membangunkan Claude tanpa pesan pemilik) dan berhenti sendiri setelah konteks kembali di bawah ambang (misalnya setelah percakapan baru).
- [x] Kalau data konteks tidak tersedia atau basi, tidak ada pengingat yang salah.
- [x] Ada tes otomatis untuk di atas ambang, di bawah ambang, dan data tidak ada.
- [x] CLAUDE.md menjelaskan perilaku dan ambangnya.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Ambang pengingat konteks menipis? Payload statusline memberi total_input_tokens dan context_window_size; jendelanya bisa 200 ribu atau 1 juta token. A (rekomendasi): menyala kalau terpakai di atas 400 ribu token ATAU di atas 50% jendela, mana yang lebih dulu, sehingga tetap berguna di jendela 200 ribu (menyala di 100 ribu). B: persis mirza-bots, di atas 400 ribu token saja (tidak pernah menyala di jendela 200 ribu). C: persentase saja, di atas 50% jendela (sebutkan kalau mau angka lain, mis. 70%).
  → 400rb token atau 50% (Recommended) — opsi A: menyala di atas 400 ribu token terpakai ATAU di atas 50% jendela, mana yang lebih dulu. (owner, 2026-11-14)

## Assumptions
- A1 [confirmed] Pengingat di meta (atribut context_reminder: imbauan plus angka terpakai/jendela), bukan di content, supaya tidak bisa dipalsukan dengan mengetik; instruksi MCP menjelaskannya dan bahwa keputusan percakapan baru milik pemilik. Hanya pada pesan yang diteruskan (bukan perintah plugin, izin, atau dibuang). Angka dari status.json lewat readCapturedStatus (plugin/context.ts) saat pesan masuk. Tidak tersedia = berkas tidak ada, rusak, atau angka null; umur berkas bukan syarat (sesi menganggur tidak berubah konteksnya; status.json lama dihapus saat start).
  Why: README mirza-bots bagian Pengingat mesin; CLAUDE.md bagian /context.
  If wrong: Pindahkan ke content atau tambah batas umur.
  Confirmed by owner, 2026-11-14
- A2 [confirmed] Data dianggap tidak pasti kalau used_percentage bukan angka; pengingat tidak menyala walau total_input_tokens besar. Sesudah /clear pengingat hilang karena Claude Code menggambar ulang statusline saat sesi baru mulai (menurut dokumentasi statusline), tanpa cek session_id seperti mirza-bots.
  Why: Dokumentasi: total_input_tokens = token di jendela sekarang, used_percentage null di awal sesi dan sesudah /compact; plugin bot-squad tidak tahu session_id sesi berjalan.
  If wrong: Tambah hook SessionStart yang mencatat session_id lalu bandingkan dengan payload.session_id di context-reminder.ts.
  Confirmed by owner, 2026-11-14

## Decisions
- Lane standard: menambah teks pengingat ke notifikasi masuk, hanya membaca status.json. Perubahannya kecil di titik notifikasi, jadi jalan berdampingan dengan tiket lain tanpa blocked_by.
- Uji plugin dilewati diam-diam tanpa plugin/node_modules: worker wajib menjalankan 'bun install --cwd plugin' di worktree sebelum k2 test dan memastikan tes barunya benar-benar jalan (bukan skip). Logika baru diletakkan di modul sendiri (seperti plugin/context.ts, plugin/log.ts) dengan kait sekecil mungkin di server.ts supaya merge antar tiket ringan.
- 2026-11-14 moved to todo: Pertanyaan dijawab pemilik; urutan dan blocked_by disetujui

## Handoff
Modul baru plugin/context-reminder.ts membaca <state>/status.json setiap pesan diteruskan dan, kalau total_input_tokens di atas 400 ribu atau terpakai di atas 50% jendela, menambah atribut meta context_reminder (imbauan plus angka) pada notifikasi claude/channel. Kait di server.ts hanya satu baris spread di meta handleInbound plus satu paragraf instruksi MCP. Yang tidak boleh rusak: pengingat hanya di meta (bukan content), tidak pernah notifikasi sendiri, used_percentage null berarti diam, dan contextReminderMeta tidak pernah melempar supaya pesan tetap sampai. Tiket lain yang mengubah meta atau instruksi di server.ts cukup mempertahankan baris spread itu.

## Review
- 2026-11-14 standard, round 1, at e046891: passed.
  1: k2 test di salinan HEAD (plugin/node_modules terpasang, HOME sementara): 4 berkas tes, 13 pass, 0 skip. Tes server: 130k/200k dan 450k/1M -> meta context_reminder berangka, content utuh; satuan: 412,3k/1M dan 120k/200k menyala, tepat 400k/50% tidak.
  2: tes server: status.json di atas ambang tanpa pesan -> notifikasi tetap 3, /context tidak menambah; used_percentage null -> pesan berikutnya tanpa atribut. Kait hanya di notifikasi handleInbound (dibaca).
  3: tes: tidak ada, rusak, payload kosong, used_percentage null/string/NaN -> tanpa pengingat, pesan tetap sampai. Basi: status.json dihapus saat start (master/src/statusline.ts:97, dibaca); umur berkas bukan syarat (A1/A2).
  4: context-reminder.test.ts dan context-reminder-server.test.ts mencakup di atas, di bawah/tepat ambang, dan data tidak ada; asersi pada angka hasil kode, bisa gagal.
  5: CLAUDE.md bagian 'Pengingat konteks menipis' menjelaskan ambang 400 ribu/50%, pemicu keadaan, kapan tidak menyala, dan tesnya (dibaca).
  note: tanpa AGENTS.md dan tanpa skrip/CI selain bun test. A2 (hilang sesudah /clear karena statusline digambar ulang) belum dibuktikan dengan Claude Code sungguhan; A1/A2 belum dilihat pemilik.
- 2026-11-14 conflict resolution, at 52ac0c3: passed.
  Merge 52ac0c3 utuh: git diff 398375d HEAD = hanya 5 berkas tiket ini (+393, sama dengan e046891); lampiran 101203 dan outbound 101205 tetap. Spread dan instruksi context_reminder ada di samping attachment_too_large. Salinan + bun install --cwd plugin: 5 berkas tes terkait, 17 pass, 0 skip.
