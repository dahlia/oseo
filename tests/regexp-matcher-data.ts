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
