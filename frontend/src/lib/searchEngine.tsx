import React from "react";

export interface MatchScore {
  isMatch: boolean;
  score: number; // Higher is better
  tier: number; // 0 = Exact, 1 = Prefix, 2 = Word Prefix, 3 = Contiguous Substring, 4 = All Words, 5 = Words in Order, 6 = Partial
  matchedWords: string[];
}

/**
 * Normalizes string by trimming and converting to lowercase.
 */
export function normalizeQuery(q: string): string {
  return (q || "").trim().toLowerCase();
}

/**
 * Extracts distinct query words, ignoring extra whitespace.
 */
export function extractQueryTokens(rawQuery: string): string[] {
  const clean = normalizeQuery(rawQuery);
  if (!clean) return [];
  return clean.split(/[\s,+/_-]+/).filter(Boolean);
}

/**
 * Escapes regex special characters.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Evaluates match quality between a search query and a list of searchable field strings.
 * Returns a score and tier (lower tier number = higher priority).
 */
export function evaluateMatch(fields: (string | null | undefined)[], rawQuery: string): MatchScore {
  const q = normalizeQuery(rawQuery);
  if (!q) {
    return { isMatch: true, score: 0, tier: 99, matchedWords: [] };
  }

  const validFields = fields.filter((f): f is string => Boolean(f && typeof f === "string"));
  const lowerFields = validFields.map((f) => f.toLowerCase());
  const combinedText = lowerFields.join(" ");

  const tokens = extractQueryTokens(q);
  if (tokens.length === 0) {
    return { isMatch: true, score: 0, tier: 99, matchedWords: [] };
  }

  // 1. TIER 0: Exact match in any single field
  for (const f of lowerFields) {
    if (f === q) {
      return { isMatch: true, score: 10000, tier: 0, matchedWords: [q] };
    }
  }

  // 2. TIER 1: Prefix match on the primary field or any field
  for (let i = 0; i < lowerFields.length; i++) {
    const f = lowerFields[i];
    if (f.startsWith(q)) {
      // Shorter strings where prefix takes up more percentage score higher
      const penalty = Math.min(50, f.length - q.length);
      const fieldBonus = i === 0 ? 50 : 0; // bonus if primary field (e.g. product name)
      return { isMatch: true, score: 8000 + fieldBonus - penalty, tier: 1, matchedWords: [q] };
    }
  }

  // 3. TIER 2: Any word in any field starts with query
  for (let i = 0; i < lowerFields.length; i++) {
    const f = lowerFields[i];
    const words = f.split(/[\s\-_\/()]+/);
    const wordIdx = words.findIndex((w) => w.startsWith(q));
    if (wordIdx !== -1) {
      return { isMatch: true, score: 7000 - wordIdx * 10, tier: 2, matchedWords: [q] };
    }
  }

  // 4. TIER 3: Contiguous substring match inside any field
  for (let i = 0; i < lowerFields.length; i++) {
    const f = lowerFields[i];
    const pos = f.indexOf(q);
    if (pos !== -1) {
      return { isMatch: true, score: 6000 - pos * 5, tier: 3, matchedWords: [q] };
    }
  }

  // 5. TIER 4: All query tokens are present across the fields (Best Match for multi-word queries)
  const allTokensPresent = tokens.every((token) => combinedText.includes(token));
  if (allTokensPresent) {
    // Check if tokens appear in order
    let inOrder = true;
    let lastPos = -1;
    for (const token of tokens) {
      const pos = combinedText.indexOf(token, lastPos + 1);
      if (pos === -1) {
        inOrder = false;
        break;
      }
      lastPos = pos;
    }

    // Bonus if all tokens exist within a single field
    const inSingleField = lowerFields.some((f) => tokens.every((token) => f.includes(token)));

    const score = 5000 + (inOrder ? 300 : 0) + (inSingleField ? 200 : 0);
    return { isMatch: true, score, tier: 4, matchedWords: tokens };
  }

  // 6. TIER 5: Words in order (Acronym or sequential matching)
  // Check if each token matches the start of consecutive words in any field
  let sequentialMatch = false;
  for (const f of lowerFields) {
    const words = f.split(/[\s\-_\/()]+/);
    let tokenIdx = 0;
    for (const w of words) {
      if (tokenIdx < tokens.length && w.startsWith(tokens[tokenIdx])) {
        tokenIdx++;
      }
    }
    if (tokenIdx === tokens.length && tokens.length > 1) {
      sequentialMatch = true;
      break;
    }
  }
  if (sequentialMatch) {
    return { isMatch: true, score: 4000, tier: 5, matchedWords: tokens };
  }

  // 7. TIER 6: Majority / partial tokens match (for queries with >= 2 words)
  if (tokens.length >= 2) {
    const matchedTokens = tokens.filter((token) => combinedText.includes(token));
    if (matchedTokens.length >= Math.ceil(tokens.length * 0.6)) {
      return {
        isMatch: true,
        score: 3000 + (matchedTokens.length / tokens.length) * 500,
        tier: 6,
        matchedWords: matchedTokens,
      };
    }
  }

  return { isMatch: false, score: 0, tier: 99, matchedWords: [] };
}

/**
 * Searches and ranks a collection of items based on query matching quality.
 */
export function searchAndRank<T>(
  items: T[],
  rawQuery: string,
  getFields: (item: T) => (string | null | undefined)[]
): { item: T; score: number; tier: number; matchedWords: string[] }[] {
  const q = normalizeQuery(rawQuery);
  if (!q) {
    return items.map((item) => ({ item, score: 0, tier: 0, matchedWords: [] }));
  }

  const results: { item: T; score: number; tier: number; matchedWords: string[] }[] = [];

  for (const item of items) {
    const fields = getFields(item);
    const match = evaluateMatch(fields, q);
    if (match.isMatch) {
      results.push({
        item,
        score: match.score,
        tier: match.tier,
        matchedWords: match.matchedWords,
      });
    }
  }

  // Sort descending by score (Tier 0 -> Tier 1 -> Tier 2 ... then alphabetically by primary field)
  results.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    const aPrimary = (getFields(a.item)[0] || "").toLowerCase();
    const bPrimary = (getFields(b.item)[0] || "").toLowerCase();
    return aPrimary.localeCompare(bPrimary);
  });

  return results;
}

/**
 * React Component to highlight matching search characters/words inside text.
 * Strictly highlights from the beginning (prefix of string or word starts),
 * never scattering single-letter highlights across internal characters.
 */
export function HighlightedText({
  text,
  query,
  className = "",
  highlightClassName = "bg-sky-500/15 text-sky-600 dark:bg-sky-400/20 dark:text-sky-300 font-semibold px-0.5 rounded border border-sky-500/30 dark:border-sky-400/30",
}: {
  text?: string | null;
  query?: string | null;
  className?: string;
  highlightClassName?: string;
}): React.ReactElement {
  if (!text) return <span className={className}>-</span>;

  const rawQ = normalizeQuery(query || "");
  if (!rawQ) {
    return <span className={className}>{text}</span>;
  }

  // 1. If text starts with the search query, highlight ONLY the beginning prefix!
  if (text.toLowerCase().startsWith(rawQ)) {
    const matchPart = text.slice(0, rawQ.length);
    const restPart = text.slice(rawQ.length);
    return (
      <span className={className}>
        <mark className={highlightClassName}>{matchPart}</mark>
        {restPart}
      </span>
    );
  }

  const tokens = extractQueryTokens(rawQ);
  if (tokens.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // 2. Only match at word boundaries (\b), never inside words
  // e.g. "a" in "Patanjali", "Bandage", "BATCH" will NOT match!
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${sortedTokens.map(escapeRegExp).join("|")})`, "gi");

  const parts = text.split(pattern);
  if (parts.length <= 1) {
    return <span className={className}>{text}</span>;
  }

  let highlightedCount = 0;
  // If query is short (<= 2 chars), only highlight the first matching word start to keep UI clean
  const maxHighlights = rawQ.length <= 2 ? 1 : 999;

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = sortedTokens.some((t) => t.toLowerCase() === part.toLowerCase());
        if (isMatch && highlightedCount < maxHighlights) {
          highlightedCount++;
          return (
            <mark key={index} className={highlightClassName}>
              {part}
            </mark>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
}
