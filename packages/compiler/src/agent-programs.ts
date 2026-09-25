import type { AgentSourceTemplate } from "./agent-templates.ts";
import { type AgentHolePlaceholder, buildHir } from "./hir-build.ts";
import type {
  CompilerOptions,
  MirFunction,
  MirOperation,
  MirProgram,
} from "./mir.ts";
import { buildMir } from "./mir-build.ts";
import type { Diagnostic } from "./source.ts";
import type { SourceFrontend } from "./syntax.ts";

/** An agent program compiled from one template, or why it was not. */
export type AgentProgramResult =
  | { readonly diagnostics: readonly Diagnostic[] }
  | { readonly mir: MirProgram };

/*
 * The text with every `\uXXXX` and `\u{X...}` escape replaced by the code
 * point it spells. It over-approximates the identifiers an escape can
 * name, because it also decodes escapes inside strings and comments,
 * which only makes a placeholder name more conservative.
 */
function decodeUnicodeEscapes(text: string): string {
  return text.replaceAll(
    /\\u(?:\{([0-9A-Fa-f]+)\}|([0-9A-Fa-f]{4}))/gu,
    (escape, braced: string | undefined, fixed: string | undefined) => {
      const codePoint = Number.parseInt(braced ?? fixed ?? "", 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : escape;
    },
  );
}

/*
 * Whether the character beside a hole ends every token there. A decimal
 * literal cannot touch an identifier character, a digit, or a dot without
 * forming a different token, and a non-ASCII neighbor may be an
 * identifier character, so each of those rejects the template.
 */
function separatesHole(character: string | undefined): boolean {
  if (character == null) return true;
  const code = character.charCodeAt(0);
  if (code >= 0x80) return false;
  return !/[A-Za-z0-9$_.\\]/u.test(character);
}

function templateDiagnostic(
  template: AgentSourceTemplate,
  sourceId: string,
  message: string,
): Diagnostic {
  return {
    byteRange: { end: 0, start: 0 },
    code: "OSEO1001",
    message,
    range: template.range,
    sourceId,
  };
}

/**
 * Compiles one agent program from its template (ADR 0026). The program
 * is the template text with each hole replaced by a fresh identifier that
 * resolves to the hole's Number, so it evaluates exactly what a start
 * source reads when each hole holds a decimal integer literal, which is
 * all the runtime lets a hole match: both replacements are one
 * PrimaryExpression token in the same position. The template is rejected
 * unless every hole is delimited as one token, the text with `0` in each
 * hole parses, and each placeholder is resolved as exactly one identifier
 * read and nothing else.
 */
export function compileAgentTemplate(
  frontend: SourceFrontend,
  template: AgentSourceTemplate,
  index: number,
  mainSourceId: string,
  options: CompilerOptions,
): AgentProgramResult {
  const sourceId = agentSourceId(mainSourceId, index);
  const { segments } = template;
  // A placeholder must be fresh against every identifier the template can
  // spell, including one written with Unicode escapes, so the check runs
  // over the raw text and over the text with every escape decoded.
  const text = segments.join("");
  const decoded = decodeUnicodeEscapes(text);
  const names = segments.slice(1).map((_, hole) => {
    let name = `$262AgentHole${hole}`;
    while (text.includes(name) || decoded.includes(name)) name = `_${name}`;
    return name;
  });
  for (let hole = 0; hole < names.length; hole += 1) {
    if (
      !separatesHole(segments[hole]?.at(-1)) ||
      !separatesHole(segments[hole + 1]?.at(0))
    ) {
      return {
        diagnostics: [
          templateDiagnostic(
            template,
            mainSourceId,
            `Agent source template hole ${hole} is not delimited as one ` +
              "numeric literal token.",
          ),
        ],
      };
    }
  }
  const literal = frontend.parse({ source: segments.join("0"), sourceId });
  if (literal.program == null) return { diagnostics: literal.diagnostics };
  // Each placeholder's UTF-8 byte span, which the one read that may
  // resolve to the hole must occupy exactly.
  const encoder = new TextEncoder();
  const holes: AgentHolePlaceholder[] = [];
  let source = segments[0] ?? "";
  for (const [position, name] of names.entries()) {
    const start = encoder.encode(source).length;
    holes.push({ name, span: { end: start + name.length, start } });
    source += name + (segments[position + 1] ?? "");
  }
  const parsed = frontend.parse({ source, sourceId });
  if (parsed.program == null) return { diagnostics: parsed.diagnostics };
  const hir = buildHir(parsed.program, { agentHoles: holes });
  if (hir.program == null) return { diagnostics: hir.diagnostics };
  const mir = buildMir(hir.program, { ...options, test262Host: false });
  const split = (operation: MirOperation): MirOperation => {
    const functionSource = operation.functionSource;
    if (functionSource == null) return operation;
    const functionSourceHoles = splitAtPlaceholders(functionSource, names);
    return functionSourceHoles == null
      ? operation
      : { ...operation, functionSourceHoles };
  };
  const splitFunction = (functionValue: MirFunction): MirFunction => ({
    ...functionValue,
    blocks: functionValue.blocks.map((block) => ({
      ...block,
      operations: block.operations.map(split),
    })),
  });
  return {
    mir: {
      ...mir,
      agentProgram: index,
      functions: mir.functions.map(splitFunction),
      script: splitFunction(mir.script),
    },
  };
}

/*
 * A function's source text split at every placeholder it contains, or
 * undefined when it contains none. Each placeholder is absent from the
 * template's own text, and a hole never touches an identifier character,
 * so every occurrence is the hole it names.
 */
function splitAtPlaceholders(
  text: string,
  names: readonly string[],
): { readonly holes: readonly number[]; readonly runs: string[] } | undefined {
  const holeIndexes: number[] = [];
  const runs: string[] = [];
  let position = 0;
  let run = "";
  while (position < text.length) {
    // The longest placeholder wins, so hole 1 never claims hole 10.
    let hole = -1;
    for (const [index, name] of names.entries()) {
      if (
        text.startsWith(name, position) &&
        (hole < 0 || name.length > names[hole]!.length)
      ) {
        hole = index;
      }
    }
    if (hole < 0) {
      run += text[position];
      position += 1;
      continue;
    }
    runs.push(run);
    run = "";
    holeIndexes.push(hole);
    position += names[hole]!.length;
  }
  runs.push(run);
  return holeIndexes.length === 0 ? undefined : { holes: holeIndexes, runs };
}

/** The source identity an agent program's diagnostics report. */
export function agentSourceId(mainSourceId: string, index: number): string {
  return `${mainSourceId}#agent-${index}`;
}
