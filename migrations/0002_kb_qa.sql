-- Reviewed Q&A knowledge base, loaded from QA-km-en.xlsx (scripts/import_qa.py).
CREATE TABLE IF NOT EXISTS kb_qa (
  id TEXT PRIMARY KEY,            -- e.g. DA-01-Q01
  issue_id TEXT NOT NULL,         -- e.g. DA-01 (question variants share one issue)
  category TEXT NOT NULL DEFAULT '',
  question_en TEXT NOT NULL DEFAULT '',
  question_km TEXT NOT NULL DEFAULT '',
  answer_en TEXT NOT NULL DEFAULT '',
  answer_km TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',     -- 'Routine' | 'Safety-critical'
  escalate_to TEXT NOT NULL DEFAULT ''
);

-- Questions the bot could not match, to grow the Q&A bank.
CREATE TABLE IF NOT EXISTS kb_unmatched (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  telegram_user_id INTEGER,
  text TEXT NOT NULL,
  reason TEXT NOT NULL,           -- 'no_match' | 'none_of_these'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
