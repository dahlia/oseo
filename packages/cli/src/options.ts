import type { NativeBuildConfiguration } from "@oseo/compiler";
import { object, or } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import { map, multiple, optional, withDefault } from "@optique/core/modifiers";
import type { Parser } from "@optique/core/parser";
import { argument, constant, flag, option } from "@optique/core/primitives";
import { choice, string as stringValue } from "@optique/core/valueparser";
import type { ProgramHookContext } from "@optique/discover/command";

/** Parsed workflow boundary used by typed command modules and embedders. */
export interface CliInvocation {
  readonly command: "run" | "build";
  readonly mode: "execute" | "dump-mir" | "emit-c";
  readonly buildConfiguration: NativeBuildConfiguration | undefined;
  readonly programArgs: readonly string[];
  readonly output: string | undefined;
  readonly module: boolean;
  readonly runtimeArchiveReuse: "enabled" | "disabled";
  readonly script: string | undefined;
  readonly sourceId: string;
  readonly specialization: "enabled" | "disabled";
  readonly target:
    | "linux-aarch64-musl"
    | "linux-x86_64-gnu"
    | "macos-aarch64"
    | undefined;
  readonly test262Host: boolean;
  readonly test262NonBlocking: boolean;
  readonly unhandledRejectionPolicy: "fatal" | "observe";
}

/** Host-injected command dispatch, supplied by the outer executable. */
export interface CliCommandContext {
  readonly invoke: (value: CliInvocation) => Promise<void>;
}

const modeParser = withDefault(
  or(
    map(
      flag("--dump-mir", {
        description: message`Print textual MIR for supported source.`,
      }),
      () => "dump-mir" as const,
    ),
    map(
      flag("--emit-c", {
        description: message`Print generated C11 for supported source.`,
      }),
      () => "emit-c" as const,
    ),
  ),
  "execute" as const,
);

const specializationParser = withDefault(
  map(
    flag("--no-specialization", {
      description: message`Compile only the generic native path.`,
    }),
    () => "disabled" as const,
  ),
  "enabled" as const,
);

const runtimeArchiveReuseParser = withDefault(
  map(
    flag("--no-runtime-archive-reuse", {
      description: message`Rebuild the runtime archive for this native build.`,
    }),
    () => "disabled" as const,
  ),
  "enabled" as const,
);

const test262HostParser = withDefault(
  map(
    flag("--test262-host", {
      description: message`Provide the test262 host bindings and AOT sources.`,
    }),
    () => true,
  ),
  false,
);

const test262NonBlockingParser = withDefault(
  map(
    flag("--test262-non-blocking", {
      description: message`Run the test262 main agent with [[CanBlock]] false.`,
    }),
    () => true,
  ),
  false,
);

// ADR 0030: the tolerant test262 rejection policy is its own explicit
// option, independent of --test262-host, and every other run stays fatal.
const unhandledRejectionPolicyParser = withDefault(
  map(
    flag("--test262-observe-rejections", {
      description: message`Continue after unhandled rejections for test262.`,
    }),
    () => "observe" as const,
  ),
  "fatal" as const,
);

const moduleParser = withDefault(
  map(
    flag("--module", {
      description: message`Compile the source as an ECMAScript module.`,
    }),
    () => true,
  ),
  false,
);

const scriptParser = optional(
  option("--script", stringValue({ metavar: "SCRIPT" }), {
    description: message`Evaluate a Script in the realm before the module.`,
  }),
);

const targetParser = optional(
  option(
    "--target",
    choice([
      "linux-aarch64-musl",
      "linux-x86_64-gnu",
      "macos-aarch64",
    ] as const),
    {
      description: message`Select an explicit native target.`,
    },
  ),
);

/** SOURCE parsing before root command-name reservation is applied. */
export const sourceArgumentParser: Parser<"sync", string> = argument(
  stringValue({ metavar: "SOURCE" }),
  { description: message`Source file to compile.` },
);

const sharedParsers = {
  buildConfiguration: optional(
    option("--build-config", choice(["checked", "optimized"] as const), {
      description: message`Select the native build configuration.`,
    }),
  ),
  module: moduleParser,
  runtimeArchiveReuse: runtimeArchiveReuseParser,
  script: scriptParser,
  sourceId: sourceArgumentParser,
  specialization: specializationParser,
  target: targetParser,
  test262Host: test262HostParser,
  test262NonBlocking: test262NonBlockingParser,
  unhandledRejectionPolicy: unhandledRejectionPolicyParser,
};

const emptyProgramArgs: readonly string[] = [];

const programArgument = argument(stringValue({ metavar: "ARG" }));
const terminatedProgramArgument: typeof programArgument = {
  ...programArgument,
  parse(context) {
    if (!context.optionsTerminated && context.buffer[0] !== "--") {
      return {
        success: false,
        consumed: 0,
        error: message`Program arguments must follow --.`,
      };
    }
    return programArgument.parse(context);
  },
};

/** Compose run options with a SOURCE parser for the selected command. */
export function createRunOptionsParser(
  sourceId: Parser<"sync", string> = sourceArgumentParser,
): Parser<"sync", CliInvocation> {
  return object({
    ...sharedParsers,
    sourceId,
    command: constant("run" as const),
    mode: constant("execute" as const),
    output: constant(undefined),
    programArgs: multiple(terminatedProgramArgument),
  });
}

/** Shared grammar for the root shortcut and explicit run command. */
export const runOptionsParser: Parser<"sync", CliInvocation> =
  createRunOptionsParser();

/** Retained artifact and target-neutral text output grammar. */
export const buildOptionsParser: Parser<"sync", CliInvocation> = object({
  ...sharedParsers,
  command: constant("build" as const),
  mode: modeParser,
  programArgs: constant(emptyProgramArgs),
  output: optional(
    option("-o", "--output", stringValue({ metavar: "PATH" }), {
      description: message`Retain the native executable at PATH.`,
    }),
  ),
});

/** Forward a parsed invocation to the host-injected workflow. */
export async function dispatchCommand(
  value: CliInvocation,
  context?: ProgramHookContext<CliCommandContext>,
): Promise<void> {
  if (context?.resource == null)
    throw new Error("The CLI workflow is unavailable.");
  await context.resource.invoke(value);
}
