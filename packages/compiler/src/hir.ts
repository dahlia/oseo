import type { Diagnostic, SourceRange } from "./source.ts";
import type {
  BinaryOperator,
  BindingPatternMode,
  FunctionKind,
  Hint,
  LocatedSyntax,
  LogicalOperator,
  SyntaxFunction,
  SyntaxParameter,
  UnaryOperator,
} from "./syntax.ts";
/** One resolved identifier leaf with explicit binding identity. */
export interface HirBindingIdentifier extends LocatedSyntax {
  readonly bindingId: number;
  readonly functionNameBinding?: true;
  readonly importedBinding?: true;
  readonly kind: "binding-identifier";
  readonly mutable: boolean;
  readonly name: string;
}

/** One resolved member reference used as an assignment-pattern leaf. */
export interface HirAssignmentMemberTarget extends LocatedSyntax {
  readonly key: HirExpression;
  readonly kind: "assignment-member";
  readonly object: HirExpression;
}

/** One resolved initialized element in an array binding pattern. */
export interface HirBindingElement extends LocatedSyntax {
  readonly initializer?: HirExpression;
  readonly pattern: HirBindingPattern;
}

/** One resolved array binding pattern. */
export interface HirArrayBindingPattern extends LocatedSyntax {
  readonly elements: readonly (HirBindingElement | undefined)[];
  readonly kind: "array-binding-pattern";
  readonly rest?: HirBindingPattern;
}

/** One resolved property in an object binding pattern. */
export interface HirObjectBindingProperty extends LocatedSyntax {
  readonly initializer?: HirExpression;
  readonly key: HirExpression;
  readonly pattern: HirBindingPattern;
}

/** One resolved object binding pattern. */
export interface HirObjectBindingPattern extends LocatedSyntax {
  readonly kind: "object-binding-pattern";
  readonly properties: readonly HirObjectBindingProperty[];
  readonly rest?: HirBindingTarget;
}

/** One resolved leaf admitted by a declaration or assignment pattern. */
export type HirBindingTarget = HirAssignmentMemberTarget | HirBindingIdentifier;

/** One recursively resolved binding or assignment pattern. */
export type HirBindingPattern =
  | HirArrayBindingPattern
  | HirBindingTarget
  | HirObjectBindingPattern;

/** One resolved switch clause sharing the case-block scope. */
export interface HirSwitchCase {
  readonly body: readonly HirStatement[];
  readonly range: SourceRange;
  readonly test?: HirExpression;
}
/** One resolved for-head binding copied into each iteration. */
export interface HirForDeclaration {
  readonly bindingId: number;
  readonly hint: Hint | undefined;
  readonly initializer: HirExpression;
  readonly mutable: boolean;
  readonly name: string;
  readonly range: SourceRange;
}
/** One resolved for-of target with explicit binding identity. */
export type HirForOfTarget =
  | {
      readonly bindingId: number;
      readonly declarationKind: "const" | "let" | "var";
      readonly hint: Hint | undefined;
      readonly kind: "declaration";
      readonly mutable: boolean;
      readonly name: string;
      readonly range: SourceRange;
    }
  | {
      readonly declarationKind: "const" | "let" | "var";
      readonly kind: "pattern-declaration";
      readonly pattern: HirBindingPattern;
      readonly range: SourceRange;
    }
  | {
      readonly bindingId: number;
      readonly functionNameBinding?: true;
      readonly importedBinding?: true;
      readonly kind: "binding";
      readonly mutable: boolean;
      readonly name: string;
      readonly range: SourceRange;
    }
  | {
      readonly key: HirExpression;
      readonly kind: "property";
      readonly object: HirExpression;
      readonly range: SourceRange;
    };

/**
 * The named error constructors the profile admits as intrinsic values.
 * An unshadowed reference to one of these names resolves to the
 * runtime-owned constructor instead of an unknown-binding diagnostic.
 */
export type ErrorIntrinsicName =
  | "Error"
  | "EvalError"
  | "RangeError"
  | "ReferenceError"
  | "SyntaxError"
  | "TypeError"
  | "URIError";

const errorIntrinsicNames: readonly ErrorIntrinsicName[] = [
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
];

export function errorIntrinsicName(
  name: string,
): ErrorIntrinsicName | undefined {
  return errorIntrinsicNames.find((candidate) => candidate === name);
}

/** A resolved call target in HIR. */
export type HirCallTarget =
  | {
      readonly kind: "console-log";
    }
  | {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    }
  | {
      readonly kind: "promise-intrinsic";
      readonly method:
        | "all"
        | "asyncCall"
        | "awaitThen"
        | "race"
        | "reject"
        | "resolve"
        | "then";
    }
  | {
      readonly kind: "timer-intrinsic";
      readonly method: "clearTimeout" | "setTimeout";
    }
  | {
      readonly callee: HirExpression;
      readonly kind: "dynamic";
    }
  | {
      readonly key: HirExpression;
      readonly kind: "method";
      readonly object: HirExpression;
    };

/** One resolved spread entry retained inside an HIR array literal. */
export interface HirArraySpreadElement extends LocatedSyntax {
  readonly argument: HirExpression;
  readonly kind: "spread";
}

/** One ordinary, spread, or elided HIR array literal entry. */
export type HirArrayElement = HirArraySpreadElement | HirExpression | undefined;

/** One resolved spread entry retained inside an HIR call argument list. */
export interface HirSpreadArgument extends LocatedSyntax {
  readonly argument: HirExpression;
  readonly kind: "spread";
}

/** One ordinary or spread HIR call argument. */
export type HirCallArgument = HirExpression | HirSpreadArgument;

/** A resolved, normalized HIR expression. */
export type HirExpression =
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "await";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionNameBinding?: boolean;
      readonly importedBinding?: boolean;
      readonly kind: "binding-set";
      readonly mutable: boolean;
      readonly name: string;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "destructuring-set";
      readonly pattern: HirBindingPattern;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly HirArrayElement[];
      readonly kind: "array";
    })
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: HirExpression;
      readonly operator: BinaryOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly kind: "call";
      readonly target: HirCallTarget;
    })
  | (LocatedSyntax & {
      readonly alternate: HirExpression;
      readonly consequent: HirExpression;
      readonly kind: "conditional";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "logical";
      readonly left: HirExpression;
      readonly operator: LogicalOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expressions: readonly HirExpression[];
      readonly kind: "sequence";
    })
  | (LocatedSyntax & {
      readonly functionId: number;
      readonly functionKind: FunctionKind;
      readonly kind: "function";
      readonly name: string;
      readonly parameterCount: number;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly kind: "binding";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly errorName: ErrorIntrinsicName;
      readonly kind: "error-intrinsic";
    })
  | (LocatedSyntax & {
      readonly kind: "symbol-intrinsic";
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly entries: readonly {
        readonly bindingId: number;
        readonly name: string;
      }[];
      readonly kind: "module-namespace";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly callee: HirExpression;
      readonly kind: "new";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly kind: "promise-construct";
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly {
        readonly key: HirExpression;
        readonly value: HirExpression;
      }[];
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-delete";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-get";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-set";
      readonly object: HirExpression;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "number";
      readonly value: number;
    })
  | (LocatedSyntax & {
      readonly kind: "string";
      readonly value: string;
    })
  | (LocatedSyntax & {
      readonly kind: "this";
    })
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "unary";
      readonly operator: UnaryOperator;
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** A resolved HIR statement with explicit binding identity. */
export type HirStatement =
  | (LocatedSyntax & {
      readonly body: readonly HirStatement[];
      readonly kind: "block";
    })
  | (LocatedSyntax & {
      readonly kind: "break";
      readonly label?: string;
    })
  | (LocatedSyntax & {
      readonly kind: "continue";
      readonly label?: string;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "do-while";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "labeled";
      readonly label: string;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly declarations?: readonly HirForDeclaration[];
      readonly init?: HirExpression;
      readonly kind: "for";
      readonly test?: HirExpression;
      readonly update?: HirExpression;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly iterable: HirExpression;
      readonly kind: "for-of";
      readonly target: HirForOfTarget;
    })
  | (LocatedSyntax & {
      readonly cases: readonly HirSwitchCase[];
      readonly discriminant: HirExpression;
      readonly kind: "switch";
    })
  | (LocatedSyntax & {
      readonly declarationKind: "const" | "let" | "var";
      readonly initializer: HirExpression;
      readonly kind: "binding-pattern";
      readonly mode: BindingPatternMode;
      readonly pattern: HirBindingPattern;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "binding-init";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionId: number;
      readonly functionKind: FunctionKind;
      readonly functionName: string;
      readonly kind: "function-init";
      readonly name: string;
      readonly parameterCount: number;
    })
  | (LocatedSyntax & {
      readonly alternate: HirStatement | undefined;
      readonly consequent: HirStatement;
      readonly kind: "if";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "throw";
    })
  | (LocatedSyntax & {
      readonly block: HirStatement;
      readonly handler:
        | {
            readonly body: HirStatement;
            readonly pattern: HirBindingPattern;
            readonly range: SourceRange;
          }
        | undefined;
      readonly finalizer: HirStatement | undefined;
      readonly kind: "try";
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "while";
      readonly test: HirExpression;
    });

/** A resolved function parameter. */
export interface HirParameter extends SyntaxParameter {
  readonly bindingId: number;
}

/** One statically resolved HIR function. */
export interface HirFunction extends LocatedSyntax {
  readonly body: readonly HirStatement[];
  readonly functionKind: FunctionKind;
  readonly id: number;
  readonly kind: "hir-function";
  readonly localBindingIds: readonly number[];
  readonly name: string;
  readonly parameters: readonly HirParameter[];
  readonly returnHints: readonly Hint[];
  readonly selfBindingId?: number;
  readonly strict?: boolean;
}

/** One script environment cell required outside the script statement list. */
export interface HirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/** A normalized script and its statically callable functions. */
export interface HirProgram {
  readonly body: readonly HirStatement[];
  readonly functions: readonly HirFunction[];
  readonly globalBindings?: readonly HirGlobalBinding[];
  readonly kind: "hir-program";
  readonly range: SourceRange;
  readonly sourceId: string;
  readonly strict?: boolean;
}

/** Result of profile validation and HIR name resolution. */
export interface HirResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly program?: HirProgram;
}

export interface Binding {
  readonly functionId?: number;
  readonly functionNameBinding?: boolean;
  readonly id: number;
  readonly importedBinding?: boolean;
  readonly mutable: boolean;
  readonly name: string;
  readonly pendingDeclaration?: boolean;
}

export interface ResolveState {
  nextBindingId: number;
  readonly diagnostics: Diagnostic[];
  readonly functionInfo: Map<
    SyntaxFunction,
    { readonly bindingId?: number; readonly id: number }
  >;
  readonly hirFunctions: HirFunction[];
  /** Active labels of the function being resolved; loops accept continue. */
  readonly labels: { readonly loop: boolean; readonly name: string }[];
  nextFunctionId: number;
  readonly sourceId: string;
}
