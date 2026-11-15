# bot-squad

> **Fork notice.** This plugin is a modified fork of the official Telegram plugin from
> [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official),
> `external_plugins/telegram` v0.0.7 (commit `e0ab6e5`), licensed under Apache-2.0 (see [LICENSE](./LICENSE)).
> Changes made in this fork: the plugin and its MCP server are renamed from `telegram` to
> `bot-squad`, log and error messages say `bot-squad channel`, and the default state
> directory is `~/.claude/channels/bot-squad` instead of `~/.claude/channels/telegram`.
> The upstream `access` and `configure` commands and the code-based sign-up flow for
> unknown senders are removed: the token and the allowlist are written by master-bot
> (ticket 261115085701). The `TELEGRAM_*` environment variables are unchanged. The full
> diff against upstream is in this repository's git history.

Connect a Telegram bot to your Claude Code with an MCP server.

The MCP server logs into Telegram as a bot and provides tools to Claude to reply, react, or edit messages. When you message the bot, the server forwards the message to your Claude Code session.

## Prerequisites

- [Bun](https://bun.sh) — the MCP server runs on Bun. Install with `curl -fsSL https://bun.sh/install | bash`.

## Setup

In bot-squad nobody sits at the bot's terminal. The owner does everything from
**master-bot**, the bot-squad control panel on Telegram:

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy its token.
2. Send `/register <name> <token>` to master-bot. It writes the token to
   `<state>/.env` (`TELEGRAM_BOT_TOKEN=...`, mode 0600), writes `<state>/access.json`
   with the owner as the only allowed sender, and starts a Claude Code session with
   this plugin loaded as a channel.
3. DM the bot. Messages from the owner reach the session right away.

`<state>` is `TELEGRAM_STATE_DIR`, one directory per bot
(`~/.bot-squad/bots/<name>/state`), which is how several bots run on one machine.

To run the plugin by hand (development), install its packages once with
`bun install` in this directory, put the token and an `access.json` in the state
directory, and start Claude Code with:

```sh
TELEGRAM_STATE_DIR=<state> claude --plugin-dir <repo>/plugin --dangerously-load-development-channels plugin:bot-squad@inline
```

`--channels` only accepts allowlisted plugins, so a local fork has to be loaded as a development channel.

## Access control

Only senders in the bot's allowlist are served. Everyone else is dropped silently:
no reply of any kind. The owner changes the allowlist in master-bot with
`/allow <bot> <user_id>`, `/revoke <bot> <user_id>` and `/access <bot>`.

See **[ACCESS.md](./ACCESS.md)** for the details, delivery config, and the `access.json` schema.

Quick reference: IDs are **numeric user IDs** (get yours from [@userinfobot](https://t.me/userinfobot)). `ackReaction` only accepts Telegram's fixed emoji whitelist.

## Tools exposed to the assistant

| Tool | Purpose |
| --- | --- |
| `reply` | Send to a chat. Takes `chat_id` + `text`, optionally `reply_to` (message ID) for native threading and `files` (absolute paths) for attachments. Images (`.jpg`/`.png`/`.gif`/`.webp`) send as photos with inline preview; other types send as documents. Max 50MB each. Auto-chunks text; files send as separate messages after the text. Returns the sent message ID(s). |
| `react` | Add an emoji reaction to a message by ID. **Only Telegram's fixed whitelist** is accepted (👍 👎 ❤ 🔥 👀 etc). |
| `edit_message` | Edit a message the bot previously sent. Useful for "working…" → result progress updates. Only works on the bot's own messages. |

Inbound messages trigger a typing indicator automatically — Telegram shows
"botname is typing…" while the assistant works on a response.

## Photos

Inbound photos are downloaded to `~/.claude/channels/bot-squad/inbox/` and the
local path is included in the `<channel>` notification so the assistant can
`Read` it. Telegram compresses photos — if you need the original file, send it
as a document instead (long-press → Send as File).

## No history or search

Telegram's Bot API exposes **neither** message history nor search. The bot
only sees messages as they arrive — no `fetch_messages` tool exists. If the
assistant needs earlier context, it will ask you to paste or summarize.

This also means there's no `download_attachment` tool for historical messages
— photos are downloaded eagerly on arrival since there's no way to fetch them
later.
