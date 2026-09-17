import type { Binding, HirProgram } from "./hir.ts";
import { buildSeededHir } from "./hir-build.ts";
import { buildMir } from "./mir-build.ts";
import type { CompilerOptions, MirProgram } from "./mir.ts";
import type { Diagnostic, SourceInput } from "./source.ts";
import type { SourceFrontend, SyntaxProgram } from "./syntax.ts";

/** Private fragment contract; changes invalidate generated object reuse. */
export const scriptFragmentAbi = "oseo-script-fragments-v1";

/** A Script binding exported to a later fragment in the same environment. */
export interface FragmentBinding {
  readonly id: number;
  readonly name: string;
  readonly mutable: boolean;
  readonly globalObject: boolean;
}

/**
 * Independently lowered unit, not a standalone executable MirProgram.
 * The launcher owns instantiation and supplies the shared environment.
 */
export interface ScriptFragment {
  readonly hir: HirProgram;
  readonly mir: MirProgram;
  /** Exclusive limits include hidden bindings and all nested functions. */
  readonly nextBindingId: number;
  readonly nextFunctionId: number;
  /** HIR body indices owned by launcher instantiation, not evaluation. */
  readonly launcherInitializers: readonly number[];
}

/** Prepared ordered bundle. No body input contributes to these bytes. */
export interface HarnessFragment extends ScriptFragment {
  readonly abi: typeof scriptFragmentAbi;
  readonly sources: readonly SourceInput[];
  readonly bindings: readonly FragmentBinding[];
  readonly globalReferences: readonly string[];
  readonly strict: boolean;
  readonly options: CompilerOptions;
}

/** A failed preparation must use the existing whole-Script path. */
export type HarnessFragmentResult =
  | { readonly kind: "compiled"; readonly harness: HarnessFragment }
  | { readonly kind: "fallback"; readonly diagnostics: readonly Diagnostic[] };

/** A body is either compatible with a prepared bundle or requires fallback. */
export type BodyFragmentResult =
  | {
      readonly kind: "compiled";
      readonly body: ScriptFragment;
      readonly bindingCount: number;
    }
  | {
      readonly kind: "fallback";
      readonly reason:
        | "diagnostic"
        | "shadowing"
        | "strictness"
        | "metadata"
        | "global-effects";
      readonly names: readonly string[];
      readonly diagnostics: readonly Diagnostic[];
    };

function fragment(
  hir: HirProgram,
  nextBindingId: number,
  nextFunctionId: number,
  options: CompilerOptions,
): ScriptFragment {
  const varIds = new Set(
    hir.globalObjectBindings
      ?.filter((binding) => binding.declaration === "var")
      .map((binding) => binding.id),
  );
  return {
    hir,
    mir: buildMir(hir, options),
    nextBindingId,
    nextFunctionId,
    launcherInitializers: hir.body.flatMap((statement, index) =>
      statement.kind === "function-init" ||
      (statement.kind === "let" && varIds.has(statement.bindingId)) ||
      (statement.kind === "const" &&
        statement.bindingId === hir.intrinsicGlobalObjectBindingId)
        ? [index]
        : [],
    ),
  };
}

/**
 * Compile an ordered bundle once, reserving every ID before any case resolves.
 * Source order and duplicates are significant. Locations use the fixed virtual
 * bundle source; native emission must supply the launcher's logical source map.
 */
export function compileHarnessFragment(
  frontend: SourceFrontend,
  sources: readonly SourceInput[],
  strict = false,
  options: CompilerOptions = {},
): HarnessFragmentResult {
  const parsed = frontend.parse({
    source:
      (strict ? '"use strict";\n' : "") +
      sources.map((source) => source.source).join("\n"),
    sourceId: "oseo:harness",
  });
  if (parsed.program == null || parsed.diagnostics.length > 0) {
    return { kind: "fallback", diagnostics: parsed.diagnostics };
  }
  if (
    parsed.program.globalLexicalNames == null ||
    parsed.program.globalObjectNames == null
  ) {
    return { kind: "fallback", diagnostics: [] };
  }
  const globalReferences = new Set<string>();
  const resolved = buildSeededHir(parsed.program, {
    globalReferences,
    fragmentMetadata: true,
  });
  if (resolved.program == null || resolved.scriptBindings == null) {
    return { kind: "fallback", diagnostics: resolved.diagnostics };
  }
  if ((resolved.initializingWithNames?.length ?? 0) > 0) {
    return { kind: "fallback", diagnostics: [] };
  }
  const objectIds = new Set(
    resolved.program.globalObjectBindings?.map((binding) => binding.id),
  );
  return {
    kind: "compiled",
    harness: {
      ...fragment(
        resolved.program,
        resolved.nextBindingId,
        resolved.nextFunctionId,
        options,
      ),
      abi: scriptFragmentAbi,
      sources: sources.map((source) => ({ ...source })),
      bindings: [...resolved.scriptBindings.values()].map((binding) => ({
        id: binding.id,
        name: binding.name,
        mutable: binding.mutable,
        globalObject: objectIds.has(binding.id),
      })),
      globalReferences: [...globalReferences].toSorted(),
      strict: parsed.program.strict === true,
      options: { ...options },
    },
  };
}

function shadowedNames(
  harness: HarnessFragment,
  body: SyntaxProgram,
): readonly string[] {
  const protectedNames = new Set([
    ...harness.globalReferences,
    ...harness.bindings.map((binding) => binding.name),
  ]);
  return [
    ...new Set([
      ...(body.globalLexicalNames ?? []).map((entry) => entry.name),
      ...(body.globalObjectNames ?? []).map((entry) => entry.name),
    ]),
  ]
    .filter((name) => protectedNames.has(name))
    .toSorted();
}

/**
 * Resolve a case against a prepared harness without mutating the harness.
 * Fallback is an instruction to compile the original assembled Script, not a
 * replacement diagnostic. Module/raw admission belongs to the future runner.
 */
export function compileBodyFragment(
  frontend: SourceFrontend,
  harness: HarnessFragment,
  input: SourceInput,
): BodyFragmentResult {
  const parsed = frontend.parse({
    ...input,
    source: (harness.strict ? '"use strict";\n' : "") + input.source,
  });
  if (parsed.program == null || parsed.diagnostics.length > 0) {
    return {
      kind: "fallback",
      reason: "diagnostic",
      names: [],
      diagnostics: parsed.diagnostics,
    };
  }
  if ((parsed.program.strict === true) !== harness.strict) {
    return {
      kind: "fallback",
      reason: "strictness",
      names: [],
      diagnostics: [],
    };
  }
  if (
    parsed.program.globalLexicalNames == null ||
    parsed.program.globalObjectNames == null
  ) {
    return {
      kind: "fallback",
      reason: "metadata",
      names: [],
      diagnostics: [],
    };
  }
  const names = shadowedNames(harness, parsed.program);
  if (names.length > 0) {
    return { kind: "fallback", reason: "shadowing", names, diagnostics: [] };
  }
  const bindings = new Map<string, Binding>(
    harness.bindings.map((binding) => [
      binding.name,
      { id: binding.id, name: binding.name, mutable: binding.mutable },
    ]),
  );
  const resolved = buildSeededHir(parsed.program, {
    bindings,
    fragmentMetadata: true,
    globalObjectBindingIds: harness.bindings
      .filter((binding) => binding.globalObject)
      .map((binding) => binding.id),
    nextBindingId: harness.nextBindingId,
    nextFunctionId: harness.nextFunctionId,
  });
  if (resolved.program == null) {
    return {
      kind: "fallback",
      reason: "diagnostic",
      names: [],
      diagnostics: resolved.diagnostics,
    };
  }
  if ((resolved.initializingWithNames?.length ?? 0) > 0) {
    return {
      kind: "fallback",
      reason: "global-effects",
      names: resolved.initializingWithNames ?? [],
      diagnostics: [],
    };
  }
  return {
    kind: "compiled",
    body: fragment(
      resolved.program,
      resolved.nextBindingId,
      resolved.nextFunctionId,
      harness.options,
    ),
    bindingCount: resolved.nextBindingId,
  };
}

/** Separate launcher-owned initialization from ordered evaluation in MIR. */
export function lowerFragmentPhases(
  unit: ScriptFragment,
): readonly [MirProgram, MirProgram] {
  const initializers = new Set(unit.launcherInitializers);
  const lower = (instantiate: boolean): MirProgram =>
    buildMir(
      {
        ...unit.hir,
        body: unit.hir.body.filter(
          (_, index) => initializers.has(index) === instantiate,
        ),
      },
      {
        specialization: unit.mir.specialization,
        observeSpecialization: unit.mir.observeSpecialization,
      },
    );
  return [lower(true), lower(false)];
}
