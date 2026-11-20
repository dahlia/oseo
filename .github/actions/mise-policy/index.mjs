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

import {
  checkRestoredMise,
  discoverMise,
  prepareMise,
} from "../../../tools/ci/mise-bootstrap.ts";

try {
  const env = process.env;
  if (env.INPUT_PHASE === "discover") {
    await discoverMise(env.RUNNER_TEMP, env.GITHUB_OUTPUT);
  } else if (env.INPUT_PHASE === "restore") {
    await checkRestoredMise(
      env.INPUT_DIRECTORY,
      env["INPUT_CACHE-HIT"] === "true",
      env.INPUT_SHA256,
    );
  } else if (env.INPUT_PHASE === "prepare") {
    await prepareMise(
      env.RUNNER_TEMP,
      env.GITHUB_OUTPUT,
      env.GITHUB_ENV,
      env["INPUT_CONFIG-HASH"],
      env["INPUT_INSTALL-ARGS"],
      env.INPUT_VERSION,
      env["INPUT_METADATA-DIRECTORY"],
      env["INPUT_CACHE-HIT"] === "true",
    );
  } else {
    throw new Error("Unknown mise policy phase");
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
