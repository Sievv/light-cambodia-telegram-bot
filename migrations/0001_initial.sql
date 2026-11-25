CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','km')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  question_en TEXT NOT NULL,
  question_km TEXT NOT NULL,
  option_a_en TEXT NOT NULL,
  option_a_km TEXT NOT NULL,
  option_b_en TEXT NOT NULL,
  option_b_km TEXT NOT NULL,
  option_c_en TEXT NOT NULL,
  option_c_km TEXT NOT NULL,
  option_d_en TEXT NOT NULL,
  option_d_km TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation_en TEXT NOT NULL,
  explanation_km TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS questions_topic_reviewed_idx ON questions(topic, reviewed);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  selected_option TEXT NOT NULL CHECK (selected_option IN ('A','B','C','D')),
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts(telegram_user_id, created_at);
