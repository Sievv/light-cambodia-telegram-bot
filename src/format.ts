// Helpers for Telegram's HTML parse mode.
// https://core.telegram.org/bots/api#html-style

/** Telegram's hard limit is 4096 chars; leave headroom for tags added by conversion. */
const CHUNK_LIMIT = 3500;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert the common Markdown that LLMs produce into Telegram-safe HTML.
 * Code and links are stashed first so their contents are never re-formatted.
 */
export function markdownToHtml(markdown: string): string {
  const slots: string[] = [];
  const stash = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;

  let s = markdown.replace(/\r\n/g, "\n");

  s = s.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang: string, code: string) => {
    const body = escapeHtml(code.replace(/\n$/, ""));
    return stash(
      lang
        ? `<pre><code class="language-${escapeHtml(lang)}">${body}</code></pre>`
        : `<pre>${body}</pre>`,
    );
  });
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => stash(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text: string, url: string) =>
    stash(`<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`),
  );

  s = escapeHtml(s);

  s = s.replace(/^#{1,6}\s+(.+)$/gm, (_, title: string) => `<b>${title.replace(/\*\*/g, "")}</b>`);
  s = s.replace(/^(\s*)[*-]\s+/gm, "$1• ");
  s = s.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, "");
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/__(.+?)__/g, "<b>$1</b>");
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1<i>$2</i>");
  s = s.replace(/(^|\W)_(?!\s)([^_\n]+?)_(?!\w)/g, "$1<i>$2</i>");
  s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)]).trim();
}

/** Split long text on paragraph, then line, then hard boundaries. */
export function splitText(text: string, limit = CHUNK_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";

  const push = (piece: string, sep: string) => {
    if (!current) current = piece;
    else if (current.length + sep.length + piece.length <= limit) current += sep + piece;
    else {
      chunks.push(current);
      current = piece;
    }
  };

  for (const paragraph of text.split("\n\n")) {
    if (paragraph.length <= limit) {
      push(paragraph, "\n\n");
      continue;
    }
    for (const line of paragraph.split("\n")) {
      for (let i = 0; i < line.length; i += limit) push(line.slice(i, i + limit), "\n");
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
