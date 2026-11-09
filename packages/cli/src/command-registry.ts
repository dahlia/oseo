import { message } from "@optique/core/message";
import type { Parser } from "@optique/core/parser";
import { defineCommand } from "@optique/discover/command";
import type { Command } from "@optique/discover/command";
import type { ModuleCommand } from "@optique/discover";
import rootCommand from "./commands/index.ts";
import { createRunOptionsParser, sourceArgumentParser } from "./options.ts";
import type { CliCommandContext, CliInvocation } from "./options.ts";

/** Refuse reserved names before Optique consumes them at this boundary. */
function reserveChildNames<Value>(
  parser: Parser<"sync", Value>,
  names: ReadonlySet<string>,
): Parser<"sync", Value> {
  return {
    ...parser,
    parse(context) {
      const token = context.buffer[0];
      if (!context.optionsTerminated && token != null && names.has(token)) {
        return {
          success: false,
          consumed: 0,
          error: message`Use an explicit command or a source path with ./`,
        };
      }
      return parser.parse(context);
    },
  };
}

/** Apply shortcut reservation from the generated registry's child names. */
export function reserveRootCommandNames(
  entries: readonly ModuleCommand<CliCommandContext>[],
): readonly ModuleCommand<CliCommandContext>[] {
  const names = new Set(entries.flatMap((entry) => entry.path.slice(0, 1)));
  // Object parsing can consume an option and SOURCE in one step. Guard
  // both boundaries while leaving option values to their own parsers.
  const command: Omit<
    Command<"sync", CliInvocation, CliCommandContext>,
    "hooks"
  > = defineCommand({
    ...rootCommand,
    parser: reserveChildNames(
      createRunOptionsParser(reserveChildNames(sourceArgumentParser, names)),
      names,
    ),
  });
  return entries.map((entry) =>
    entry.path.length === 0 ? { ...entry, command } : entry,
  );
}
