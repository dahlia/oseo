import type {
  Diagnostic,
  SourceInput,
  SyntaxArrayBindingPattern,
  SyntaxAssignmentPattern,
} from "@oseo/compiler";

export interface ParserError {
  readonly pos?: number;
  readonly position?: number;
  readonly raisedAt?: number;
}

export interface BabelComment {
  readonly end?: number;
  readonly start?: number;
  readonly type?: string;
  readonly value?: string;
}

export interface BabelNode {
  readonly [key: string]: unknown;
  readonly end?: number;
  readonly leadingComments?: readonly BabelComment[];
  readonly start?: number;
  readonly type?: string;
}

/**
 * How the innermost enclosing function reaches `super()` and
 * `new.target`. Both are lexical in an arrow function, so an arrow
 * records the derived constructor it is nested in rather than becoming
 * one; the profile then rejects them there with a distinct diagnostic
 * instead of silently reading the arrow's own construction state.
 */
export type ReceiverContext =
  | "arrow"
  | "arrow-in-derived-constructor"
  | "derived-constructor"
  | "function";

export interface ConvertContext {
  readonly diagnostics: Diagnostic[];
  readonly functionStack: boolean[];
  readonly input: SourceInput;
  readonly locations: SourceIndex;
  readonly receiverStack: ReceiverContext[];
  readonly strictStack: boolean[];
  syntheticIndex: number;
}

export interface SourceIndex {
  readonly byteOffsets: readonly number[];
  readonly columns: readonly number[];
  readonly length: number;
  readonly lines: readonly number[];
}

export type AssignmentArrayBindingElement =
  SyntaxArrayBindingPattern<SyntaxAssignmentPattern>["elements"][number];

export function node(value: unknown): BabelNode | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as BabelNode;
}

export function nodes(value: unknown): readonly BabelNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const valueNode = node(item);
    return valueNode == null ? [] : [valueNode];
  });
}

export function hasUseStrictDirective(value: BabelNode): boolean {
  return nodes(value.directives).some((directive) => {
    const literal = node(directive.value);
    return literal?.value === "use strict";
  });
}
