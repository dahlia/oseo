import { parse as parseBabel } from "@babel/parser";
import type {
  ModuleSourceFrontend,
  SourceFrontend,
  SourceInput,
} from "@oseo/compiler";
import {
  type BabelNode,
  type ConvertContext,
  type ParserError,
} from "./babel.ts";
import { program } from "./convert.ts";
import { createSourceIndex, diagnosticAt, errorOffset } from "./locations.ts";
import { convertModule } from "./modules.ts";

export const babelFrontend: SourceFrontend = {
  parse(input: SourceInput) {
    const locations = createSourceIndex(input.source);
    try {
      const file = parseBabel(input.source, {
        allowImportExportEverywhere: true,
        attachComment: true,
        createParenthesizedExpressions: true,
        errorRecovery: true,
        plugins: ["typescript"],
        sourceType: "script",
        tokens: true,
      }) as unknown as BabelNode;
      const parserErrors = Array.isArray(file.errors)
        ? (file.errors as readonly ParserError[])
        : [];
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
        functionStack: [],
        input,
        locations,
        strictStack: [],
        syntheticIndex: 0,
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
      const value = error as ParserError;
      return {
        diagnostics: [diagnosticAt(input, locations, errorOffset(value))],
        parsed: false,
        sourceId: input.sourceId,
      };
    }
  },
};

/** Babel implementation of the owned Oseo module-frontend boundary. */
export const babelModuleFrontend: ModuleSourceFrontend = {
  parseModule(input: SourceInput) {
    const locations = createSourceIndex(input.source);
    try {
      const file = parseBabel(input.source, {
        attachComment: true,
        createParenthesizedExpressions: true,
        errorRecovery: true,
        plugins: ["typescript"],
        sourceType: "module",
        tokens: true,
      }) as unknown as BabelNode;
      return convertModule(input, file);
    } catch (error) {
      const value = error as ParserError;
      return {
        diagnostics: [diagnosticAt(input, locations, errorOffset(value))],
        parsed: false,
        sourceId: input.sourceId,
      };
    }
  },
};
