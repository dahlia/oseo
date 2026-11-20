/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
