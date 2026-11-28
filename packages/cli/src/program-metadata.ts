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

import { formatMessage, lineBreak, message, url } from "@optique/core/message";
import type { Message, MessageFormatter } from "@optique/core/message";
import type { ProgramMetadata } from "@optique/core/program";

const licenseFooter: Message = [
  ...message`Copyright (C) 2026 Hong Minhee`,
  lineBreak(),
  ...message`The Oseo CLI is free software with ABSOLUTELY NO WARRANTY.`,
  lineBreak(),
  ...message`You may redistribute it under the GNU GPL, version 3 or later.`,
  lineBreak(),
  ...message`Read the license and warranty at ${url(
    "https://www.gnu.org/licenses/gpl-3.0.html",
  )}.`,
];

/** Help metadata shared by the executable and the embedded parser. */
export const cliMetadata: ProgramMetadata = {
  name: "oseo",
  brief: message`Compile a subset of JavaScript and TypeScript to native code.`,
  author: message`Hong Minhee ${url("https://hongminhee.org/")}`,
  bugs: message`Report non-security bugs at ${url(
    "https://github.com/dahlia/oseo/issues",
  )}.`,
  footer: licenseFooter,
};

/** Append the program's footer to Optique's built-in completion examples. */
export const formatCliMessage: MessageFormatter = (content, options) => {
  const heading = content[0];
  // Optique gives the completion examples precedence over the program
  // footer and provides no separate footer option for the completion command.
  const bashExample = `eval "$(${cliMetadata.name} completion bash)"`;
  const completionExamples =
    heading?.type === "text" &&
    heading.text === "Examples:" &&
    content.some(
      (term) => term.type === "commandLine" && term.commandLine === bashExample,
    );
  return formatMessage(
    completionExamples
      ? [...content, lineBreak(), lineBreak(), ...licenseFooter]
      : content,
    options,
  );
};
