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

import { readFileSync } from "node:fs";

/**
 * Ordered runner labels, two per Mac mini. The shell tools read this same
 * allow-list, so registration checks and readiness decisions cannot drift.
 * The final pair belongs to the rented fourth machine.
 */
export const selfHostedLaneLabels: readonly string[] = readFileSync(
  new URL("./selfhosted-mac/lane-labels.txt", import.meta.url),
  "utf8",
)
  .trimEnd()
  .split("\n");

/** Eight optional lanes; the repository variable keeps all of them off. */
export const configuredSelfHostedLanes: number = selfHostedLaneLabels.length;
