import { GoogleGenAI } from '@google/genai';
import type { Env, Language } from './types';

export async function askGemini(env: Env, question: string, language: Language): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const lang = language === 'km'
    ? 'Answer in Khmer; keep important technical terms in English parentheses where useful.'
    : 'Answer in English.';
  const prompt = `You are a bilingual educational assistant for laboratory practice.
${lang}
Use the approved training documents when available. Do not invent laboratory SOP steps,
diagnostic interpretations, or safety instructions. If materials do not support an answer,
say it cannot be verified and direct the learner to the approved SOP or qualified instructor.
Educational use only, not clinical advice.
Format for a Telegram chat: keep it concise (under 250 words), use short paragraphs,
"- " bullet lists and **bold** for key terms. Do not use tables or headings deeper than "##".
Question: ${question}`;

  const config: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: 900 };
  const store = env.GEMINI_FILE_SEARCH_STORE?.trim();
  if (store) config.tools = [{ fileSearch: { fileSearchStoreNames: [store] } }];

  // Retry temporary overload/rate-limit errors (503/429) with short backoff.
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
        contents: prompt,
        config
      });
      return response.text?.trim() || 'Sorry, I could not generate an answer.';
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (attempt >= 2 || (status !== 503 && status !== 429)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}
