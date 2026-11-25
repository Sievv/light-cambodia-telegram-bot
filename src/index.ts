import { Bot, GrammyError, InlineKeyboard, Keyboard, webhookCallback } from "grammy";
import type { Context } from "grammy";
import type { Env, Language, OptionKey, Question } from "./types";
import {
  addQuestion,
  getActiveQuestion,
  getLanguage,
  listTopics,
  randomQuestion,
  saveAttempt,
  setActiveQuestion,
  setLanguage,
} from "./db";
import { askGemini } from "./gemini";
import { escapeHtml, markdownToHtml, splitText } from "./format";
import { askPrompts, menuLabels, strings } from "./i18n";
import { registerQa } from "./qa";

const HTML = { parse_mode: "HTML" } as const;
const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];
const RANDOM_TOPIC = "__random";
/** Telegram rejects callback_data longer than 64 bytes. */
const MAX_CALLBACK_BYTES = 64;

const ADMIN_FORMAT =
  "<b>Add a question</b>\n\n" +
  "Send 14 pipe-separated fields:\n" +
  "<code>/admin_add topic|question_en|question_km|A_en|A_km|B_en|B_km|C_en|C_km|D_en|D_km|correct|explanation_en|explanation_km</code>\n\n" +
  "<i>correct</i> is A, B, C or D. New questions are saved as <b>unreviewed</b>.";

// ---------- Keyboards ----------

function mainMenu(language: Language) {
  const m = strings[language].menu;
  return new Keyboard()
    .text(m.questionBank).text(m.practice).row()
    .text(m.videos).text(m.documents).row()
    .text(m.askAi).text(m.language)
    .resized()
    .persistent();
}

function languageKeyboard() {
  return new InlineKeyboard().text("English 🇬🇧", "lang:en").text("ខ្មែរ 🇰🇭", "lang:km");
}

function topicCallback(topic: string): string | undefined {
  const data = `topic:${encodeURIComponent(topic)}`;
  return new TextEncoder().encode(data).length <= MAX_CALLBACK_BYTES ? data : undefined;
}

function topicsKeyboard(topics: string[], language: Language) {
  const kb = new InlineKeyboard();
  let inRow = 0;
  for (const topic of topics) {
    const data = topicCallback(topic);
    if (!data) {
      console.warn(`Topic name too long for a button: ${topic}`);
      continue;
    }
    kb.text(topic, data);
    if (++inRow === 2) {
      kb.row();
      inRow = 0;
    }
  }
  if (inRow) kb.row();
  return kb.text(strings[language].randomQuestion, `topic:${RANDOM_TOPIC}`);
}

function answerKeyboard(questionId: number) {
  return new InlineKeyboard()
    .text("A", `ans:${questionId}:A`).text("B", `ans:${questionId}:B`).row()
    .text("C", `ans:${questionId}:C`).text("D", `ans:${questionId}:D`);
}

// ---------- Message builders ----------

function questionText(q: Question, language: Language) {
  const km = language === "km";
  const options: Record<OptionKey, string> = {
    A: km ? q.option_a_km : q.option_a_en,
    B: km ? q.option_b_km : q.option_b_en,
    C: km ? q.option_c_km : q.option_c_en,
    D: km ? q.option_d_km : q.option_d_en,
  };
  return [
    `🧪 <b>${escapeHtml(q.topic)}</b>`,
    "",
    escapeHtml(km ? q.question_km : q.question_en),
    "",
    ...OPTIONS.map((k) => `<b>${k}.</b> ${escapeHtml(options[k])}`),
  ].join("\n");
}

// ---------- Bot ----------

function makeBot(env: Env) {
  const bot = new Bot(env.BOT_TOKEN);
  const adminIds = new Set(
    env.ADMIN_TELEGRAM_IDS.split(",").map((x) => x.trim()).filter(Boolean),
  );

  const getLang = (ctx: Context): Promise<Language> =>
    ctx.from ? getLanguage(env, ctx.from.id) : Promise.resolve("en");

  async function showTopics(ctx: Context) {
    const language = await getLang(ctx);
    const topics = await listTopics(env);
    if (!topics.length) return ctx.reply(strings[language].noQuestions);
    await ctx.reply(strings[language].chooseTopic, {
      ...HTML,
      reply_markup: topicsKeyboard(topics, language),
    });
  }

  async function sendQuizQuestion(ctx: Context, topic?: string) {
    if (!ctx.from) return;
    const language = await getLang(ctx);
    const q = await randomQuestion(env, topic);
    if (!q) return ctx.reply(strings[language].noQuestions);
    await setActiveQuestion(env, ctx.from.id, q.id);
    await ctx.reply(questionText(q, language), {
      ...HTML,
      reply_markup: answerKeyboard(q.id),
    });
  }

  /** Send AI Markdown as HTML, falling back to plain text if Telegram can't parse it. */
  async function replyWithAiAnswer(ctx: Context, markdown: string, language: Language) {
    const chunks = splitText(markdown);
    for (const [i, chunk] of chunks.entries()) {
      const isLast = i === chunks.length - 1;
      const html = markdownToHtml(chunk) + (isLast ? `\n\n${strings[language].aiFooter}` : "");
      try {
        await ctx.reply(html, { ...HTML, link_preview_options: { is_disabled: true } });
      } catch (e) {
        if (!(e instanceof GrammyError && e.description.includes("can't parse entities"))) throw e;
        await ctx.reply(chunk);
      }
    }
  }

  async function answerQuestion(ctx: Context, question: string) {
    const language = await getLang(ctx);
    const s = strings[language];
    await ctx.replyWithChatAction("typing").catch(() => {});
    const placeholder = await ctx.reply(s.thinking);
    try {
      const answer = await askGemini(env, question, language);
      await replyWithAiAnswer(ctx, answer, language);
    } catch (e) {
      console.error("Gemini error", e);
      await ctx.reply(s.aiUnavailable);
    } finally {
      // Remove the temporary "Thinking…" message once the answer (or error) is shown.
      await ctx.api.deleteMessage(placeholder.chat.id, placeholder.message_id).catch(() => {});
    }
  }

  // Commands
  bot.command("start", async (ctx) => {
    const language = await getLang(ctx);
    const name = escapeHtml(ctx.from?.first_name ?? "there");
    await ctx.reply(strings[language].welcome(name), {
      ...HTML,
      reply_markup: mainMenu(language),
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(strings[await getLang(ctx)].help, HTML);
  });

  bot.command("language", (ctx) =>
    ctx.reply(strings.en.chooseLanguage, { ...HTML, reply_markup: languageKeyboard() }),
  );

  bot.command("quiz", showTopics);

  bot.command("ask", async (ctx) => {
    const question = ctx.match.trim();
    if (!question) return ctx.reply(strings[await getLang(ctx)].askUsage, HTML);
    await answerQuestion(ctx, question);
  });

  bot.command("admin_add", async (ctx) => {
    if (!adminIds.has(String(ctx.from?.id))) return ctx.reply("⛔ Admin access required.");
    const raw = ctx.match.trim();
    if (!raw) return ctx.reply(ADMIN_FORMAT, HTML);
    try {
      await addQuestion(env, raw.split("|").map((s) => s.trim()));
      await ctx.reply(
        "✅ Question saved as <b>UNREVIEWED</b>.\nA qualified reviewer must approve it in D1 before learners can see it.",
        HTML,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      await ctx.reply(`⚠️ Unable to add: ${escapeHtml(message)}`, HTML);
    }
  });

  // Inline buttons
  bot.callbackQuery(/^lang:(en|km)$/, async (ctx) => {
    const language = ctx.match[1] as Language;
    await setLanguage(env, ctx.from.id, language);
    await ctx.answerCallbackQuery({ text: strings[language].languageUpdated });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply(strings[language].languageChanged, {
      ...HTML,
      reply_markup: mainMenu(language),
    });
  });

  bot.callbackQuery(/^topic:(.+)$/, async (ctx) => {
    const value = ctx.match[1];
    await ctx.answerCallbackQuery();
    await sendQuizQuestion(ctx, value === RANDOM_TOPIC ? undefined : decodeURIComponent(value));
  });

  bot.callbackQuery(/^ans:(\d+):([ABCD])$/, async (ctx) => {
    const questionId = Number(ctx.match[1]);
    const choice = ctx.match[2] as OptionKey;
    const language = await getLang(ctx);
    const s = strings[language];

    const q = await getActiveQuestion(env, ctx.from.id);
    if (!q) return ctx.answerCallbackQuery({ text: s.expired, show_alert: true });
    if (q.id !== questionId) return ctx.answerCallbackQuery({ text: s.notActive, show_alert: true });

    const correct = choice === q.correct_option;
    await saveAttempt(env, ctx.from.id, q.id, choice, correct);
    await setActiveQuestion(env, ctx.from.id, null);
    await ctx.answerCallbackQuery({ text: correct ? s.correctToast : s.incorrectToast });
    // Lock the question so it can't be answered twice.
    await ctx.editMessageReplyMarkup().catch(() => {});

    const explanation = language === "km" ? q.explanation_km : q.explanation_en;
    const nextKeyboard = new InlineKeyboard().text(
      s.nextQuestion,
      topicCallback(q.topic) ?? `topic:${RANDOM_TOPIC}`,
    );
    await ctx.reply(
      `${correct ? s.correct : s.incorrect(q.correct_option)}\n\n${s.explanation}\n${escapeHtml(explanation)}`,
      { ...HTML, reply_markup: nextKeyboard },
    );
  });

  // Main menu buttons
  bot.hears([...menuLabels("questionBank"), ...menuLabels("practice")], showTopics);

  bot.hears(menuLabels("askAi"), async (ctx) => {
    const s = strings[await getLang(ctx)];
    await ctx.reply(s.askPrompt, {
      reply_markup: { force_reply: true, input_field_placeholder: s.askPlaceholder },
    });
  });

  bot.hears(menuLabels("language"), (ctx) =>
    ctx.reply(strings.en.chooseLanguage, { ...HTML, reply_markup: languageKeyboard() }),
  );

  bot.hears(menuLabels("videos"), async (ctx) => {
    await ctx.reply(strings[await getLang(ctx)].videos);
  });

  bot.hears(menuLabels("documents"), async (ctx) => {
    await ctx.reply(strings[await getLang(ctx)].documents);
  });

  // Replies to the "Ask AI" prompt
  bot.on("message:text", async (ctx, next) => {
    const repliedTo = ctx.msg.reply_to_message;
    if (repliedTo?.from?.id === ctx.me.id && askPrompts.includes(repliedTo.text ?? "")) {
      return answerQuestion(ctx, ctx.msg.text);
    }
    await next();
  });

  // Any other typed message: suggest matching questions from the Q&A bank.
  registerQa(bot, env);

  bot.catch((err) => console.error("grammY error:", err.error));
  return bot;
}

/**
 * A training file from R2, linked from Q&A answers. Supports Range requests,
 * which phone browsers need to play and seek the video.
 */
async function serveFile(request: Request, env: Env, rawName: string): Promise<Response> {
  const name = decodeURIComponent(rawName);
  if (!env.FILES || !/^[\w.-]+$/.test(name) || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response("Not found", { status: 404 });
  }
  const obj = await env.FILES.get(name, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=86400");
  if (!headers.has("content-disposition")) headers.set("content-disposition", `inline; filename="${name}"`);
  // No body means an If-None-Match / If-Modified-Since precondition matched.
  if (!("body" in obj)) return new Response(null, { status: 304, headers });

  let status = 200;
  if (obj.range && request.headers.has("range")) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    const offset = r.suffix !== undefined ? obj.size - r.suffix : r.offset ?? 0;
    const length = r.suffix !== undefined ? r.suffix : r.length ?? obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(request.method === "HEAD" ? null : obj.body, { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname.startsWith("/files/")) return serveFile(request, env, url.pathname.slice("/files/".length));
    if (url.pathname !== "/telegram" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    // grammY's default 10s timeout is too short for Gemini calls.
    return webhookCallback(makeBot(env), "cloudflare-mod", {
      timeoutMilliseconds: 55_000,
    })(request);
  },
};
