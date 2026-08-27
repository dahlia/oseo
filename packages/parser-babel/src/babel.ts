import type {
  Diagnostic,
  RegExpMatcherUnicodeData,
  RegExpPatternExtensions,
  SourceInput,
  SyntaxArrayBindingPattern,
  SyntaxAssignmentPattern,
  SyntaxThisMode,
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

export type BabelNodeValue =
  | BabelComment
  | BabelNode
  | readonly BabelNodeValue[]
  | boolean
  | null
  | number
  | string
  | undefined;

export interface BabelNode {
  readonly [key: string]: BabelNodeValue | undefined;
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
export type ReceiverKind =
  | "arrow"
  | "arrow-in-derived-constructor"
  | "arrow-in-function"
  | "derived-constructor"
  | "function";

/**
 * How the innermost enclosing function reaches a `super.x` reference.
 * A class element with `extends` supplies the home object, and every
 * arrow nested in that element inherits it. Other functions stop the
 * lexical lookup.
 */
export type SuperPropertyContext = "admitted" | "none";

/** The receiver state of one enclosing function. */
export interface ReceiverContext {
  readonly kind: ReceiverKind;
  readonly superProperty: SuperPropertyContext;
}

/**
 * The owned language extensions and pinned data a composition root
 * supplies to the frontend.
 *
 * Both fields are Unicode facts the compiler core links no data for, so
 * the outer boundary that owns the pinned tables passes them in. Without
 * `regexpUnicodeData` a literal whose artifact needs a case-equivalence
 * class or a property set reports the profile boundary rather than
 * matching against a guess.
 */
export interface ConvertOptions {
  readonly regexpExtensions?: RegExpPatternExtensions;
  readonly regexpUnicodeData?: RegExpMatcherUnicodeData;
}

export interface ConvertContext {
  readonly diagnostics: Diagnostic[];
  readonly input: SourceInput;
  readonly locations: SourceIndex;
  readonly receiverStack: ReceiverContext[];
  readonly regexpExtensions: RegExpPatternExtensions | undefined;
  readonly regexpUnicodeData: RegExpMatcherUnicodeData | undefined;
  readonly strictStack: boolean[];
  syntheticIndex: number;
  /**
   * The this mode of each enclosing this environment, innermost last.
   * A non-arrow function pushes its own mode and an arrow pushes the
   * mode it inherits, so the top entry always describes the environment
   * a `this` expression at that position resolves through. The stack is
   * created with the top-level entry for the source kind, so it is never
   * empty.
   */
  readonly thisModeStack: SyntaxThisMode[];
}

export interface SourceIndex {
  readonly byteOffsets: readonly number[];
  readonly columns: readonly number[];
  readonly length: number;
  readonly lines: readonly number[];
}

export type AssignmentArrayBindingElement =
  SyntaxArrayBindingPattern<SyntaxAssignmentPattern>["elements"][number];

export function isBoolean<Candidate>(
  value: Candidate,
): value is Candidate & boolean {
  return typeof value === "boolean";
}

export function isNumber<Candidate>(
  value: Candidate,
): value is Candidate & number {
  return typeof value === "number";
}

export function isObject<Candidate>(
  value: Candidate,
): value is Candidate & object {
  return value !== null && typeof value === "object";
}

export function isString<Candidate>(
  value: Candidate,
): value is Candidate & string {
  return typeof value === "string";
}

export function node<T>(value: T): BabelNode | undefined {
  if (!isObject(value) || Array.isArray(value)) {
    return undefined;
  }
  // SAFETY: BabelNode is an open record and the object check establishes it.
  return value as BabelNode;
}

export function nodes<T>(value: T): readonly BabelNode[] {
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
