import type { Env, Language, OptionKey, Question } from './types';

export async function getLanguage(env: Env, userId: number): Promise<Language> {
  const row = await env.DB.prepare('SELECT language FROM users WHERE telegram_id = ?')
    .bind(userId).first<{ language: Language }>();
  return row?.language ?? 'en';
}

export async function setLanguage(env: Env, userId: number, language: Language) {
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, language) VALUES (?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET language = excluded.language`
  ).bind(userId, language).run();
}

export async function listTopics(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT topic FROM questions WHERE reviewed = 1 ORDER BY topic'
  ).all<{ topic: string }>();
  return results.map(row => row.topic);
}

export async function randomQuestion(env: Env, topic?: string): Promise<Question | undefined> {
  const statement = topic
    ? env.DB.prepare('SELECT * FROM questions WHERE reviewed = 1 AND topic = ? ORDER BY RANDOM() LIMIT 1').bind(topic)
    : env.DB.prepare('SELECT * FROM questions WHERE reviewed = 1 ORDER BY RANDOM() LIMIT 1');
  return (await statement.first<Question>()) ?? undefined;
}

export async function saveAttempt(env: Env, userId: number, qid: number, choice: OptionKey, correct: boolean) {
  await env.DB.prepare(
    'INSERT INTO quiz_attempts (telegram_user_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)'
  ).bind(userId, qid, choice, correct ? 1 : 0).run();
}

export async function addQuestion(env: Env, fields: string[]) {
  if (fields.length !== 14) throw new Error(`Expected 14 fields; received ${fields.length}`);
  const [topic, qEn, qKm, aEn, aKm, bEn, bKm, cEn, cKm, dEn, dKm, correct, expEn, expKm] = fields;
  const answer = (correct ?? '').trim().toUpperCase();
  if (!['A','B','C','D'].includes(answer)) throw new Error('Correct answer must be A, B, C or D');
  await env.DB.prepare(
    `INSERT INTO questions
    (topic,question_en,question_km,option_a_en,option_a_km,option_b_en,option_b_km,
     option_c_en,option_c_km,option_d_en,option_d_km,correct_option,explanation_en,explanation_km,reviewed)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
  ).bind(topic,qEn,qKm,aEn,aKm,bEn,bKm,cEn,cKm,dEn,dKm,answer,expEn,expKm).run();
}

export async function setActiveQuestion(env: Env, userId: number, questionId: number | null) {
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, active_question_id) VALUES (?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET active_question_id = excluded.active_question_id`
  ).bind(userId, questionId).run();
}

export async function getActiveQuestion(env: Env, userId: number): Promise<Question | undefined> {
  const row = await env.DB.prepare(
    `SELECT q.* FROM questions q
     JOIN users u ON u.active_question_id = q.id
     WHERE u.telegram_id = ?`
  ).bind(userId).first<Question>();
  return row ?? undefined;
}
