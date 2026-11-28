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

import { parseWithClassStaticAsi as parseBabel } from "./class-static-asi.ts";
import type {
  ModuleSourceFrontend,
  SourceFrontend,
  SourceInput,
} from "@oseo/compiler";
import {
  node,
  type ConvertContext,
  type ConvertOptions,
  type ParserError,
} from "./babel.ts";
import { normalizeAnnexBFunctionStatements } from "./annexb-functions.ts";
import { classStaticKeywordDiagnostics } from "./class-static-keyword.ts";
import { program } from "./convert.ts";
import { eraseTypeSyntax } from "./erasable.ts";
import {
  newImportCallDiagnostics,
  unhandledParserDiagnostics,
} from "./import-call-early-errors.ts";
import { createSourceIndex, diagnosticAt, errorOffset } from "./locations.ts";
import { convertModule, withImportCalls } from "./modules.ts";
import { scriptModuleDeclarations } from "./script-goal.ts";

/** Configuration supplied by a composition root to both Babel frontends. */
export type BabelFrontendOptions = ConvertOptions;

/** Create a Babel Script frontend with caller-owned language extensions. */
export function createBabelFrontend(
  options: BabelFrontendOptions = {},
): SourceFrontend {
  return {
    parse(input: SourceInput) {
      const locations = createSourceIndex(input.source);
      try {
        let file = node(
          parseBabel(input.source, {
            // Preserve TS-only profile boundaries; the Script grammar is
            // checked on the parsed declarations before conversion below.
            allowImportExportEverywhere: true,
            attachComment: true,
            createParenthesizedExpressions: true,
            errorRecovery: true,
            plugins: ["typescript"],
            sourceType: "script",
            tokens: true,
          }),
        );
        if (file == null) throw new Error("Babel returned a non-node result.");
        const erased = eraseTypeSyntax(input, locations, file);
        let parserErrors: readonly ParserError[] = [];
        if (Array.isArray(file.errors)) {
          // SAFETY: Array.isArray establishes Babel's parser-error sequence.
          parserErrors = file.errors as readonly ParserError[];
        }
        // Type-only bindings may collide or be absent before erasure. The
        // stripped reparse still rejects surviving runtime binding errors.
        if (erased.source !== input.source) {
          parserErrors = parserErrors.filter(
            (error) =>
              error.reasonCode !== "VarRedeclaration" &&
              error.reasonCode !== "ModuleExportUndefined" &&
              !(
                error.reasonCode === "PatternIsOptional" &&
                erased.diagnostics.length === 0 &&
                erased.optionalPatternStarts.has(errorOffset(error))
              ) &&
              !(
                ["ImportInTSNamespace", "ExportInTSNamespace"].includes(
                  error.reasonCode ?? "",
                ) && erased.ambientModuleStarts.has(errorOffset(error))
              ),
          );
        }
        const parserDiagnostics = unhandledParserDiagnostics(
          input,
          locations,
          file,
          parserErrors,
        );
        if (parserDiagnostics.length > 0) {
          return {
            diagnostics: parserDiagnostics,
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        const moduleDeclarations = scriptModuleDeclarations(file);
        if (moduleDeclarations.length > 0) {
          return {
            diagnostics: moduleDeclarations.map((declaration) =>
              diagnosticAt(input, locations, declaration.start ?? 0),
            ),
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        file = erased.file;
        if (erased.diagnostics.length > 0) {
          return {
            diagnostics: erased.diagnostics,
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        const staticKeywordErrors = classStaticKeywordDiagnostics(
          input,
          locations,
          file,
        );
        if (staticKeywordErrors.length > 0) {
          return {
            diagnostics: staticKeywordErrors,
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        const importCallErrors = newImportCallDiagnostics(
          input,
          locations,
          file,
        );
        if (importCallErrors.length > 0) {
          return {
            diagnostics: importCallErrors,
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        normalizeAnnexBFunctionStatements(file);
        const context: ConvertContext = {
          diagnostics: [],
          input: { ...input, source: erased.source },
          sourceText: erased.sourceText,
          locations,
          receiverStack: [],
          regexpExtensions: options.regexpExtensions,
          regexpUnicodeData: options.regexpUnicodeData,
          staticSpecifierImports: options.staticSpecifierImports === true,
          strictStack: [],
          syntheticIndex: 0,
          thisModeStack: ["global"],
        };
        const converted = program(context, file);
        if (converted == null || context.diagnostics.length > 0) {
          return {
            diagnostics: context.diagnostics,
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        return {
          diagnostics: [],
          parsed: true,
          program: withImportCalls(context, converted),
          sourceId: input.sourceId,
        };
      } catch (error) {
        // SAFETY: Babel errors expose the optional offsets read below.
        const value = error as ParserError;
        return {
          diagnostics: [diagnosticAt(input, locations, errorOffset(value))],
          parsed: false,
          sourceId: input.sourceId,
        };
      }
    },
  };
}

/** Babel Script frontend with no optional language extensions. */
export const babelFrontend: SourceFrontend = createBabelFrontend();

/** Babel implementation of the owned Oseo module-frontend boundary. */
export function createBabelModuleFrontend(
  options: BabelFrontendOptions = {},
): ModuleSourceFrontend {
  return {
    parseModule(input: SourceInput) {
      const locations = createSourceIndex(input.source);
      try {
        const file = node(
          parseBabel(input.source, {
            attachComment: true,
            createParenthesizedExpressions: true,
            errorRecovery: true,
            plugins: ["typescript"],
            sourceType: "module",
            tokens: true,
          }),
        );
        if (file == null) throw new Error("Babel returned a non-node result.");
        return convertModule(input, file, options);
      } catch (error) {
        // SAFETY: Babel errors expose the optional offsets read below.
        const value = error as ParserError;
        return {
          diagnostics: [diagnosticAt(input, locations, errorOffset(value))],
          parsed: false,
          sourceId: input.sourceId,
        };
      }
    },
  };
}

/** Babel Module frontend with no optional language extensions. */
export const babelModuleFrontend: ModuleSourceFrontend =
  createBabelModuleFrontend();
