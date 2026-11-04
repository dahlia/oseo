import { agentSourceId, compileAgentTemplate } from "./agent-programs.ts";
import { compileHostScripts } from "./host-scripts.ts";
import { buildSeededHir } from "./hir-build.ts";
import type { CompilerOptions, MirAgentTemplate, MirProgram } from "./mir.ts";
import { buildMir } from "./mir-build.ts";
import {
  buildScriptGraphHir,
  type CompilationResult,
  type ScriptModuleRequests,
} from "./module-compile.ts";
import type { SourceInput } from "./source.ts";
import type { SourceFrontend } from "./syntax.ts";
/**
 * Compile source through owned syntax, HIR, and policy-selected MIR. With
 * the test262 host option, the result also carries one agent program for
 * each `$262.agent.start` template, and the main program's table names
 * them in the same order.
 *
 * `requests` names the modules a Script's `import()` calls reach, as
 * `buildScriptRequests` discovered them for the same Script under
 * its canonical identity. Without it, every `import()` keeps its profile
 * diagnostic.
 */
export function compileSource(
  frontend: SourceFrontend,
  input: SourceInput,
  options: CompilerOptions = {},
  requests?: ScriptModuleRequests,
): CompilationResult {
  const frontendResult = frontend.parse(input);
  if (frontendResult.program == null) {
    return { diagnostics: frontendResult.diagnostics };
  }
  const host = options.test262Host === true;
  const seed = host
    ? { collectAgentTemplates: true, hostScriptBindings: true }
    : {};
  // A Script with `import()` calls carries the modules they reach.
  const hirResult =
    requests == null
      ? buildSeededHir(frontendResult.program, seed)
      : buildScriptGraphHir(frontendResult.program, requests, seed);
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
  const scripts = compileHostScripts(
    frontend,
    frontendResult.program,
    options,
    hirResult.nextBindingId,
    hirResult.nextFunctionId,
    hirResult.program.hostScriptSources ?? [],
  );
  return {
    agents,
    diagnostics: [],
    hir: hirResult.program,
    mir: {
      ...mir,
      functions: [...mir.functions, ...scripts.functions],
      globalBindings: [...mir.globalBindings, ...scripts.globals],
      hostObjectBindings: scripts.objects,
      test262Host: {
        agents: templates,
        mainAgentCanBlock: options.mainAgentCanBlock ?? true,
        scripts: scripts.scripts,
      },
    },
    syntax: frontendResult.program,
  };
}
