import type { Language, OptionKey } from "./types";

// All learner-facing strings. Values are Telegram HTML; escape any dynamic input.
const en = {
  menu: {
    questionBank: "📚 Question Bank",
    practice: "🧪 Practice",
    videos: "🎥 Videos",
    documents: "📄 Documents",
    askAi: "🤖 Ask AI",
    language: "🌐 Language",
  },
  welcome: (name: string) =>
    `👋 Welcome, <b>${name}</b>!\n\n` +
    `I'm your <b>Laboratory Practice Assistant</b>. Choose an option from the menu below.`,
  help:
    "<b>Available commands</b>\n\n" +
    "/start — Main menu\n" +
    "/quiz — Practice quiz\n" +
    "/ask <i>question</i> — Ask the AI assistant\n" +
    "/language — Change language\n" +
    "/help — Show this message",
  chooseLanguage: "🌐 <b>Choose language</b> / សូមជ្រើសរើសភាសា",
  languageUpdated: "Language updated",
  languageChanged: "✅ Language changed to <b>English</b>.",
  chooseTopic: "📚 <b>Choose a topic</b>",
  randomQuestion: "🎲 Random question",
  noQuestions:
    "📭 No reviewed questions are available yet.\nAsk an admin to add and approve questions.",
  notActive: "This is not your active question. Start /quiz again.",
  expired: "This question has expired. Start /quiz again.",
  correctToast: "✅ Correct!",
  incorrectToast: "❌ Incorrect",
  correct: "✅ <b>Correct!</b>",
  incorrect: (option: OptionKey) => `❌ <b>Incorrect.</b> The correct answer is <b>${option}</b>.`,
  explanation: "💡 <b>Explanation</b>",
  nextQuestion: "➡️ Next question",
  askPrompt: "🤖 Type your question for the AI assistant:",
  askPlaceholder: "e.g. What is a blank in spectrophotometry?",
  askUsage:
    "Send your question after the command, for example:\n" +
    "<code>/ask What is a blank in spectrophotometry?</code>",
  thinking: "🤔 Thinking…",
  aiFooter: "<i>ℹ️ For education only. Always follow your approved SOP.</i>",
  aiUnavailable: "⚠️ The AI service is temporarily unavailable. Please try again later.",
  videos: "🎥 The video library is coming soon.",
  documents: "📄 The document library is coming soon.",
};

type Strings = typeof en;

const km: Strings = {
  menu: {
    questionBank: "📚 សំណួរ",
    practice: "🧪 អនុវត្ត",
    videos: "🎥 វីដេអូ",
    documents: "📄 ឯកសារ",
    askAi: "🤖 សួរ AI",
    language: "🌐 ភាសា",
  },
  welcome: (name: string) =>
    `👋 សូមស្វាគមន៍ <b>${name}</b>!\n\n` +
    `ខ្ញុំជា <b>ជំនួយការអនុវត្តមន្ទីរពិសោធន៍</b> របស់អ្នក។ សូមជ្រើសរើសមុខងារពីម៉ឺនុយខាងក្រោម។`,
  help:
    "<b>ពាក្យបញ្ជាដែលមាន</b>\n\n" +
    "/start — ម៉ឺនុយមេ\n" +
    "/quiz — លំហាត់សំណួរ\n" +
    "/ask <i>សំណួរ</i> — សួរជំនួយការ AI\n" +
    "/language — ប្តូរភាសា\n" +
    "/help — បង្ហាញសារនេះ",
  chooseLanguage: en.chooseLanguage,
  languageUpdated: "បានធ្វើបច្ចុប្បន្នភាពភាសា",
  languageChanged: "✅ បានប្តូរភាសាទៅ <b>ខ្មែរ</b>។",
  chooseTopic: "📚 <b>សូមជ្រើសរើសប្រធានបទ</b>",
  randomQuestion: "🎲 សំណួរចៃដន្យ",
  noQuestions:
    "📭 មិនទាន់មានសំណួរដែលបានពិនិត្យនៅឡើយទេ។\nសូមស្នើអ្នកគ្រប់គ្រងឱ្យបន្ថែម និងអនុម័តសំណួរ។",
  notActive: "នេះមិនមែនជាសំណួរបច្ចុប្បន្នរបស់អ្នកទេ។ សូមចាប់ផ្តើម /quiz ម្តងទៀត។",
  expired: "សំណួរនេះផុតកំណត់ហើយ។ សូមចាប់ផ្តើម /quiz ម្តងទៀត។",
  correctToast: "✅ ត្រឹមត្រូវ!",
  incorrectToast: "❌ មិនត្រឹមត្រូវ",
  correct: "✅ <b>ត្រឹមត្រូវ!</b>",
  incorrect: (option: OptionKey) => `❌ <b>មិនត្រឹមត្រូវ។</b> ចម្លើយត្រឹមត្រូវគឺ <b>${option}</b>។`,
  explanation: "💡 <b>ការពន្យល់</b>",
  nextQuestion: "➡️ សំណួរបន្ទាប់",
  askPrompt: "🤖 សូមវាយសំណួររបស់អ្នកសម្រាប់ជំនួយការ AI៖",
  askPlaceholder: "ឧ. តើ blank ក្នុង spectrophotometry ជាអ្វី?",
  askUsage:
    "សូមវាយសំណួរបន្ទាប់ពីពាក្យបញ្ជា ឧទាហរណ៍៖\n" +
    "<code>/ask តើ blank ក្នុង spectrophotometry ជាអ្វី?</code>",
  thinking: "🤔 កំពុងគិត…",
  aiFooter: "<i>ℹ️ សម្រាប់ការសិក្សាតែប៉ុណ្ណោះ។ សូមអនុវត្តតាម SOP ដែលបានអនុម័តជានិច្ច។</i>",
  aiUnavailable: "⚠️ សេវា AI មិនអាចប្រើបានបណ្តោះអាសន្ន។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
  videos: "🎥 បណ្ណាល័យវីដេអូនឹងមកដល់ឆាប់ៗនេះ។",
  documents: "📄 បណ្ណាល័យឯកសារនឹងមកដល់ឆាប់ៗនេះ។",
};

export const strings: Record<Language, Strings> = { en, km };

/** Every translation of a menu label, for `bot.hears`. */
export const menuLabels = (key: keyof Strings["menu"]) => [en.menu[key], km.menu[key]];

/** Every translation of the AI prompt, to recognise replies to it. */
export const askPrompts = [en.askPrompt, km.askPrompt];
