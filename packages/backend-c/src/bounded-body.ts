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

/** The owner retains roots and completion storage across outlined calls. */
export interface BoundedBody {
  readonly declarations: string;
  readonly execution: string;
}

/** Mask literals before inspecting the backend's own generated C syntax. */
function syntax(source: string): string {
  return source.replace(
    /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/gu,
    (literal) => " ".repeat(literal.length),
  );
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
  for (const line of lines) {
    pending.push(line);
    const masked = syntax(line);
    for (const character of masked) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
    }
    if (depth === 0) {
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
  const helpers = chunks.map((chunk, index) => {
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
${chunks.map((_, index) => `    ${name}_${index},`).join("\n")}
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
${[...fields].map(([field, type]) => `    ${type} ${field};`).join("\n")}
} ${typeName};
${aliases.join("\n")}
${staticData.join("\n")}
${
  units == null
    ? ""
    : chunks
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
        continuation = ${name}_chunks[continuation](context, &body);
    }
${release}    return body.result;
`;
  return { declarations, execution };
}
