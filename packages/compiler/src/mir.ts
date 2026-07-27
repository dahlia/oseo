import type { ErrorIntrinsicName } from "./hir.ts";
import type { SourceRange } from "./source.ts";
import type {
  BinaryOperator,
  FunctionKind,
  HintName,
  HintProvenance,
  LocatedSyntax,
  UnaryOperator,
} from "./syntax.ts";
/** A primitive constant retained without lossy textual serialization. */
export type MirConstant =
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "undefined" };

/** A direct call target independent of HIR and source syntax. */
export type MirCallTarget =
  | { readonly kind: "await" }
  | { readonly kind: "console-log" }
  | { readonly kind: "dynamic" }
  | {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    }
  | { readonly kind: "promise-constructor" }
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
  | { readonly functionId: number; readonly kind: "function" };

/** Hint data copied into MIR without retaining a HIR or syntax object. */
export interface MirHint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

/** Compiler-owned policy for removable guarded specialization. */
export type SpecializationMode = "disabled" | "enabled";

/** Explicit compiler orchestration options, independent of process globals. */
export interface CompilerOptions {
  readonly observeSpecialization?: boolean;
  readonly specialization?: SpecializationMode;
}

/** One MIR-owned function parameter and its specialization hints. */
export interface MirParameter {
  readonly bindingId: number;
  readonly hints: readonly MirHint[];
  readonly name: string;
  readonly range: SourceRange;
  /** Collect every remaining call argument into a fresh array. */
  readonly rest?: true;
}

/** One script-owned lexical binding shared by declared functions. */
export interface MirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/** One control destination and the cleanup nesting active at that point. */
export interface MirControlTarget {
  readonly blockId: number;
  readonly cleanupDepth: number;
}

/** One inspectable backend-neutral MIR operation. */
export interface MirOperation {
  /**
   * Selects the accessor slot for `property-define-accessor` and the
   * `SetFunctionName` prefix for the accessor closure created by
   * `function-create`.
   */
  readonly accessorKind?: "get" | "set";
  readonly argumentListId?: number;
  readonly arguments: readonly number[];
  readonly arrayLength?: number;
  readonly bindingId?: number;
  readonly cacheId?: number;
  readonly constant?: MirConstant;
  readonly detail: string;
  /**
   * Enumerability of the property a `property-define-accessor` defines.
   * A class body's accessor is non-enumerable, unlike an object literal's
   * accessor clause; absent means the enumerable object literal default.
   */
  readonly enumerable?: boolean;
  readonly id: number;
  readonly kind:
    | "add-smi-checked"
    | "argument-list-append"
    | "argument-list-create"
    | "array-append"
    | "array-append-hole"
    | "array-create"
    | "binary"
    | "binding-reset"
    | "box-smi"
    | "branch"
    | "call"
    | "check-status"
    | "class-prototype"
    | "constant"
    | "caught"
    | "completion-set"
    | "construct"
    | "construct-receiver"
    | "error-intrinsic"
    | "symbol-intrinsic"
    | "count-guard-hit"
    | "count-guard-miss"
    | "count-overflow-miss"
    | "function-create"
    | "guard-object"
    | "guard-shape"
    | "guard-smi"
    | "initialize"
    | "iterator-close"
    | "iterator-delegate-next"
    | "iterator-delegate-return"
    | "iterator-get"
    | "iterator-next"
    | "join"
    | "load-fixed-slot"
    | "module-namespace-create"
    | "object-coercible"
    | "object-create"
    | "object-rest"
    | "object-spread"
    | "property-key"
    | "property-define-accessor"
    | "property-define-data"
    | "property-define-method"
    | "property-delete"
    | "property-get"
    | "property-set"
    | "read"
    | "receiver"
    | "root-store"
    | "safepoint"
    | "unbox-smi"
    | "unary"
    | "update-property-cache"
    | "write";
  readonly mutable?: boolean;
  readonly namespaceBindingIds?: readonly number[];
  readonly namespaceNames?: readonly string[];
  readonly checkedResult?: number;
  readonly abruptTarget?: MirControlTarget;
  readonly completionKind?: "jump" | "normal" | "return" | "throw";
  readonly completionSlot?: number;
  readonly completionTarget?: MirControlTarget;
  readonly errorName?: ErrorIntrinsicName;
  readonly functionId?: number;
  readonly functionKind?: FunctionKind;
  readonly functionLength?: number;
  readonly functionName?: string;
  readonly functionNameBinding?: boolean;
  readonly importedBinding?: boolean;
  readonly hint?: MirHint;
  readonly iteratorNextMethodResult?: number;
  readonly iteratorDoneState?: number;
  /**
   * The slot receiving the stepped value. `iterator-next` leaves it
   * `undefined` once the iterator reports exhaustion, while the two
   * delegation operations always store `IteratorValue`, because `yield*`
   * reports the final value as the delegating expression's result.
   */
  readonly iteratorValueResult?: number;
  readonly operator?: BinaryOperator | UnaryOperator;
  readonly range: SourceRange;
  /**
   * Forces strict-mode property assignment and deletion for one
   * operation lowered inline into a possibly non-strict function. A
   * class body's computed element keys are the only such region: they
   * are strict code even when the enclosing script is not.
   */
  readonly strict?: true;
  readonly target?: MirCallTarget;
}

/** A MIR block terminator. */
export type MirTerminator =
  | {
      readonly kind: "branch";
      readonly test: number;
      readonly whenFalse: number;
      readonly whenTrue: number;
    }
  | {
      readonly kind: "jump";
      readonly target: number;
      readonly values?: readonly number[];
    }
  | {
      readonly kind: "return";
      readonly value: number;
    }
  | {
      /**
       * Suspends the enclosing generator: the saved state records `resume`
       * as the block that continues execution, `value` leaves the generator
       * as the yielded value, and the next resumption stores the sent value
       * in `sent` before running `resume`.
       *
       * A resumption that delivers a return completion, as
       * `%GeneratorPrototype%.return` and an implicit `IteratorClose` do,
       * continues at `returnResume` instead. That block leaves the body the
       * way a `return` statement written at the suspension point would, so
       * every enclosing `finally` and iterator close still runs.
       */
      readonly kind: "generator-yield";
      readonly resume: number;
      /**
       * True when `value` already is a complete iterator result object
       * that the resumption reports unchanged. `yield*` suspends this
       * way, because `GeneratorYield` receives the inner iterator's own
       * result object rather than a freshly created one.
       */
      readonly resultObject?: true;
      readonly returnResume: number;
      readonly sent: number;
      readonly value: number;
    }
  | {
      readonly completionSlot: number;
      readonly kind: "resume-completion";
      readonly outerAbrupt?: MirControlTarget;
      readonly outerFinalizer?: MirControlTarget;
    }
  | {
      readonly kind: "unreachable";
    };

/** One deterministic control-flow block. */
export interface MirBlock {
  readonly id: number;
  readonly operations: readonly MirOperation[];
  readonly parameters?: readonly number[];
  readonly terminator: MirTerminator;
}

/** Inspectable identity and control-flow anchors for one specialization. */
export interface MirSpecialization {
  readonly genericBlock: number;
  readonly hints: readonly MirHint[];
  readonly joinBlock: number;
  readonly kind: "smi-add";
  readonly range: SourceRange;
}

/** MIR for one declared function or script. */
export interface MirFunction extends LocatedSyntax {
  readonly blocks: readonly MirBlock[];
  /** JavaScript `length`, independent from the call ABI parameter count. */
  readonly functionLength: number;
  /**
   * A synchronous generator body. Calling the function runs only the
   * parameter and environment prologue and returns a suspended generator;
   * the blocks run on resumption and may leave through `generator-yield`.
   */
  readonly generator?: true;
  readonly id: number;
  readonly kind: "mir-function";
  readonly localBindingIds?: readonly number[];
  readonly name: string;
  /** Number of positional parameters consumed by the generated function. */
  readonly parameterCount: number;
  readonly parameters: readonly MirParameter[];
  readonly rootSlotCount: number;
  readonly selfBindingId?: number;
  readonly specialization?: MirSpecialization;
  readonly strict?: boolean;
}

/** Backend-neutral MIR for one source script. */
export interface MirProgram {
  readonly functions: readonly MirFunction[];
  readonly globalBindings: readonly MirGlobalBinding[];
  readonly kind: "mir-program";
  readonly script: MirFunction;
  readonly sourceId: string;
  readonly specialization: SpecializationMode;
  readonly observeSpecialization: boolean;
}

export interface MutableMirBlock {
  readonly id: number;
  readonly operations: MirOperation[];
  parameters?: number[];
  terminator: MirTerminator | undefined;
}

export interface MirBuilder {
  readonly abruptTargets: MirControlTarget[];
  readonly blocks: MutableMirBlock[];
  readonly loops: {
    readonly breakTarget: MirControlTarget;
    readonly continueTarget: MirControlTarget;
  }[];
  readonly labels: {
    readonly breakTarget: MirControlTarget;
    readonly continueTarget?: MirControlTarget;
    readonly name: string;
  }[];
  /** Labels waiting for the next loop lowering to claim their targets. */
  readonly pendingLabels: string[];
  readonly finalizers: MirControlTarget[];
  /**
   * True while lowering a generator body. Only such a body may end a
   * block with `generator-yield`, because only its root slots survive
   * suspension.
   */
  readonly generator: boolean;
  current: MutableMirBlock;
  nextValue: number;
  readonly specialization: SpecializationMode;
  /**
   * True while lowering code that is strict regardless of the enclosing
   * function's own strictness, so property assignment and deletion report
   * their failures instead of ignoring them.
   */
  strictCode: boolean;
}
