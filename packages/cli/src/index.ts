import { cBackend } from "@oseo/backend-c";
import type {
  CompilerHost,
  Diagnostic,
  NativeBackend,
  NativeToolchain,
  RuntimeInputProvider,
  SourceFrontend,
} from "@oseo/compiler";
import { renderDiagnostic } from "@oseo/compiler";
import { createDenoHost, createNodeHost } from "@oseo/host";
import { babelFrontend } from "@oseo/parser-babel";
import { cRuntimeProvider } from "@oseo/runtime-c";
import { zigToolchain } from "@oseo/toolchain-zig";

const helpText = `Usage: oseo [options] <source>

Options:
  --dump-mir  Print textual MIR for supported source (available in M1)
  --emit-c    Print generated C11 for supported source (available in M1)
  --help      Print this help
  --version   Print the Oseo package version
`;

/** Concrete adapters selected at the outer Oseo composition root. */
export interface DefaultComponents {
  readonly backend: NativeBackend;
  readonly createDenoHost: () => CompilerHost;
  readonly createNodeHost: () => CompilerHost;
  readonly frontend: SourceFrontend;
  readonly runtime: RuntimeInputProvider;
  readonly toolchain: NativeToolchain;
}

/** A host-independent invocation of the M0 command-line contract. */
export interface CliRequest {
  readonly args: readonly string[];
  readonly source?: string;
  readonly sourceId?: string;
  readonly version: string;
}

/** Captured command-line output and status. */
export interface CliResult {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** The concrete adapters composed by the default Oseo command line. */
export const defaultComponents: DefaultComponents = {
  backend: cBackend,
  createDenoHost,
  createNodeHost,
  frontend: babelFrontend,
  runtime: cRuntimeProvider,
  toolchain: zigToolchain,
};

function unsupportedDiagnostic(sourceId: string): Diagnostic {
  return {
    byteRange: { end: 0, start: 0 },
    code: "OSEO1001",
    message: "Source compilation is not available before milestone M1.",
    range: {
      end: { column: 1, line: 1 },
      start: { column: 1, line: 1 },
    },
    sourceId,
  };
}

/** Run the reserved M0 CLI without writing directly to a host stream. */
export function runCli(request: CliRequest): CliResult {
  if (request.args.includes("--help")) {
    return { exitStatus: 0, stderr: "", stdout: helpText };
  }
  if (request.args.includes("--version")) {
    return { exitStatus: 0, stderr: "", stdout: `${request.version}\n` };
  }

  const sourceId =
    request.sourceId ??
    request.args.find((argument) => !argument.startsWith("-")) ??
    "<stdin>";
  const parsed = babelFrontend.parse({
    source: request.source ?? "",
    sourceId,
  });
  const diagnostic = parsed.diagnostics[0] ?? unsupportedDiagnostic(sourceId);
  return {
    exitStatus: 1,
    stderr: `${renderDiagnostic(diagnostic)}\n`,
    stdout: "",
  };
}
