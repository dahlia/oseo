import { agentSourceId, compileAgentTemplate } from "./agent-programs.ts";
import { buildHir } from "./hir-build.ts";
import type { CompilerOptions, MirAgentTemplate, MirProgram } from "./mir.ts";
import { buildMir } from "./mir-build.ts";
import type { CompilationResult } from "./module-compile.ts";
import type { SourceInput } from "./source.ts";
import type { SourceFrontend } from "./syntax.ts";
/**
 * Compile source through owned syntax, HIR, and policy-selected MIR. With
 * the test262 host option, the result also carries one agent program for
 * each `$262.agent.start` template, and the main program's table names
 * them in the same order.
 */
export function compileSource(
  frontend: SourceFrontend,
  input: SourceInput,
  options: CompilerOptions = {},
): CompilationResult {
  const frontendResult = frontend.parse(input);
  if (frontendResult.program == null) {
    return { diagnostics: frontendResult.diagnostics };
  }
  const host = options.test262Host === true;
  const hirResult = buildHir(
    frontendResult.program,
    host ? { collectAgentTemplates: true } : {},
  );
  if (hirResult.program == null) {
    return {
      diagnostics: hirResult.diagnostics,
      syntax: frontendResult.program,
    };
  }
  const mir = buildMir(hirResult.program, options);
  if (!host) {
    return {
      diagnostics: [],
      hir: hirResult.program,
      mir,
      syntax: frontendResult.program,
    };
  }
  const agents: MirProgram[] = [];
  const templates: MirAgentTemplate[] = [];
  for (const [index, template] of (
    hirResult.program.agentTemplates ?? []
  ).entries()) {
    const compiled = compileAgentTemplate(
      frontend,
      template,
      index,
      input.sourceId,
      options,
    );
    if ("diagnostics" in compiled) {
      return {
        diagnostics: compiled.diagnostics,
        syntax: frontendResult.program,
      };
    }
    agents.push(compiled.mir);
    templates.push({
      segments: template.segments,
      sourceId: agentSourceId(input.sourceId, index),
    });
  }
  return {
    agents,
    diagnostics: [],
    hir: hirResult.program,
    mir: { ...mir, test262Host: { agents: templates } },
    syntax: frontendResult.program,
  };
}
