import { defineCommand } from "@optique/discover/command";
import type { Command } from "@optique/discover/command";
import { message } from "@optique/core/message";
import { dispatchCommand, buildOptionsParser } from "../options.ts";
import type { CliCommandContext, CliInvocation } from "../options.ts";

const definition: Omit<
  Command<"sync", CliInvocation, CliCommandContext>,
  "hooks"
> = defineCommand({
  parser: buildOptionsParser,
  metadata: {
    brief: message`Retain a native executable or print compiler output.`,
  },
  handler: dispatchCommand,
});

export default definition;
