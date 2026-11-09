import { defineCommand } from "@optique/discover/command";
import type { Command } from "@optique/discover/command";
import { message } from "@optique/core/message";
import { dispatchCommand, runOptionsParser } from "../options.ts";
import type { CliCommandContext, CliInvocation } from "../options.ts";

const definition: Omit<
  Command<"sync", CliInvocation, CliCommandContext>,
  "hooks"
> = defineCommand({
  parser: runOptionsParser,
  metadata: { brief: message`Compile and run source.` },
  handler: dispatchCommand,
});

export default definition;
