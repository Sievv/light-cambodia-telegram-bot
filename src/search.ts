// Fuzzy question search over the Q&A bank, done in memory (no AI).
//
// Khmer is written without spaces between words, so word matching does not work.
// Instead each text is cut into overlapping 3-character pieces ("trigrams") and
// rows are ranked by how much of the user's text they share, with rare pieces
// (like "expired" or "ផុតកំណត់") counting more than common ones (like "the" or "ម៉ាស៊ីន").

export interface QaRow {
  id: string;
  issue_id: string;
  category: string;
  question_en: string;
  question_km: string;
  answer_en: string;
  answer_km: string;
  priority: string;
  escalate_to: string;
}

export interface Match {
  row: QaRow;
  score: number;
}

const KHMER = /[ក-៿]/;

export const isKhmer = (text: string) => KHMER.test(text);

export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "") // zero-width spaces common in Khmer typing
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const word of normalize(text).split(" ")) {
    if (!word) continue;
    const chars = Array.from(` ${word} `);
    for (let i = 0; i + 3 <= chars.length; i++) grams.add(chars.slice(i, i + 3).join(""));
  }
  return grams;
}

export class QaIndex {
  private readonly postings = new Map<string, number[]>();
  private readonly idf = new Map<string, number>();
  private readonly docWeight: number[] = [];
  readonly rows: QaRow[];

  constructor(rows: QaRow[]) {
    this.rows = rows;
    const docs = rows.map((r) => trigrams(`${r.question_en} ${r.question_km}`));
    docs.forEach((grams, i) => {
      for (const g of grams) {
        let list = this.postings.get(g);
        if (!list) this.postings.set(g, (list = []));
        list.push(i);
      }
    });
    for (const [g, list] of this.postings) this.idf.set(g, Math.log(1 + rows.length / list.length));
    for (const grams of docs) {
      let w = 0;
      for (const g of grams) w += this.idf.get(g)!;
      this.docWeight.push(w || 1);
    }
  }

  /** Best match per issue (question variants of one issue are collapsed), highest score first. */
  search(query: string, limit = 4, minScore = 0.35): Match[] {
    const grams = trigrams(query);
    let queryWeight = 0;
    const overlap = new Map<number, number>();
    for (const g of grams) {
      // Pieces never seen in the bank still count against the score (typo or off-topic).
      const w = this.idf.get(g) ?? Math.log(1 + this.rows.length);
      queryWeight += w;
      for (const i of this.postings.get(g) ?? []) overlap.set(i, (overlap.get(i) ?? 0) + w);
    }
    if (!queryWeight) return [];

    const bestPerIssue = new Map<string, Match>();
    for (const [i, shared] of overlap) {
      // Mostly "how much of what they typed is in this question", plus a little
      // "how much of this question did they type" so short, precise questions win ties.
      const score = 0.8 * (shared / queryWeight) + 0.2 * (shared / this.docWeight[i]);
      if (score < minScore) continue;
      const row = this.rows[i];
      const prev = bestPerIssue.get(row.issue_id);
      if (!prev || score > prev.score) bestPerIssue.set(row.issue_id, { row, score });
    }
    return [...bestPerIssue.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
