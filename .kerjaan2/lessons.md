# Lessons

What earlier tickets learned about this project. Newest last; k2 keeps the last 60.

- Peringatan 'plugin:<x>@inline · plugin not installed' di layar awal Claude Code itu palsu untuk --plugin-dir; cek 'Channel notifications registered' di --debug-file
- Trust folder Claude Code diwariskan dari folder induk; dialog trust dan bypass default-nya 'No, exit', jadi jangan kirim Enter buta ke sesi tmux
- Pesan stderr server plugin (mis. 'polling as @user') tidak masuk --debug-file maupun mcp-logs Claude; rekam lewat shim bun di PATH yang men-tee stderr sebelum start-bot.sh
- k2 test menggabungkan argumen tanpa kutip, jadi bash -c "..." pecah; tulis perintah ke skrip di scratchpad lalu jalankan skrip itu
- Error jaringan grammY (HttpError) membawa URL api.telegram.org/bot<token>/...; promise grammY yang tidak ditangkap akan mencetak token di stack trace
- Tes master-bot memakai master/test/fake-telegram.ts (Bun.serve + client.apiRoot); jangan pernah memakai token asli di tes
- bun install paralel di satu folder gagal (EEXIST pada .bin) walau node_modules lengkap; plugin bot-squad tidak boleh install sendiri, start-bot.sh yang install dengan kunci
- Di zsh, argumen '=nama' tanpa kutip (mis. tmux -t =uji-01) diekspansi jadi path perintah; selalu kutip '=uji-01'
- createMasterBot wajib diberi dataDir; di tes arahkan ke folder sementara, dan tulis registry.json hanya lewat writeRegistry di dalam serialized()
- startFakeTelegram menerima argumen ketiga (token -> jawaban getMe) untuk token bot lain; stray.count menghitung permintaan dengan token tak dikenal
- Bukti 'server plugin ikut mati' setelah kill -9 claude harus dicek beberapa detik kemudian dengan ps (pid, ppid, %CPU), bukan dari hilangnya bot.pid: shutdown menghapus bot.pid sebelum proses benar-benar keluar.
- Fake sleep di tes loop tunggu harus melempar error setelah melewati batas jauh, kalau tidak loop tanpa henti membuat bun test hang tanpa timeout
- tmux server mengambil PATH dari klien pertama; untuk menguji jalur gagal, taruh claude tiruan di depan PATH saat belum ada server tmux, lalu matikan sesinya dengan kill-session (bukan kill-server)
- Di Telegram tiruan, penangan khusus menerima (params, next); panggil next() untuk tetap memakai perilaku bawaan, mis. agar state menu tercatat
- Tes error jaringan grammY tanpa memutus jaringan: beri client.fetch pembungkus yang melempar TypeError untuk metode tertentu; grammY mengubahnya jadi HttpError
- Waktu pesan masuk ke bot bisa diukur dari transkrip ~/.claude/projects/<workspace>/*.jsonl: atribut ts di tag <channel> (tanggal Telegram) dibanding timestamp catatan
- Proses main.ts sungguhan bisa diarahkan ke Telegram tiruan dengan env MASTER_BOT_API_ROOT; run() in-process memegang kunci master.pid dengan pid proses tes (dianggap basi karena pid sendiri)
- Plugin WhatsApp pemilik juga berjalan sebagai 'bun server.ts' dengan baris perintah identik; bedakan server plugin lewat CLAUDE_PLUGIN_ROOT di environment, jangan lewat ps args
- Folder scratchpad lama (ws-probe1/home) berisi symlink ke data asli ~/.bot-squad; selalu buat rumah uji baru dan cek find -type l sebelum menulis ke dalamnya
- Tes proses master sungguhan dengan tmux: TMUX_TMPDIR sementara di env proses, dan semua perintah tmux di tes memakai -S <TMUX_TMPDIR>/tmux-<uid>/default supaya kill-server hanya mengenai server uji (contoh: master/test/shutdown.test.ts)
- Di plugin, onStart mengatur attempt=0, jadi percobaan ulang pertama setelah 409 di tengah jalan langsung (0s); plugin.log mencatatnya apa adanya sebagai polling-gagal ulang=0s
- Uji server plugin tanpa Telegram: BOT_SQUAD_TELEGRAM_API_ROOT=http://127.0.0.1:<port> + MCP initialize di stdin (plugin/test/plugin-log.test.ts); /start tiruan butuh entities bot_command
- Tes yang men-spawn main.ts sebaiknya memberi HTTPS_PROXY=http://127.0.0.1:9 dan NO_PROXY=localhost,127.0.0.1,::1,[::1] supaya bug yang lolos ke api.telegram.org gagal lokal; Bun mencocokkan NO_PROXY untuk IPv6 dengan bentuk [::1]
- Scratchpad dipakai bersama semua agen: simpan berkas sementara di subfolder ber-ID tiket, jangan nama generik (bak.ts). 261112223102 sempat meng-commit tes milik 261112230301 karena itu.
