/** Maximum executable C text assigned to one outlined native helper. */
const chunkBytes = 16_384;

/** Keep compiler IR retention bounded across many outlined helpers. */
export class BodyUnits {
  #unit = 1;
  #bytes = 0;

  /** Assign consecutive definitions to bounded compiler translation units. */
  assign(bytes: number): number {
    if (this.#bytes + bytes > 262_144 && this.#bytes > 0) {
      this.#unit += 1;
      this.#bytes = 0;
    }
    this.#bytes += bytes;
    return this.#unit;
  }

  /** Number of supplemental compiler units, excluding the launcher. */
  get count(): number {
    return this.#unit;
  }
}

/** Standalone emission includes everything; build wrappers select one unit. */
export function bodyUnit(source: string, unit: number): string {
  return (
    `#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == ${unit}\n` +
    source +
    "\n#endif\n"
  );
}

/** An opaque C condition keeps both branches; a unit condition selects one. */
interface UnitConditional {
  readonly alternateSeen: boolean;
  readonly parentIncluded: boolean;
  readonly selected: boolean | undefined;
}

/**
 * Resolve only the unit selectors this emitter owns, leaving C resource
 * guards and all common text intact. Blank excluded lines preserve logical
 * line numbers when the caller maps the unit back to its aggregate source.
 * This is not a general C preprocessor; unexpected unit conditions fail.
 */
export function selectBodyUnit(source: string, unit: number): string {
  if (!Number.isSafeInteger(unit) || unit < 0) {
    throw new Error(`Invalid native body unit ${unit}.`);
  }
  const literalsAndComments = new RegExp(
    [
      String.raw`/\*[\s\S]*?\*/`,
      String.raw`//(?:\\\r?\n|[^\n])*`,
      String.raw`"(?:\\[\s\S]|[^"\\])*"`,
      String.raw`'(?:\\[\s\S]|[^'\\])*'`,
    ].join("|"),
    "gu",
  );
  const masked = source
    .replace(literalsAndComments, (text) => text.replace(/[^\n]/gu, " "))
    .split("\n");
  const conditionals: UnitConditional[] = [];
  let included = true;
  const selected = source.split("\n").map((line, index) => {
    const directive = masked[index]!.match(
      /^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$/u,
    );
    if (directive == null) return included ? line : "";
    const kind = directive[1];
    const condition = directive[2]!.trim();
    if (kind === "elif" && condition.includes("OSEO_C_BODY_UNIT")) {
      throw new Error("Native unit selectors do not admit elif.");
    }
    if (kind === "if" || kind === "ifdef" || kind === "ifndef") {
      const selector = condition.match(
        /^!defined\(OSEO_C_BODY_UNIT\) \|\| OSEO_C_BODY_UNIT == (\d+)$/u,
      );
      if (condition.includes("OSEO_C_BODY_UNIT") && selector == null) {
        throw new Error(`Unexpected native unit condition: ${condition}.`);
      }
      const matches =
        selector == null ? undefined : Number(selector[1]) === unit;
      conditionals.push({
        alternateSeen: false,
        parentIncluded: included,
        selected: matches,
      });
      if (matches == null) return included ? line : "";
      included = included && matches;
      return "";
    }
    const current = conditionals.at(-1);
    if (current == null) {
      throw new Error(`Unmatched native unit directive: ${kind}.`);
    }
    if (kind === "endif") {
      conditionals.pop();
      included = current.parentIncluded;
    } else if (current.selected != null) {
      if (kind === "elif") {
        throw new Error("Native unit selectors do not admit elif.");
      }
      if (current.alternateSeen) {
        throw new Error("Native unit selectors admit only one else.");
      }
      conditionals[conditionals.length - 1] = {
        ...current,
        alternateSeen: true,
      };
      included = current.parentIncluded && !current.selected;
    }
    return current.selected == null && included ? line : "";
  });
  if (conditionals.length !== 0) {
    throw new Error("Unclosed native unit conditional.");
  }
  return selected.join("\n");
}

/** The owner retains roots and completion storage across outlined calls. */
export interface BoundedBody {
  readonly declarations: string;
  readonly execution: string;
}

const opaqueSyntax = new RegExp(
  [
    String.raw`/\*[\s\S]*?\*/`,
    String.raw`//(?:\\\r?\n|[^\n])*`,
    String.raw`"(?:\\[\s\S]|[^"\\])*"`,
    String.raw`'(?:\\[\s\S]|[^'\\])*'`,
  ].join("|"),
  "gu",
);

/** Mask opaque tokens before inspecting the backend's own C syntax. */
function syntax(source: string): string {
  return source.replace(opaqueSyntax, (literal) => " ".repeat(literal.length));
}

/** Apply replacements only to syntax, preserving bytes inside C literals. */
export function replaceSyntax(
  source: string,
  pattern: RegExp,
  replacement: (...groups: string[]) => string,
): string {
  const masked = syntax(source);
  let result = "";
  let start = 0;
  for (const match of masked.matchAll(pattern)) {
    result += source.slice(start, match.index);
    result += replacement(...match.slice(1));
    start = match.index + match[0].length;
  }
  return result + source.slice(start);
}

/** A logical entry stays stable even when its code shares a C function. */
interface BodyEntry {
  readonly id: number;
  readonly statements: readonly string[];
  readonly next: number | undefined;
}

/** Materialized functions and the logical-entry table that calls them. */
interface GroupedBody {
  readonly helpers: readonly string[];
  readonly entries: readonly number[];
}

/** Pack atomic statements while charging every new entry and branch. */
function groupBody(
  chunks: readonly (readonly string[])[],
  labels: ReadonlyMap<string, number>,
  name: string,
  typeName: string,
  entryField: string,
  units: BodyUnits,
): GroupedBody {
  const target = (label: string): number => {
    const value = labels.get(label);
    if (value == null) throw new Error(`Missing C label ${label}.`);
    return value;
  };
  const rewrite = (source: string, edge: (id: number) => string): string =>
    replaceSyntax(
      replaceSyntax(source, /\bgoto\s+(bb\d+|abrupt);/gu, (label) =>
        edge(target(label!)),
      ),
      /\breturn result;/gu,
      () => "return SIZE_MAX;",
    );
  const dispatch = (entries: readonly BodyEntry[]): string =>
    `    (void)context;
    (void)body;
    switch (body->${entryField}) {
${entries.map(({ id }) => `    case ${id}u: goto entry_${id};`).join("\n")}
    default: return SIZE_MAX;
    }
`;
  // At most one additional entry per atomic statement can be needed.
  // Use its width for all edges, so cross-group returns can only shrink.
  const maximumId =
    chunks.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const edgeBound = Math.max(
    `goto entry_${maximumId};`.length,
    "return SIZE_MAX;".length,
  );
  const statementSizes = new Map<string, number>();
  const statementSize = (statement: string): number => {
    let size = statementSizes.get(statement);
    if (size == null) {
      size = rewrite(statement, () => " ".repeat(edgeBound)).length + 1;
      statementSizes.set(statement, size);
    }
    return size;
  };
  const entrySize = ({ id, statements }: BodyEntry): number =>
    `    entry_${id}:;\n`.length +
    statements.reduce((sum, statement) => sum + statementSize(statement), 0) +
    edgeBound +
    (statements.length === 0 ? 6 : 5);
  const bodySize = (entries: readonly BodyEntry[]): number =>
    dispatch(entries).length +
    entries.reduce((sum, entry) => sum + entrySize(entry), 0);

  let nextId = chunks.length;
  const pieces: BodyEntry[] = [];
  for (const [id, chunk] of chunks.entries()) {
    let pieceId = id;
    let statements: string[] = [];
    for (const statement of chunk) {
      const candidate = { id: pieceId, statements: [...statements, statement] };
      if (
        statements.length > 0 &&
        bodySize([{ ...candidate, next: undefined }]) > chunkBytes
      ) {
        pieces.push({ id: pieceId, statements, next: nextId });
        pieceId = nextId++;
        statements = [];
      }
      statements.push(statement);
    }
    pieces.push({
      id: pieceId,
      statements,
      next: id + 1 < chunks.length ? id + 1 : undefined,
    });
  }
  const groups: BodyEntry[][] = [];
  for (const piece of pieces) {
    const current = groups.at(-1);
    if (current == null || bodySize([...current, piece]) > chunkBytes) {
      groups.push([piece]);
    } else {
      current.push(piece);
    }
  }
  const entries: number[] = [];
  for (const [group, members] of groups.entries()) {
    for (const piece of members) entries[piece.id] = group;
  }
  const helpers = groups.map((members, group) => {
    const edge = (id: number): string =>
      entries[id] === group ? `goto entry_${id};` : `return ${id}u;`;
    const executable =
      dispatch(members) +
      members
        .map(
          ({ id, statements, next }) =>
            `    entry_${id}:;\n` +
            rewrite(statements.join("\n"), edge) +
            `\n    ${next == null ? "return SIZE_MAX;" : edge(next)}\n`,
        )
        .join("");
    return bodyUnit(
      `size_t ${name}_${group}(
    OseoContext *context, ${typeName} *body
) {
${executable}}`,
      units.assign(executable.length),
    );
  });
  return { helpers, entries };
}

/**
 * Outline large generated bodies without adding language calls or roots.
 * Helpers return a continuation index to an iterative owner. Every automatic
 * scalar lives in that owner's state, and static data keeps one identity.
 * Only backend-produced C is inspected; no user source is parsed here.
 */
export function boundBody(
  lines: readonly string[],
  name: string,
  frameCost: string,
  generator: boolean,
  usesCompletion: boolean,
  units?: BodyUnits,
  ownerUnit = 0,
): BoundedBody | undefined {
  if (lines.reduce((size, line) => size + line.length, 0) <= chunkBytes) {
    return undefined;
  }
  const statements: string[] = [];
  let depth = 0;
  let pending: string[] = [];
  const maskedSource = syntax(lines.join("\n"));
  let offset = 0;
  for (const line of lines) {
    pending.push(line);
    const masked = maskedSource.slice(offset, offset + line.length);
    offset += line.length;
    for (const character of masked) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
    }
    const boundary = maskedSource[offset++];
    if (depth === 0 && (boundary == null || boundary === "\n")) {
      statements.push(pending.join("\n"));
      pending = [];
    }
  }
  if (depth !== 0 || pending.length !== 0) {
    throw new Error("Generated C body has unbalanced statement scopes.");
  }
  const fields = new Map<string, string>();
  const statics: string[] = [];
  const staticNames: string[] = [];
  const chunks: string[][] = [[]];
  const labels = new Map<string, number>();
  let bytes = 0;
  for (let unit of statements) {
    const masked = syntax(unit);
    if (/^\s*static\s/u.test(masked)) {
      const identifier = masked.match(
        /^\s*static\s+(?:const\s+)?\w+\s*(?:\*\s*const\s*)?(\w+)\s*(?:\[|=)/u,
      )?.[1];
      if (identifier == null) {
        throw new Error("Generated static data has no owned identifier.");
      }
      staticNames.push(identifier);
      statics.push(unit);
      continue;
    }
    const label = masked.match(/^\s*(bb\d+|abrupt):;?\s*$/u)?.[1];
    if (label != null) {
      if (chunks.at(-1)!.length > 0) chunks.push([]);
      labels.set(label, chunks.length - 1);
      bytes = 0;
      continue;
    }
    unit = replaceSyntax(
      unit,
      new RegExp(
        "\\b((?:bool|int64_t|size_t|OseoFunctionEntry\\s+volatile)\\s+|" +
          "const OseoValue\\s*\\*\\s*)(\\w+)",
        "gu",
      ),
      (type, identifier) => {
        fields.set(identifier!, type!.trim());
        return identifier!;
      },
    );
    // A declaration without an initializer becomes a harmless read.
    unit = replaceSyntax(
      unit,
      /^\s*(fast_\d+);$/gu,
      (identifier) => `    (void)${identifier};`,
    );
    unit = replaceSyntax(
      unit,
      /\boseo_roots_release\(context, &frame\);/gu,
      () => "",
    );
    if (bytes + unit.length > chunkBytes && chunks.at(-1)!.length > 0) {
      chunks.push([]);
      bytes = 0;
    }
    chunks.at(-1)!.push(unit);
    bytes += unit.length;
  }
  const typeName = `${name}_state`;
  let entryField = "entry_index";
  while (fields.has(entryField) || staticNames.includes(entryField)) {
    entryField += "_";
  }
  const shared = [
    "roots",
    "result",
    "callee",
    "receiver",
    "argument_count",
    "arguments",
    "new_target",
    "generator",
    "completion",
  ];
  const aliases = [
    ...shared.map((field) => `#define ${field} (body->${field})`),
    "#define frame (*body->frame)",
    ...[...fields.keys()].map((field) => `#define ${field} (body->${field})`),
    ...staticNames.map((field) => `#define ${field} ${name}_${field}`),
  ];
  const grouped =
    units == null
      ? undefined
      : groupBody(chunks, labels, name, typeName, entryField, units);
  const helpers =
    grouped?.helpers ??
    chunks.map((chunk, index) => {
      let source = chunk.join("\n");
      source = replaceSyntax(source, /\bgoto\s+(bb\d+|abrupt);/gu, (label) => {
        const target = labels.get(label!);
        if (target == null) throw new Error(`Missing C label ${label}.`);
        return `return ${target}u;`;
      });
      source = replaceSyntax(
        source,
        /\breturn result;/gu,
        () => "return SIZE_MAX;",
      );
      const helper = `${units == null ? "static " : ""}size_t ${name}_${index}(
    OseoContext *context, ${typeName} *body
) {
    (void)context;
    (void)body;
${source}
    return ${index + 1 < chunks.length ? `${index + 1}u` : "SIZE_MAX"};
}`;
      return units == null
        ? helper
        : bodyUnit(helper, units.assign(source.length));
    });
  const staticData = statics.map((source) => {
    if (units == null) return source;
    const masked = syntax(source);
    const equals = masked.indexOf("=");
    const declaration = source
      .slice(0, equals)
      .replace(/\bstatic\s/u, "extern ");
    return `#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == ${ownerUnit}
${source.replace(/\bstatic\s/u, "")}
#else
${declaration};
#endif`;
  });
  const table = `static size_t (*const ${name}_chunks[])(
    OseoContext *, ${typeName} *
) = {
${(grouped?.entries ?? chunks.map((_, index) => index))
  .map((group) => `    ${name}_${group},`)
  .join("\n")}
};`;
  const declarations = `#if ${frameCost} <= OSEO_MAX_ACTIVE_FRAME_SLOTS
typedef struct {
    OseoRootFrame *frame;
    OseoValue *roots;
    OseoResult result;
    OseoValue callee, receiver, new_target, generator;
    size_t argument_count;
    const OseoValue *arguments;
    OseoCompletionRecord *completion;
${units == null ? "" : `    size_t ${entryField};\n`}${[...fields]
    .map(([field, type]) => `    ${type} ${field};`)
    .join("\n")}
} ${typeName};
${aliases.join("\n")}
${staticData.join("\n")}
${
  units == null
    ? ""
    : helpers
        .map(
          (_, index) =>
            `size_t ${name}_${index}(OseoContext *, ${typeName} *);`,
        )
        .join("\n")
}
${helpers.join("\n")}
${[...shared, "frame", ...fields.keys(), ...staticNames]
  .map((field) => `#undef ${field}`)
  .join("\n")}
${units == null ? table : bodyUnit(table, ownerUnit)}
#endif
`;
  const release = generator ? "" : "    oseo_roots_release(context, &frame);\n";
  const entrySelection =
    units == null ? "" : `        body.${entryField} = continuation;\n`;
  const dispatchLine =
    `        continuation = ${name}_chunks[continuation]` +
    "(context, &body);\n";
  const execution = `    ${typeName} body = {
        .frame = ${generator ? "NULL" : "&frame"},
        .roots = roots, .result = result,
        .callee = callee, .receiver = receiver,
        .argument_count = ${generator ? "0u" : "argument_count"},
        .arguments = ${generator ? "NULL" : "arguments"},
        .new_target = ${generator ? "oseo_undefined()" : "new_target"},
        .generator = ${generator ? "generator" : "oseo_undefined()"},
        .completion = ${usesCompletion ? "completion" : "NULL"}
    };
    size_t continuation = 0u;
    while (continuation != SIZE_MAX) {
${entrySelection}${dispatchLine}    }
${release}    return body.result;
`;
  return { declarations, execution };
}
