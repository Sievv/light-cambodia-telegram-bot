# Laboratory Practice Telegram Bot — Cloudflare D1 edition

Telegram webhook bot built on Cloudflare Workers, grammY, D1 and Gemini API. Includes bilingual menu, topic quiz, attempts tracking, admin question creation, and Gemini AI Q&A optionally grounded by Gemini File Search.

## Prerequisites
- Node.js 20+
- Cloudflare account
- Telegram bot token from @BotFather
- Gemini API key from Google AI Studio

## Setup
1. Install dependencies: `npm install`
2. Create D1 database: `npx wrangler d1 create lab-telegram-gemini`
3. Copy the `database_id` from CLI output into `wrangler.toml`.
4. Local migration: `npm run db:local`
5. Create local secrets file: `cp .dev.vars.example .dev.vars`, then edit it.
6. Run local Worker: `npm run dev`
7. Deploy: `npm run db:remote` then `npm run deploy`
8. Add secrets on Cloudflare: `npm run secret:telegram`, `npm run secret:gemini`, `npm run secret:admin`, `npm run secret:webhook`.
9. Register Telegram webhook after deployment:
   `curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" -d "url=https://<YOUR_WORKER_HOST>/telegram" -d "secret_token=<YOUR_WEBHOOK_SECRET>"`
   Worker validates Telegram's `X-Telegram-Bot-Api-Secret-Token` header.

## Q&A suggestions in group chat (main flow, no AI)
Someone types a question in the group → the bot replies with up to 4 matching questions from `QA-km-en.xlsx` as buttons → tapping one turns that message into the reviewed Khmer answer (English in an expandable quote, ⚠️ banner for Safety-critical, and who to contact). Only the asker can tap their buttons. Greetings and chit-chat with no match get no reply.

Load / update the Q&A bank:
1. `npm run qa:import` — converts `QA-km-en.xlsx` → `seed/qa.sql` (Python 3, no packages needed)
2. `npm run db:local` / `npm run db:remote` — creates the `kb_qa` table (once)
3. `npm run qa:seed:local` / `npm run qa:seed:remote` — replaces all Q&A rows. The bot picks up changes within 10 minutes.

**Training files (PDFs, videos):** answers that name a file such as `02_KHANA_Pluslife_Procedure.pdf` get a link to it. Put the files in `media/` (git-ignored), then:
1. `npm run media:upload` — uploads `media/` to the R2 bucket `lab-training-files`; the Worker serves them at `/files/<name>`
2. `npm run qa:import` then `npm run qa:seed:remote` — file names become links; names of files not in `media/` are hidden

**Required for groups:** by default a bot only sees `/commands` in groups. In @BotFather run `/setprivacy` → your bot → **Disable**, then remove and re-add the bot to the group (or make the bot a group admin).

Questions the bot couldn't answer (or "None of these") are saved for the Q&A team:
`npx wrangler d1 execute DB --remote --command "SELECT text, reason, created_at FROM kb_unmatched ORDER BY id DESC LIMIT 50"`

## Admin question add
In Telegram:
`/admin_add topic|question_en|question_km|A_en|A_km|B_en|B_km|C_en|C_km|D_en|D_km|correct(A/B/C/D)|explanation_en|explanation_km`

Rows are created as unreviewed (reviewed=0) and won't show in learner quiz until approved:
`npx wrangler d1 execute lab-telegram-gemini --remote --command "UPDATE questions SET reviewed=1 WHERE id=1;"`

## Commands
- `/start`
- `/language`
- `/quiz`
- `/ask your question`
- `/admin_add ...` (admin IDs only)

## Gemini File Search
Set `GEMINI_FILE_SEARCH_STORE` in `wrangler.toml` to a configured File Search store resource name, then redeploy. Upload vetted training docs to that store following Gemini File Search docs: https://ai.google.dev/gemini-api/docs/file-search

## Notes
- Long polling isn't used; Workers receive Telegram webhook updates at `/telegram`.
- This starter currently includes question bank/quiz and AI Q&A. Video/document browse menu buttons and admin dashboard are not implemented yet.
- Treat laboratory material as expert-reviewed training content. Don't include patient-identifiable data; do not use this bot as a replacement for approved SOPs, instructor supervision or diagnostic decisions.
