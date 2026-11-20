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

import type { Fixture } from "./fixture.ts";

/**
 * A fixed native fixture of the ECMAScript 2026 built-in units, run by
 * tests/es2026-builtins-native.test.ts.
 */
export interface Es2026Fixture extends Fixture {
  /**
   * Compare with Deno alone. The pinned Node.js does not expose the
   * feature, or diverges from the specification in what the fixture
   * observes, so Deno is the single reference host.
   */
  readonly denoOnly?: true;
  /** The enabled policy must also report at least one guard hit. */
  readonly guardHits?: true;
  /**
   * Source that installs an independent model of the feature before the
   * fixture runs on both reference hosts. It replaces differential
   * evidence for a feature that neither pinned host exposes, and the
   * native run never sees it.
   */
  readonly referenceModel?: string;
}
