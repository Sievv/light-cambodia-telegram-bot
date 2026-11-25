# CLAUDE.md

Telegram bot on Cloudflare Workers (grammY + D1 + Gemini). Telegram sends updates by webhook to `POST /telegram`. `GET /health` returns `ok`. Entry point: `src/index.ts`. The Q&A group flow is in `src/qa.ts`. D1 binding: `DB`.

## Setting the bot up for a new owner

Use this section when asked to "set up", "deploy" or "move" the bot to another Cloudflare account or another person. Go through the steps in order and check each one before moving on.

### What only the human can do

Ask the human for these. Don't guess or work around them:

1. **Bot token**: from @BotFather (`/newbot`, or an existing bot transferred via `/mybots` → Bot Settings → Transfer Ownership).
2. **Group privacy off**: in @BotFather run `/setprivacy` → the bot → **Disable**. Then remove the bot from the group and add it again. Without this the bot only sees `/commands` in groups.
3. **Cloudflare login**: `npx wrangler login` opens a browser. Run `npx wrangler whoami` to confirm it is the *new owner's* account. If it lists several accounts, ask which one to use and `export CLOUDFLARE_ACCOUNT_ID=<id>` for the session.
4. **Gemini API key**: from Google AI Studio (https://aistudio.google.com/apikey).
5. **Admin Telegram user IDs**: their personal numeric IDs, comma-separated. They can get theirs by messaging @userinfobot.

### Secrets handling (strict)

- The human puts the values in `.dev.vars` (copy from `.dev.vars.example`). `.dev.vars` is gitignored. Never commit it, never `cat` it, and never print a secret's value in output or commit messages.
- Read values into shell variables without echoing them, for example:
  ```bash
  BOT_TOKEN=$(grep '^BOT_TOKEN=' .dev.vars | cut -d= -f2-)
  ```
- If `WEBHOOK_SECRET` is still the placeholder, generate one with `openssl rand -hex 32` and write it into `.dev.vars` without printing it.

### Steps

```bash
npm install
npx wrangler d1 create telegram_learning_db
```
1. Copy the printed `database_id` into `[[d1_databases]]` in `wrangler.toml`. Keep `binding = "DB"`. The old ID belongs to the previous owner's account and will fail.
2. Create tables, then load the Q&A bank. Order matters, because `kb_qa` comes from migration 0002:
   ```bash
   npm run db:remote
   npm run qa:seed:remote
   ```
   The new owner may want the previous owner's data (quiz questions, attempts, unmatched questions). In that case, import the previous owner's `wrangler d1 export` SQL file with `npx wrangler d1 execute DB --remote --file=<backup.sql>` *in place of* both commands above.
3. Deploy: `npm run deploy`. Note the printed `https://telegram-learning.<subdomain>.workers.dev` URL. The Worker must exist before secrets can be set.
4. Push secrets from `.dev.vars` (stdin, never shown):
   ```bash
   for k in BOT_TOKEN GEMINI_API_KEY ADMIN_TELEGRAM_IDS WEBHOOK_SECRET; do
     grep "^$k=" .dev.vars | cut -d= -f2- | npx wrangler secret put "$k"
   done
   ```
5. Check: `curl https://<worker-host>/health` → `ok`.
6. Get the group ID (see below) **before** setting the webhook. It's easiest while no webhook is active.
7. Set the webhook:
   ```bash
   BOT_TOKEN=$(grep '^BOT_TOKEN=' .dev.vars | cut -d= -f2-)
   WEBHOOK_SECRET=$(grep '^WEBHOOK_SECRET=' .dev.vars | cut -d= -f2-)
   curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     --data-urlencode "url=https://<worker-host>/telegram" \
     --data-urlencode "secret_token=$WEBHOOK_SECRET" \
     --data-urlencode 'allowed_updates=["message","callback_query"]'
   ```
   Only one webhook can exist per bot. Setting it here moves the bot away from any previous owner's Worker.
8. Verify:
   - `getWebhookInfo`: `url` is correct, `last_error_message` is absent, `pending_update_count` drains to 0. A `401` error means `WEBHOOK_SECRET` on Cloudflare doesn't match the one sent to Telegram.
   - `getMe`: `can_read_all_group_messages` must be `true`. If it's `false`, privacy mode is still on (human step 2).
   - Ask the human to send `/start` in a private chat and a real question in the group, while you run `npx wrangler tail` to watch for errors.

### Finding the Telegram group ID

The code doesn't need a group ID. The bot answers in **any** group it's added to, and there's no allowlist. Record the ID for the owner's reference, or for filtering `kb_unmatched` by `chat_id`. Group IDs are negative, and supergroups start with `-100`.

- **Before the webhook is set**: ask the human to post any message in the group, then:
  ```bash
  curl -s "https://api.telegram.org/bot$BOT_TOKEN/getUpdates" | python3 -c 'import sys,json; [print(u["message"]["chat"]["id"], u["message"]["chat"].get("title")) for u in json.load(sys.stdin)["result"] if "message" in u and u["message"]["chat"]["type"]!="private"]'
  ```
  If the result is empty, privacy mode is still on, or nobody has posted since the bot joined.
- **After the webhook is set**, `getUpdates` returns a conflict error. **Don't** delete a live webhook to get around this without asking. Instead, have someone ask a longer unanswerable question in the group, then:
  ```bash
  npx wrangler d1 execute DB --remote --command "SELECT DISTINCT chat_id FROM kb_unmatched WHERE chat_id < 0"
  ```

Restricting the bot to one group would need a code change (for example a `ALLOWED_CHAT_IDS` var checked in `src/qa.ts`). Only do this if the human asks.

## Rules for agents

- **Confirm first** before anything destructive or account-wide: `qa:seed:remote` on an existing database (it replaces all Q&A rows), `d1 delete`, `wrangler delete`, `deleteWebhook`, or deploying over someone else's Worker.
- Use the `DB` binding in wrangler commands, not a database name. The README mixes old names.
- Run `npm run typecheck` after code changes.
- Updating Q&A content: edit `QA-km-en.xlsx`, run `npm run qa:import`, then `qa:seed:remote`. The bot's cache refreshes within 10 minutes.
- Content is expert-reviewed lab training material. Don't add patient data, and don't make the bot present itself as a substitute for SOPs or supervision.
