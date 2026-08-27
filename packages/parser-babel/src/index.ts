import { parse as parseBabel } from "@babel/parser";
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
import { program } from "./convert.ts";
import { createSourceIndex, diagnosticAt, errorOffset } from "./locations.ts";
import { convertModule } from "./modules.ts";

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
        const file = node(
          parseBabel(input.source, {
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
        let parserErrors: readonly ParserError[] = [];
        if (Array.isArray(file.errors)) {
          // SAFETY: Array.isArray establishes Babel's parser-error sequence.
          parserErrors = file.errors as readonly ParserError[];
        }
        if (parserErrors.length > 0) {
          return {
            diagnostics: parserErrors.map((error) =>
              diagnosticAt(input, locations, errorOffset(error)),
            ),
            parsed: false,
            sourceId: input.sourceId,
          };
        }
        const context: ConvertContext = {
          diagnostics: [],
          input,
          locations,
          receiverStack: [],
          regexpExtensions: options.regexpExtensions,
          regexpUnicodeData: options.regexpUnicodeData,
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
          program: converted,
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
