import type {
  RegExpAlternative,
  RegExpClassItem,
  RegExpDisjunction,
  RegExpPattern,
  RegExpQuantifier,
  RegExpTerm,
} from "./regexp.ts";

function quantifierText(quantifier: RegExpQuantifier): string {
  const maximum = Number.isFinite(quantifier.maximum)
    ? String(quantifier.maximum)
    : "inf";
  const order = quantifier.greedy ? "greedy" : "lazy";
  return `${quantifier.minimum}..${maximum} ${order}`;
}

function characterText(value: number): string {
  const text = String.fromCodePoint(value);
  const printable = value > 0x20 && value !== 0x7f && !/\s/u.test(text);
  const code = value.toString(16).padStart(4, "0");
  return printable ? `u+${code} ${text}` : `u+${code}`;
}

function printClassItem(item: RegExpClassItem, indent: string): string {
  if (item.kind === "character") {
    return `${indent}char ${characterText(item.value)}\n`;
  }
  if (item.kind === "range") {
    return (
      `${indent}range ${characterText(item.start.value)} .. ` +
      `${characterText(item.end.value)}\n`
    );
  }
  if (item.kind === "class-escape") {
    return `${indent}class-escape ${item.negated ? "not " : ""}${item.set}\n`;
  }
  const value = item.value == null ? "" : `=${item.value}`;
  return (
    `${indent}property ${item.negated ? "not " : ""}` +
    `${item.property}${value}\n`
  );
}

function printTerm(term: RegExpTerm, indent: string): string {
  const nested = `${indent}  `;
  if (term.kind === "quantified") {
    return (
      `${indent}repeat ${quantifierText(term.quantifier)}\n` +
      printTerm(term.atom, nested)
    );
  }
  if (term.kind === "assertion") return `${indent}assert ${term.assertion}\n`;
  if (term.kind === "lookaround") {
    const polarity = term.negated ? "negative" : "positive";
    return (
      `${indent}look ${term.direction} ${polarity}\n` +
      printDisjunction(term.body, nested)
    );
  }
  if (term.kind === "character") {
    return `${indent}char ${characterText(term.value)}\n`;
  }
  if (term.kind === "dot") return `${indent}dot\n`;
  if (term.kind === "class-escape") {
    return `${indent}class-escape ${term.negated ? "not " : ""}${term.set}\n`;
  }
  if (term.kind === "unicode-property") {
    const value = term.value == null ? "" : `=${term.value}`;
    return (
      `${indent}property ${term.negated ? "not " : ""}` +
      `${term.property}${value}\n`
    );
  }
  if (term.kind === "character-class") {
    return (
      `${indent}class${term.negated ? " negated" : ""}\n` +
      term.items.map((item) => printClassItem(item, nested)).join("")
    );
  }
  if (term.kind === "capturing-group") {
    const name = term.name == null ? "" : ` ${term.name}`;
    return (
      `${indent}capture ${term.index}${name}\n` +
      printDisjunction(term.body, nested)
    );
  }
  if (term.kind === "group") {
    return `${indent}group\n${printDisjunction(term.body, nested)}`;
  }
  if (term.kind === "modifier-group") {
    const enabled = term.enabled.join("");
    const disabled = term.disabled.join("");
    return (
      `${indent}modifiers +${enabled} -${disabled}\n` +
      printDisjunction(term.body, nested)
    );
  }
  if (term.kind === "backreference") {
    return `${indent}backreference ${term.index}\n`;
  }
  return `${indent}backreference ${term.name} -> ${term.indices.join(",")}\n`;
}

function printAlternative(
  alternative: RegExpAlternative,
  indent: string,
): string {
  const nested = `${indent}  `;
  return (
    `${indent}alternative\n` +
    alternative.terms.map((term) => printTerm(term, nested)).join("")
  );
}

function printDisjunction(
  disjunction: RegExpDisjunction,
  indent: string,
): string {
  const nested = `${indent}  `;
  return (
    `${indent}disjunction\n` +
    disjunction.alternatives
      .map((alternative) => printAlternative(alternative, nested))
      .join("")
  );
}

/**
 * Render one validated pattern as an indented tree.
 *
 * The dump is the reviewed way to inspect choice order, capture
 * numbering, and reference resolution before any matcher exists. It
 * records the owned model rather than the written text, so two patterns
 * that differ only in how a character was escaped share one dump.
 */
export function printRegExpPattern(pattern: RegExpPattern): string {
  const captures = pattern.captures
    .map((capture) =>
      capture.name == null
        ? `${capture.index}`
        : `${capture.index}:${capture.name}`,
    )
    .join(" ");
  return (
    `pattern /${pattern.source}/${pattern.flags.text}\n` +
    `  captures ${captures}\n` +
    printDisjunction(pattern.body, "  ")
  );
}
