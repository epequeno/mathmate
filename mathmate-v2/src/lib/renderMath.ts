import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * LRU cache for KaTeX render results.
 * Prevents re-rendering identical expressions (most common in repeated formulas).
 */
class KaTeXCache {
  private cache = new Map<string, string>();
  private readonly max: number;

  constructor(max = 200) {
    this.max = max;
  }

  get(tex: string, displayMode: boolean): string {
    const key = `${displayMode ? "D:" : "I:"}${tex}`;
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }

    let result: string;
    try {
      result = katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        errorColor: "#cc0000",
        strict: false,
      });
    } catch {
      result = `<span style="color:#cc0000">${tex}</span>`;
    }

    // Evict least recently used if at capacity
    if (this.cache.size >= this.max) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
    return result;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const katexCache = new KaTeXCache(200);

/** Render inline math: $...$ */
export function renderInlineMath(tex: string): string {
  return katexCache.get(tex, false);
}

/** Render display math: $$...$$ */
export function renderDisplayMath(tex: string): string {
  return katexCache.get(tex, true);
}

/**
 * Render LaTeX-like expressions by detecting common delimiters.
 * Used for the math composer preview — individual expressions, not full docs.
 */
export function renderLatexPreview(tex: string): string {
  if (!tex.trim()) return "";
  try {
    return katexCache.get(tex, false);
  } catch {
    try {
      return katexCache.get(tex, true);
    } catch {
      return `<span style="color:#cc0000;font-size:0.9em">${tex}</span>`;
    }
  }
}

/** Exported for debugging/hot-reload */
export function clearKaTeXCache(): void {
  katexCache.clear();
}