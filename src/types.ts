export type Language = 'en' | 'km';
export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface Env {
  DB: D1Database;
  /** Training PDFs and videos, served at /files/<name>. */
  FILES?: R2Bucket;
  BOT_TOKEN: string;
  GEMINI_API_KEY: string;
  ADMIN_TELEGRAM_IDS: string;
  WEBHOOK_SECRET: string;
  GEMINI_MODEL?: string;
  GEMINI_FILE_SEARCH_STORE?: string;
}

export interface Question {
  id: number;
  topic: string;
  question_en: string;
  question_km: string;
  option_a_en: string;
  option_a_km: string;
  option_b_en: string;
  option_b_km: string;
  option_c_en: string;
  option_c_km: string;
  option_d_en: string;
  option_d_km: string;
  correct_option: OptionKey;
  explanation_en: string;
  explanation_km: string;
}
