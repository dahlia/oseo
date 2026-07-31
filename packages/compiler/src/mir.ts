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
  | { readonly kind: "super" }
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
   * Selects the accessor slot for `property-define-accessor` and
   * `class-private-method-define`,
   * `class-static-private-method-define`, and the `SetFunctionName`
   * prefix for the accessor closure created by `function-create`.
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
    | "class-field-define"
    | "class-heritage"
    | "class-private-field-define"
    | "class-private-method-define"
    | "class-prototype"
    | "class-static-field-define"
    | "class-static-private-field-define"
    | "class-static-private-method-define"
    | "constant"
    | "caught"
    | "completion-set"
    | "construct"
    | "construct-receiver"
    | "derived-return"
    | "error-intrinsic"
    | "symbol-intrinsic"
    | "template-object"
    | "count-guard-hit"
    | "count-guard-miss"
    | "count-overflow-miss"
    | "function-create"
    | "guard-object"
    | "guard-shape"
    | "guard-smi"
    | "home-object-bind"
    | "initialize"
    | "instance-elements-init"
    | "iterator-close"
    | "iterator-close-result"
    | "iterator-close-start"
    | "iterator-await-result"
    | "iterator-await-start"
    | "iterator-delegate-next"
    | "iterator-delegate-return"
    | "iterator-delegate-throw"
    | "iterator-get"
    | "iterator-next"
    | "join"
    | "load-fixed-slot"
    | "module-namespace-create"
    | "new-target"
    | "object-coercible"
    | "object-create"
    | "object-rest"
    | "object-spread"
    | "private-get"
    | "private-in"
    | "private-name-create"
    | "private-set"
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
    | "super-base"
    | "super-constructor"
    | "safepoint"
    | "this-bind"
    | "unbox-smi"
    | "unary"
    | "update-property-cache"
    | "write";
  readonly mutable?: boolean;
  readonly namespaceBindingIds?: readonly number[];
  readonly namespaceNames?: readonly string[];
  /** Cooked strings for one cached tagged-template object. */
  readonly templateCooked?: readonly (string | undefined)[];
  /** Raw strings paired with `templateCooked`. */
  readonly templateRaw?: readonly string[];
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
  /**
   * Marks one iterator operation as an asynchronous iteration step,
   * which reads `Symbol.asyncIterator` before falling back to a wrapped
   * synchronous iterator and awaits every result. A `for await` head and
   * a `yield*` inside an asynchronous generator produce these operations,
   * so the synchronous protocol keeps its unconditional lowering.
   */
  readonly iteratorAsync?: true;
  readonly iteratorNextMethodResult?: number;
  readonly iteratorDoneState?: number;
  /** Skip outer AsyncIteratorClose result validation owned by a wrapper. */
  readonly iteratorCloseResultMode?: number;
  /**
   * The asynchronous iterator action started before a traced-frame await.
   * Its promise settles to an iterator result object, except that a
   * delegation return with no asynchronous `return` method settles to the
   * directly awaited return value and records that mode separately.
   */
  readonly iteratorStepKind?:
    | "delegate-next"
    | "delegate-return"
    | "delegate-throw"
    | "next";
  /** Root slot retaining the direct-value result mode across suspension. */
  readonly iteratorValueOnlyResult?: number;
  /** Read `IteratorValue` even when the settled result reports done. */
  readonly iteratorValueWhenDone?: true;
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
  /**
   * Marks one `property-get` or `property-set` as a `super` reference,
   * which starts its lookup at the object the operation's first argument
   * names and passes a distinct receiver as its last argument. A getter
   * or setter therefore runs against the enclosing element's `this`, and
   * an assignment that reaches no setter creates its own property on
   * that receiver instead of on the object it looked through.
   */
  readonly superReference?: true;
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
       * every enclosing `finally` and iterator close still runs. A
       * resumption that delivers a throw completion continues at
       * `throwResume`, which raises the sent value at the suspension point.
       *
       * Only an asynchronous generator body receives either resumption at
       * every suspension, so a synchronous body names no `throwResume` and
       * an `awaited` suspension names no `returnResume`.
       */
      readonly kind: "generator-yield";
      /**
       * True when the suspension is an Await rather than a Yield: `value`
       * is the operand the driver resolves, and the resumption delivers
       * the fulfilled value to `resume` or the rejection to `throwResume`.
       * The suspension leaves no iteration step, so no consumer observes
       * it. Only an asynchronous generator body suspends this way.
       */
      readonly awaited?: true;
      readonly resume: number;
      /**
       * True when `value` already is a complete iterator result object
       * that the resumption reports unchanged. `yield*` suspends this
       * way, because `GeneratorYield` receives the inner iterator's own
       * result object rather than a freshly created one.
       */
      readonly resultObject?: true;
      readonly returnResume?: number;
      readonly sent: number;
      readonly throwResume?: number;
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
  /**
   * The implicit non-strict `arguments` binding initialized by the backend
   * from the generic call ABI.
   */
  readonly argumentsBindingId?: number;
  /**
   * An ordinary asynchronous body backed by a traced suspension frame.
   * Calling it still returns one capability promise rather than exposing
   * the frame.
   */
  readonly asyncFunction?: true;
  readonly blocks: readonly MirBlock[];
  /**
   * The `this` binding of a derived class constructor. Every `return`
   * leaves through a `derived-return` operation against this binding, so
   * the constructor cannot produce a receiver that `super()` never bound.
   */
  readonly derivedThisBindingId?: number;
  /** JavaScript `length`, independent from the call ABI parameter count. */
  readonly functionLength: number;
  /**
   * An asynchronous generator body, which is also a `generator` body.
   * Its `await` operands suspend through `generator-yield` as well, so
   * the driver owns every step the body takes and reports each one
   * through a promise.
   */
  readonly asyncGenerator?: true;
  /**
   * A generator body. Calling the function runs only the parameter and
   * environment prologue and returns a suspended generator; the blocks
   * run on resumption and may leave through `generator-yield`.
   */
  readonly generator?: true;
  /**
   * First block executed when a newly created generator is resumed. Blocks
   * reachable before this one initialize non-simple parameters at call time.
   */
  readonly generatorBodyStart?: number;
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
  /**
   * True while lowering an ordinary asynchronous body. Its `await`
   * operands suspend through the traced frame, while `return` resolves
   * the function capability without AsyncGeneratorAwaitReturn.
   */
  readonly asyncFunction: boolean;
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
   * True while lowering an asynchronous generator body, whose `await`
   * operands and `yield` operands both suspend rather than drain the
   * scheduler in place. Such a body is always a `generator` body too.
   */
  readonly asyncGenerator: boolean;
  /**
   * The binding holding the key that names the anonymous definition a
   * class field initializer body returns. Set only while lowering such
   * an initializer.
   */
  readonly fieldKeyBindingId?: number;
  /**
   * True while lowering a generator body. Only such a body may end a
   * block with `generator-yield`, because only its root slots survive
   * suspension.
   */
  readonly generator: boolean;
  /**
   * True while lowering a class constructor whose class declares
   * instance fields, so `super()` initializes them where it returns.
   */
  readonly initializesInstanceElements: boolean;
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
