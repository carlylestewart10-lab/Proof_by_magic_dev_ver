// modules/rendering.js
// Pure helpers used by gameplay/progress. No DOM reads or global state.

export function setOnce(s) { return (s || '').toString(); }

export function sanitize(s) {
  return setOnce(s).trim();
}

export function translateInput(s) {
  // Human-friendly shorthands -> symbols
  return setOnce(s)
    .replace(/<->/g, '↔')
    .replace(/->/g, '→')
    .replace(/&/g, '∧')
    .replace(/and/g, '∧')
    .replace(/\bimplies\b/gi, '→')
    .replace(/\biff\b/gi, '↔')
    .replace(/\bequivalent to\b/gi, '↔')
    .replace(/\bequivalent\b/gi, '↔')
    .replace(/\bif and only if\b/gi, '↔')
    .replace(/\bF\b/g, '⊥')
    .replace(/\bnot\s+([A-Za-z()]+)\b/gi, '¬$1');
}

export function normalizeFormula(s) {
  return sanitize(s).replace(/\s+/g, ' ');
}

export function parenthesize(s) {
  const t = sanitize(s);
  if (/^[A-Za-z⊥]$/.test(t)) return t;
  return `(${t})`;
}

export function formatFormulaSpacing(s) {
  if (!s) return '';
  let t = String(s);
  t = t.replace(/([∧∨→↔⊥¬()])/g, ' $1 ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// --- Paren utilities ---

export function stripOuterParens(s) {
  let str = sanitize(s);
  if (!(str.startsWith('(') && str.endsWith(')'))) return str;
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0 && i < str.length - 1) return str; // outer not global
    }
  }
  return str.slice(1, -1).trim();
}

export function stripOuterParensAll(s) {
  let prev, cur = sanitize(s);
  do { prev = cur; cur = stripOuterParens(cur); } while (cur !== prev);
  return cur;
}

// Split on top-level → / -> (ignoring inside parentheses)
export function splitTopLevelImplication(input) {
  // Normalize arrows and remove outermost wrapping parens first
  let str = String(input || '').trim().replace(/->/g, '→');
  str = stripOuterParensAll(str);  // <-- key fix

  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && ch === '→') {
      return {
        left: stripOuterParensAll(str.slice(0, i).trim()),
        right: stripOuterParensAll(str.slice(i + 1).trim())
      };
    }
  }
  return null;
}

export function splitTopLevelConjunction(input) {
  let str = sanitize(input).replace(/&&/g, '∧').replace(/&/g, '∧');
  str = stripOuterParensAll(str);

  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (ch === '∧' && depth === 0) {
      return {
        left:  stripOuterParensAll(str.slice(0, i).trim()),
        right: stripOuterParensAll(str.slice(i + 1).trim())
      };
    }
  }
  return null;
}


