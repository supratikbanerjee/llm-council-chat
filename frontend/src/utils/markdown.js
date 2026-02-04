export function normalizeMathDelimiters(text) {
  if (typeof text !== 'string' || text.length === 0) return text;

  let normalized = text;

  // Fix common typo: "\$$" -> "$$"
  normalized = normalized.replace(/\\\s*\$\$/g, '$$');

  // Convert \[ ... \] and \( ... \) to KaTeX delimiters
  normalized = normalized.replace(/\\\[(\s*[\s\S]*?\s*)\\\]/g, (_, inner) => `$$\n${inner.trim()}\n$$`);
  normalized = normalized.replace(/\\\((\s*[\s\S]*?\s*)\\\)/g, (_, inner) => `$${inner.trim()}$`);

  // Convert bracketed LaTeX like [ \text{...} ] to display math (avoid markdown links)
  normalized = normalized.replace(/\[\s*(\\[\s\S]*?)\s*\]/g, (match, inner, offset, full) => {
    const nextChar = full.slice(offset + match.length, offset + match.length + 1);
    if (nextChar === '(') return match;
    return `$$\n${inner.trim()}\n$$`;
  });

  // Remove stray trailing backslashes or lone backslash lines
  normalized = normalized.replace(/\\+\s*$/gm, '');
  normalized = normalized.replace(/^\s*\\+\s*$/gm, '');

  const isMathLine = (line) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('\\')) return true;
    return /\\(text|frac|left|right|times|cdot|approx|displaystyle|sqrt|sum|prod|begin|end)/.test(t);
  };

  const sanitizeMath = (value) => {
    const cleaned = value
      .replace(/\$\$/g, '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/`/g, '')
      .trim();
    if (!cleaned) return null;
    return cleaned.replace(/(^|[^\\])%/g, '$1\\%');
  };

  const lines = normalized.split('\n');
  const out = [];

  for (const line of lines) {
    if (line.includes('$$')) {
      const segments = line.split('$$');
      for (let i = 0; i < segments.length; i += 1) {
        const seg = segments[i];
        if (i % 2 === 0) {
          if (seg) out.push(seg);
        } else {
          const math = sanitizeMath(seg);
          if (math) {
            out.push('$$');
            out.push(math);
            out.push('$$');
          }
        }
      }
      continue;
    }

    if (isMathLine(line)) {
      const math = sanitizeMath(line);
      if (math) {
        out.push('$$');
        out.push(math);
        out.push('$$');
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}
