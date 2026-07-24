import { buildHir } from "./hir-build.ts";
import type { CompilerOptions } from "./mir.ts";
import { buildMir } from "./mir-build.ts";
import type { CompilationResult } from "./module-compile.ts";
import type { SourceInput } from "./source.ts";
import type { SourceFrontend } from "./syntax.ts";
/** Compile source through owned syntax, HIR, and policy-selected MIR. */
export function compileSource(
  frontend: SourceFrontend,
  input: SourceInput,
  options: CompilerOptions = {},
): CompilationResult {
  const frontendResult = frontend.parse(input);
  if (frontendResult.program == null) {
    return { diagnostics: frontendResult.diagnostics };
  }
  const hirResult = buildHir(frontendResult.program);
  if (hirResult.program == null) {
    return {
      diagnostics: hirResult.diagnostics,
      syntax: frontendResult.program,
    };
  }
  return {
    diagnostics: [],
    hir: hirResult.program,
    mir: buildMir(hirResult.program, options),
    syntax: frontendResult.program,
  };
}
