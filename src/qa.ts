// Main flow: someone types a question (group or private chat) → the bot replies
// with the closest questions from the Q&A bank as buttons → tapping one turns
// that same message into the reviewed answer. No AI involved.

import { InlineKeyboard } from "grammy";
import type { Bot, Context } from "grammy";
import type { Env } from "./types";
import { escapeHtml } from "./format";
import { QaIndex, isKhmer, normalize } from "./search";
import type { Match, QaRow } from "./search";

const HTML = { parse_mode: "HTML" } as const;
const MAX_SUGGESTIONS = 4;
const MIN_SCORE = 0.4;
const CACHE_MS = 10 * 60 * 1000; // pick up a re-seeded Q&A bank within 10 minutes
const MIN_QUERY_CHARS = 4;

type Lang = "km" | "en";

const other = (lang: Lang): Lang => (lang === "km" ? "en" : "km");
const FLAG = { km: "🇰🇭", en: "🇬🇧" } as const;

// Every message is bilingual; the asker's language comes first.
const t = {
  km: {
    pick: "🔎 <b>តើអ្នកចង់សួរមួយណា?</b>",
    tap: "👇 ចុចលេខខាងក្រោម",
    none: "❌ មិនមែនទាំងនេះ",
    back: "🔙 សំណួរផ្សេង",
    safety: "⚠️ <b>សំខាន់ចំពោះសុវត្ថិភាព</b>",
    escalate: "📞 បើមិនទាន់ដោះស្រាយបាន ទាក់ទង",
    video: "មើលវីដេអូ",
    doc: "បើកឯកសារ",
    link: "បើកតំណ",
    notFound:
      "🤔 មិនទាន់រកឃើញចម្លើយសម្រាប់សំណួរនេះទេ។\n" +
      "📝 សំណួររបស់អ្នកត្រូវបានកត់ទុក ដើម្បីបន្ថែមចម្លើយ។\n" +
      "📞 បើបន្ទាន់ សូមទាក់ទង Study focal point។",
    notYours: "សំណួរនេះជារបស់អ្នកផ្សេង។ សូមវាយសំណួររបស់អ្នក 🙏",
    expired: "សារនេះចាស់ហើយ។ សូមវាយសំណួរម្តងទៀត។",
  },
  en: {
    pick: "🔎 <b>Which question do you mean?</b>",
    tap: "👇 Tap a number below",
    none: "❌ None of these",
    back: "🔙 Other questions",
    safety: "⚠️ <b>Safety-critical</b>",
    escalate: "📞 If not solved, contact",
    video: "Watch video",
    doc: "Open document",
    link: "Open link",
    notFound:
      "🤔 I couldn't find an answer to this yet.\n" +
      "📝 Your question has been saved so an answer can be added.\n" +
      "📞 If urgent, contact the Study focal point.",
    notYours: "This question belongs to someone else. Please type your own question 🙏",
    expired: "This message is too old. Please type your question again.",
  },
};

type Key = keyof (typeof t)["en"];

/** Both languages, asker's first, joined by `sep`. */
const bi = (lang: Lang, key: Key, sep = "\n") => `${t[lang][key]}${sep}${t[other(lang)][key]}`;

const stripIcon = (s: string) => s.replace(/^\S+\s/u, "");

/** One-line bilingual text, with the second language's icon dropped. */
const biShort = (lang: Lang, key: Key) => `${t[lang][key]} · ${stripIcon(t[other(lang)][key])}`;

// ---------- Q&A bank cache (one D1 read per Worker instance every 10 min) ----------

let cache: { index: QaIndex; byId: Map<string, QaRow>; at: number } | undefined;
let loading: Promise<NonNullable<typeof cache>> | undefined;

async function getBank(env: Env) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  loading ??= (async () => {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM kb_qa").all<QaRow>();
      cache = {
        index: new QaIndex(results),
        byId: new Map(results.map((r) => [r.id, r])),
        at: Date.now(),
      };
      return cache;
    } finally {
      loading = undefined;
    }
  })();
  return loading;
}

async function logUnmatched(env: Env, chatId: number, userId: number | undefined, text: string, reason: string) {
  await env.DB.prepare(
    "INSERT INTO kb_unmatched (chat_id, telegram_user_id, text, reason) VALUES (?, ?, ?, ?)",
  ).bind(chatId, userId ?? null, text.slice(0, 1000), reason).run()
    .catch((e) => console.error("logUnmatched failed", e));
}

// ---------- Message builders ----------

const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];

const questionOf = (row: QaRow, lang: Lang) => (lang === "km" ? row.question_km : row.question_en).trim();
const answerOf = (row: QaRow, lang: Lang) => (lang === "km" ? row.answer_km : row.answer_en).trim();

/** Same text in both languages (e.g. a bare link) should only be shown once. */
const same = (a: string, b: string) => normalize(a) === normalize(b);

function suggestionMessage(matches: Match[], lang: Lang, askerId: number) {
  const items = matches.map((m, i) => {
    const first = questionOf(m.row, lang) || questionOf(m.row, other(lang));
    const second = questionOf(m.row, other(lang));
    const lines = [`${NUMBERS[i]} <b>${escapeHtml(first)}</b>`];
    if (second && !same(first, second)) lines.push(`<i>${escapeHtml(second)}</i>`);
    return lines.join("\n");
  });
  // The list above already shows the full questions, so the buttons are just numbers.
  const kb = new InlineKeyboard();
  matches.forEach((m, i) => kb.text(NUMBERS[i], `qa:${m.row.id}:${askerId}`));
  kb.row().text(biShort(lang, "none"), `qn:${askerId}`);
  return {
    text: `${t[lang].pick}\n${stripIcon(t[other(lang)].pick)}\n\n${items.join("\n\n")}\n\n${biShort(lang, "tap")}`,
    keyboard: kb,
  };
}

interface Link {
  url: string;
  label: { km: string; en: string };
}

const URL = /https?:\/\/[^\s<>"]+/g;
const PENDING = /\[[^\]\n]*pending[^\]\n]*\]/i;
// "Video (1 min): https://…", a bare URL, or "Operation procedure: [Document - Pending]".
const LINK_LINE = /^\s*(?:[-•]\s*)?(?:([^\n]{1,60}?)\s*[:៖]\s*)?(https?:\/\/\S+|\[[^\]\n]*pending[^\]\n]*\])\s*$/i;

const trimUrl = (url: string) => url.replace(/[.,;:!?)\]។]+$/u, "");

/**
 * Take the "label: link" lines off the end of an answer, so the links that the
 * Khmer and English answers share can be listed once. Links inside the text
 * (e.g. part of a numbered step) stay where they are.
 * "[… Pending]" placeholders for documents that don't exist yet are dropped.
 */
function splitAnswer(answer: string): { body: string; links: { url: string; label: string }[] } {
  const lines = answer.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const links: { url: string; label: string }[] = [];
  while (lines.length > 1) {
    const last = lines[lines.length - 1];
    const m = last.match(LINK_LINE);
    if (last.trim() && (!m || /[.!?។]\s/u.test(m[1] ?? ""))) break;
    lines.pop();
    if (m && !PENDING.test(m[2])) links.unshift({ url: trimUrl(m[2]), label: (m[1] ?? "").trim() });
  }
  return { body: lines.join("\n").trim(), links };
}

function linkKind(url: string): { icon: string; key: Key } {
  if (/youtu\.?be|\.mp4($|\?)/i.test(url)) return { icon: "🎬", key: "video" };
  if (/docs\.google|drive\.google|\.pdf($|\?)/i.test(url)) return { icon: "📄", key: "doc" };
  return { icon: "🔗", key: "link" };
}

/** "Khmer label · English label", or just one when it already contains the other. */
function linkText(a: string, b: string) {
  if (a.toLowerCase().includes(b.toLowerCase())) return a;
  if (b.toLowerCase().includes(a.toLowerCase())) return b;
  return `${a} · ${b}`;
}

/** Answer text as HTML: one numbered step per line, and links in the text shortened to "🎬 Watch video". */
function renderBody(body: string, lang: Lang) {
  const text = body
    .replace(/(?:[^\n.។:៖]{0,80}[:៖]\s*)?\[[^\]\n]*pending[^\]\n]*\]/gi, "")
    .replace(/([.;។])[ \t]+(?=[0-9០-៩]{1,2}[.)]\s)/gu, "$1\n") // "… 2) … 3) …" → one step per line
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let html = "";
  let from = 0;
  for (const m of text.matchAll(URL)) {
    const url = trimUrl(m[0]);
    const { icon, key } = linkKind(url);
    html += escapeHtml(text.slice(from, m.index)) + `<a href="${escapeHtml(url)}">${icon} ${t[lang][key]}</a>`;
    from = m.index + url.length;
  }
  return html + escapeHtml(text.slice(from));
}

function answerMessage(row: QaRow, lang: Lang) {
  const langs: Lang[] = [lang, other(lang)];
  const parts: string[] = [];

  if (row.priority.toLowerCase().includes("safety")) parts.push(biShort(lang, "safety"));

  // Each language: question in bold, then the answer text; shared links are listed after both.
  const links: Link[] = [];
  const sections: string[] = [];
  let firstQuestion = "";
  let firstBody = "";
  for (const l of langs) {
    const { body, links: found } = splitAnswer(answerOf(row, l));
    for (const { url, label } of found) {
      const existing = links.find((x) => x.url === url);
      if (existing) existing.label[l] ||= label;
      else links.push({ url, label: { km: "", en: "", [l]: label } });
    }
    const question = questionOf(row, l);
    const showQuestion = question && !(l !== lang && same(question, firstQuestion));
    const showBody = body && !(l !== lang && same(body, firstBody));
    if (l === lang) {
      firstQuestion = question;
      firstBody = body;
    }
    if (!showQuestion && !showBody) continue;
    const lines = [];
    if (showQuestion) lines.push(`${FLAG[l]} <b>${escapeHtml(question)}</b>`);
    if (showBody) lines.push(renderBody(body, l));
    sections.push(lines.join("\n"));
  }
  parts.push(...sections);

  if (links.length) {
    parts.push(
      links
        .map(({ url, label }) => {
          const { icon, key } = linkKind(url);
          const text = linkText(label[lang] || t[lang][key], label[other(lang)] || t[other(lang)][key]);
          return `${icon} <a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
        })
        .join("\n"),
    );
  }

  if (row.escalate_to) {
    // The label already says "if not solved", so drop it from the contact name.
    const who = escapeHtml(row.escalate_to.replace(/\s*\(if not solved\)\s*$/i, ""));
    parts.push(`${biShort(lang, "escalate")}\n👤 <b>${who}</b>`);
  }

  return parts.join("\n\n");
}

// ---------- Handlers ----------

/** Plain conversation (greetings, replies to colleagues, forwards) should not trigger the bot. */
function looksLikeQuestion(ctx: Context): boolean {
  const msg = ctx.msg;
  if (!msg?.text || msg.text.startsWith("/")) return false;
  if (msg.via_bot || msg.forward_origin) return false;
  const repliedTo = msg.reply_to_message;
  if (repliedTo && repliedTo.from?.id !== ctx.me.id) return false;
  return Array.from(normalize(msg.text).replace(/ /g, "")).length >= MIN_QUERY_CHARS;
}

/** The asker's original question: the message the bot's suggestion message replies to. */
function originalQuestion(ctx: Context): string | undefined {
  const msg = ctx.callbackQuery?.message;
  return msg && "reply_to_message" in msg ? msg.reply_to_message?.text : undefined;
}

export function registerQa(bot: Bot, env: Env) {
  bot.on("message:text", async (ctx, next) => {
    if (!looksLikeQuestion(ctx)) return next();
    const text = ctx.msg.text;
    const lang: Lang = isKhmer(text) ? "km" : "en";
    const isPrivate = ctx.chat.type === "private";

    const { index } = await getBank(env);
    const matches = index.search(text, MAX_SUGGESTIONS, MIN_SCORE);

    if (!matches.length) {
      // In groups stay silent on chit-chat, but keep longer messages as possible missing questions.
      if (isPrivate || text.length >= 15 || /[?？]/.test(text)) {
        await logUnmatched(env, ctx.chat.id, ctx.from?.id, text, "no_match");
      }
      if (isPrivate) await ctx.reply(bi(lang, "notFound", "\n\n"), { reply_parameters: { message_id: ctx.msg.message_id } });
      return;
    }

    const { text: body, keyboard } = suggestionMessage(matches, lang, ctx.from.id);
    await ctx.reply(body, {
      ...HTML,
      reply_markup: keyboard,
      reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true },
    });
  });

  /** Only the person who asked may press the buttons, so a colleague can't change their screen. */
  async function guard(ctx: Context, askerId: string): Promise<Lang | undefined> {
    const lang: Lang = isKhmer(originalQuestion(ctx) ?? "ខ") ? "km" : "en";
    if (String(ctx.from?.id) !== askerId) {
      await ctx.answerCallbackQuery({ text: bi(lang, "notYours"), show_alert: true });
      return undefined;
    }
    return lang;
  }

  // Tapped a suggested question → show its answer in the same message.
  bot.callbackQuery(/^qa:([A-Za-z0-9_.-]+):(\d+)$/, async (ctx) => {
    const [, id, askerId] = ctx.match;
    const lang = await guard(ctx, askerId);
    if (!lang) return;
    const row = (await getBank(env)).byId.get(id);
    if (!row) return ctx.answerCallbackQuery({ text: bi(lang, "expired"), show_alert: true });

    await ctx.answerCallbackQuery();
    const keyboard = originalQuestion(ctx)
      ? new InlineKeyboard().text(biShort(lang, "back"), `qb:${askerId}`)
      : undefined;
    await ctx.editMessageText(answerMessage(row, lang), {
      ...HTML,
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    }).catch(() => {}); // "message is not modified" on double taps
  });

  // "Other questions" → back to the suggestion list for the original question.
  bot.callbackQuery(/^qb:(\d+)$/, async (ctx) => {
    const lang = await guard(ctx, ctx.match[1]);
    if (!lang) return;
    const question = originalQuestion(ctx);
    const matches = question ? (await getBank(env)).index.search(question, MAX_SUGGESTIONS, MIN_SCORE) : [];
    if (!matches.length) return ctx.answerCallbackQuery({ text: bi(lang, "expired"), show_alert: true });

    await ctx.answerCallbackQuery();
    const { text: body, keyboard } = suggestionMessage(matches, lang, ctx.from.id);
    await ctx.editMessageText(body, { ...HTML, reply_markup: keyboard }).catch(() => {});
  });

  // "None of these" → save the question for the Q&A team and tell the asker who to contact.
  bot.callbackQuery(/^qn:(\d+)$/, async (ctx) => {
    const lang = await guard(ctx, ctx.match[1]);
    if (!lang) return;
    await ctx.answerCallbackQuery();
    const question = originalQuestion(ctx);
    if (question && ctx.chat) await logUnmatched(env, ctx.chat.id, ctx.from.id, question, "none_of_these");
    await ctx.editMessageText(bi(lang, "notFound", "\n\n")).catch(() => {});
  });
}
