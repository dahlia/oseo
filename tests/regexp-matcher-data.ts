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

/**
 * The pinned Unicode facts the generic matcher builder asks its caller for.
 *
 * The provider itself lives in `@oseo/cli`, the composition root that owns
 * the pinned tables and supplies them to the frontend, so a test and a real
 * build compile one literal against the same Unicode release. This module
 * only re-exports it under the name the repository-level regular expression
 * evidence already uses.
 */

export {
  caseEquivalenceClasses,
  propertyEscapeSet,
  stringPropertyEscapeSet,
  unicodeMatcherData,
} from "../packages/cli/src/index.ts";
