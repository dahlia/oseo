import { buildSeededHir } from "./hir-build.ts";
import type { HirExpression, HirProgram, HirStatement } from "./hir.ts";
import { buildMir } from "./mir-build.ts";
import type {
  CompilerOptions,
  MirFunction,
  MirGlobalBinding,
  MirGlobalObjectBinding,
  MirHostScript,
} from "./mir.ts";
import type { SourceRange } from "./source.ts";
import type { SourceFrontend, SyntaxProgram } from "./syntax.ts";

function completionBlock(
  body: readonly HirStatement[],
  range: SourceRange,
): HirStatement {
  return { body, kind: "block", range };
}

/**
 * Record StatementList completion values without changing declaration or
 * expression evaluation. Compound statements supplying UpdateEmpty(undefined)
 * reset the accumulator; a normally completing finally restores the protected
 * completion. Function bodies are separate HIR functions and are untouched.
 */
function withCompletion(
  program: HirProgram,
  allocate: () => number,
): HirProgram {
  const id = allocate();
  const range = program.range;
  const read = (bindingId: number): HirExpression => ({
    bindingId,
    kind: "binding",
    name: "*Script completion*",
    range,
  });
  const set = (value: HirExpression): HirStatement => ({
    kind: "expression",
    range,
    expression: {
      bindingId: id,
      kind: "binding-set",
      mutable: true,
      name: "*Script completion*",
      range,
      value,
    },
  });
  const empty = (): HirStatement => set({ kind: "undefined", range });
  const body = (statement: HirStatement): HirStatement =>
    completionBlock(visit(statement), statement.range);
  const list = (items: readonly HirStatement[]): readonly HirStatement[] =>
    items.flatMap(visit);
  const visit = (statement: HirStatement): readonly HirStatement[] => {
    switch (statement.kind) {
      case "expression":
        return statement.emptyCompletion === true
          ? [statement]
          : [set(statement.expression)];
      case "block":
        return [{ ...statement, body: list(statement.body) }];
      case "labeled": {
        const parts = visit(statement.body);
        return [...parts.slice(0, -1), { ...statement, body: parts.at(-1)! }];
      }
      case "if":
        return [
          empty(),
          {
            ...statement,
            consequent: body(statement.consequent),
            alternate:
              statement.alternate == null
                ? undefined
                : body(statement.alternate),
          },
        ];
      case "while":
      case "do-while":
      case "for":
      case "for-in":
      case "for-of":
      case "with":
        return [empty(), { ...statement, body: body(statement.body) }];
      case "switch":
        return [
          empty(),
          {
            ...statement,
            cases: statement.cases.map((entry) => ({
              ...entry,
              body: list(entry.body),
            })),
          },
        ];
      case "try": {
        let finalizer: HirStatement | undefined;
        if (statement.finalizer != null) {
          const saved = allocate();
          finalizer = completionBlock(
            [
              {
                bindingId: saved,
                hint: undefined,
                initializer: read(id),
                kind: "let",
                name: "*saved completion*",
                range,
              },
              empty(),
              ...visit(statement.finalizer),
              set(read(saved)),
            ],
            statement.finalizer.range,
          );
        }
        return [
          empty(),
          {
            ...statement,
            block: body(statement.block),
            handler:
              statement.handler == null
                ? undefined
                : {
                    ...statement.handler,
                    body: completionBlock(
                      [empty(), ...visit(statement.handler.body)],
                      range,
                    ),
                  },
            finalizer,
          },
        ];
      }
      default:
        return [statement];
    }
  };
  return {
    ...program,
    body: [
      {
        bindingId: id,
        hint: undefined,
        initializer: { kind: "undefined", range },
        kind: "let",
        name: "*Script completion*",
        range,
      },
      ...list(program.body),
      { expression: read(id), kind: "return", range },
    ],
  };
}

/** Compile the finite Script source set into the main dispatcher's ID space. */
export interface CompiledHostScripts {
  readonly scripts: readonly MirHostScript[];
  readonly functions: readonly MirFunction[];
  readonly globals: readonly MirGlobalBinding[];
  readonly objects: readonly MirGlobalObjectBinding[];
}

export function compileHostScripts(
  frontend: SourceFrontend,
  main: SyntaxProgram,
  options: CompilerOptions,
  bindingStart: number,
  functionStart: number,
  sources: readonly string[],
): CompiledHostScripts {
  let nextBinding = bindingStart;
  let nextFunction = functionStart;
  const pending = [...sources];
  const seen = new Set<string>();
  const scripts: MirHostScript[] = [];
  const functions: MirFunction[] = [];
  const globals: MirGlobalBinding[] = [];
  const objects: MirGlobalObjectBinding[] = [];
  while (pending.length > 0) {
    const source = pending.shift()!;
    if (seen.has(source)) continue;
    seen.add(source);
    const sourceId = `${main.sourceId}#host-script-${scripts.length}`;
    const parsed = frontend.parse({ source, sourceId });
    if (parsed.program == null) {
      const error = parsed.diagnostics[0];
      scripts.push({
        source,
        error: error?.code === "OSEO0001" ? "syntax" : "unsupported",
        message: error?.message ?? "Invalid host Script.",
      });
      continue;
    }
    const hir = buildSeededHir(parsed.program, {
      hostScriptBindings: true,
      nextBindingId: nextBinding,
      nextFunctionId: nextFunction,
    });
    nextBinding = hir.nextBindingId;
    nextFunction = hir.nextFunctionId;
    if (hir.program == null) {
      scripts.push({
        source,
        error: "unsupported",
        message: hir.diagnostics[0]?.message ?? "Unsupported host Script.",
      });
      continue;
    }
    pending.push(...(hir.program.hostScriptSources ?? []));
    const completed = withCompletion(hir.program, () => nextBinding++);
    const mir = buildMir(completed, options);
    const functionId = nextFunction++;
    scripts.push({ functionId, source });
    functions.push(...mir.functions, {
      ...mir.script,
      id: functionId,
      hostScript: {
        lexical: mir.globalLexicalNames ?? [],
        objects: mir.globalObjectBindings,
      },
    });
    globals.push(...mir.globalBindings);
    objects.push(...mir.globalObjectBindings);
  }
  return { functions, globals, objects, scripts };
}
