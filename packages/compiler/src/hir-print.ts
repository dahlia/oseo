import type {
  HirBindingPattern,
  HirCallArgument,
  HirClassField,
  HirExpression,
  HirPrivateName,
  HirProgram,
  HirStatement,
} from "./hir.ts";
import type { SourceRange } from "./source.ts";
import type { Hint } from "./syntax.ts";
export function rangeText(range: SourceRange): string {
  return (
    `${range.start.line}:${range.start.column}-` +
    `${range.end.line}:${range.end.column}`
  );
}

function hintText(hints: readonly Hint[]): string {
  if (hints.length === 0) return "";
  return ` hints=[${hints
    .map((hint) => `${hint.provenance}:${hint.name}`)
    .join(",")}]`;
}

export function numberText(value: number): string {
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function printHirPrivateName(privateName: HirPrivateName): string {
  return `%b${privateName.bindingId} ${privateName.name}`;
}

function printHirClassElementKey(key: HirClassField["key"]): string {
  return key.kind === "private-name"
    ? printHirPrivateName(key.privateName)
    : printHirExpression(key);
}

function printHirCallArgument(argument: HirCallArgument): string {
  return argument.kind === "spread"
    ? `...${printHirExpression(argument.argument)}`
    : printHirExpression(argument);
}

function printHirExpression(expression: HirExpression): string {
  if (expression.kind === "binding-set") {
    return (
      `%b${expression.bindingId} ${expression.name} = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "binding-update") {
    return (
      `%b${expression.bindingId} ${expression.name} ` +
      `${expression.operator}= ${printHirExpression(expression.value)}`
    );
  }
  if (expression.kind === "binding-step") {
    const target = `%b${expression.bindingId} ${expression.name}`;
    return expression.prefix
      ? `${expression.operator}${target}`
      : `${target}${expression.operator}`;
  }
  if (expression.kind === "destructuring-set") {
    return (
      `write ${printHirBindingPattern(expression.pattern)} = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "array") {
    return (
      "[" +
      expression.elements
        .map((element) =>
          element == null
            ? "<hole>"
            : element.kind === "spread"
              ? `...${printHirExpression(element.argument)}`
              : printHirExpression(element),
        )
        .join(", ") +
      "]"
    );
  }
  if (expression.kind === "binding") {
    return `%b${expression.bindingId}(${expression.name})`;
  }
  if (expression.kind === "error-intrinsic") {
    return `intrinsic ${expression.errorName}`;
  }
  if (expression.kind === "symbol-intrinsic") {
    return "intrinsic Symbol";
  }
  if (expression.kind === "function") {
    return `function @f${expression.functionId} ${expression.name}`;
  }
  if (expression.kind === "this") return "this";
  if (expression.kind === "new-target") return "new.target";
  if (expression.kind === "undefined" || expression.kind === "null") {
    return expression.kind;
  }
  if (expression.kind === "string") return JSON.stringify(expression.value);
  if (expression.kind === "number") return numberText(expression.value);
  if (expression.kind === "boolean") return String(expression.value);
  if (expression.kind === "unary") {
    const spacing = expression.operator.length > 1 ? " " : "";
    return (
      `(${expression.operator}${spacing}` +
      `${printHirExpression(expression.argument)})`
    );
  }
  if (expression.kind === "binary" || expression.kind === "logical") {
    const left = printHirExpression(expression.left);
    const operator = String(expression.operator);
    const right = printHirExpression(expression.right);
    return `(${left} ${operator} ${right})`;
  }
  if (expression.kind === "conditional") {
    const test = printHirExpression(expression.test);
    const consequent = printHirExpression(expression.consequent);
    const alternate = printHirExpression(expression.alternate);
    return `(${test} ? ${consequent} : ${alternate})`;
  }
  if (expression.kind === "sequence") {
    return `(${expression.expressions.map(printHirExpression).join(", ")})`;
  }
  if (expression.kind === "object") {
    return (
      "object{" +
      expression.properties
        .map((property) =>
          property.kind === "spread"
            ? `...${printHirExpression(property.argument)}`
            : (property.accessorKind == null
                ? ""
                : `${property.accessorKind} `) +
              `${printHirExpression(property.key)}: ` +
              printHirExpression(property.value),
        )
        .join(", ") +
      "}"
    );
  }
  if (expression.kind === "optional-chain") {
    const base =
      expression.base.kind === "optional-chain"
        ? `(${printHirExpression(expression.base)})`
        : printHirExpression(expression.base);
    return expression.links.reduce(
      (printed, link) =>
        link.kind === "member"
          ? `${printed}${link.optional ? "?." : ""}[` +
            `${printHirExpression(link.key)}]`
          : link.chainBoundary === true
            ? `(${printed})(` +
              `${link.arguments.map(printHirCallArgument).join(", ")})`
            : `${printed}${link.optional ? "?." : ""}(` +
              `${link.arguments.map(printHirCallArgument).join(", ")})`,
      base,
    );
  }
  if (expression.kind === "class") {
    return (
      "class" +
      (expression.nameBinding == null
        ? ""
        : ` ${expression.nameBinding.name}`) +
      (expression.heritage == null
        ? ""
        : ` extends ${printHirExpression(expression.heritage)}`) +
      `{constructor: ${printHirExpression(expression.constructorFunction)}` +
      expression.elements
        .map((element) =>
          element.kind === "static-block"
            ? `, static block ${printHirExpression(element.body)}`
            : element.kind === "field"
              ? ", " +
                (element.staticPlacement === true ? "static " : "") +
                `field ${printHirClassElementKey(element.key)}` +
                (element.initializer == null
                  ? ""
                  : ` = ${printHirExpression(element.initializer)}`)
              : ", " +
                (element.staticPlacement === true ? "static " : "") +
                (element.accessorKind == null
                  ? ""
                  : `${element.accessorKind} `) +
                `${printHirClassElementKey(element.key)}: ` +
                printHirExpression(element.value),
        )
        .join("") +
      "}"
    );
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const operation = expression.kind === "property-get" ? "get" : "delete";
    return (
      `${operation} ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}]`
    );
  }
  if (expression.kind === "property-set") {
    return (
      `set ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}] = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "property-update") {
    return (
      `update ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}] ${expression.operator}= ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "property-step") {
    const target =
      `update ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}]`;
    return expression.prefix
      ? `${expression.operator}${target}`
      : `${target}${expression.operator}`;
  }
  if (expression.kind === "private-get") {
    return (
      `private get ${printHirExpression(expression.object)}.` +
      printHirPrivateName(expression.privateName)
    );
  }
  if (expression.kind === "private-set") {
    return (
      `private set ${printHirExpression(expression.object)}.` +
      `${printHirPrivateName(expression.privateName)} = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "private-update") {
    return (
      `private update ${printHirExpression(expression.object)}.` +
      `${printHirPrivateName(expression.privateName)} ` +
      `${expression.operator}= ${printHirExpression(expression.value)}`
    );
  }
  if (expression.kind === "private-step") {
    const target =
      `private update ${printHirExpression(expression.object)}.` +
      printHirPrivateName(expression.privateName);
    return expression.prefix
      ? `${expression.operator}${target}`
      : `${target}${expression.operator}`;
  }
  if (expression.kind === "super-base") {
    return `super -> ${printHirExpression(expression.receiver)}`;
  }
  if (expression.kind === "module-namespace") {
    return `module-namespace {${expression.entries
      .map((entry) => `${JSON.stringify(entry.name)}: %b${entry.bindingId}`)
      .join(", ")}}`;
  }
  if (expression.kind === "await") {
    return `await ${printHirExpression(expression.argument)}`;
  }
  if (expression.kind === "yield") {
    if (expression.argument == null) return "yield";
    const star = expression.delegate === true ? "*" : "";
    return `yield${star} ${printHirExpression(expression.argument)}`;
  }
  if (expression.kind === "new") {
    return (
      `new ${printHirExpression(expression.callee)}(` +
      expression.arguments.map(printHirCallArgument).join(", ") +
      ")"
    );
  }
  if (expression.kind === "promise-construct") {
    return (
      "new intrinsic Promise(" +
      expression.arguments.map(printHirCallArgument).join(", ") +
      ")"
    );
  }
  const target =
    expression.target.kind === "console-log"
      ? "intrinsic console.log"
      : expression.target.kind === "object-intrinsic"
        ? `intrinsic Object.${expression.target.method}`
        : expression.target.kind === "promise-intrinsic"
          ? `intrinsic Promise.${expression.target.method}`
          : expression.target.kind === "timer-intrinsic"
            ? `intrinsic ${expression.target.method}`
            : expression.target.kind === "dynamic"
              ? printHirExpression(expression.target.callee)
              : expression.target.kind === "super"
                ? `super -> %b${expression.target.thisBinding.bindingId} this`
                : expression.target.kind === "private-method"
                  ? `${printHirExpression(expression.target.object)}.` +
                    printHirPrivateName(expression.target.privateName)
                  : `${printHirExpression(expression.target.object)}[` +
                    `${printHirExpression(expression.target.key)}]`;
  return (
    `call ${target}(` +
    expression.arguments.map(printHirCallArgument).join(", ") +
    ")"
  );
}

function printHirBindingPattern(pattern: HirBindingPattern): string {
  if (pattern.kind === "assignment-member") {
    return (
      `target ${printHirExpression(pattern.object)}[` +
      `${printHirExpression(pattern.key)}]`
    );
  }
  if (pattern.kind === "binding-identifier") {
    return `%b${pattern.bindingId} ${pattern.name}${hintText(pattern.hints)}`;
  }
  if (pattern.kind === "object-binding-pattern") {
    const properties = pattern.properties.map(
      (property) =>
        `${printHirExpression(property.key)}: ` +
        printHirBindingPattern(property.pattern) +
        (property.initializer == null
          ? ""
          : ` = ${printHirExpression(property.initializer)}`),
    );
    if (pattern.rest != null) {
      properties.push(`...${printHirBindingPattern(pattern.rest)}`);
    }
    return `{${properties.join(", ")}}`;
  }
  const elements = pattern.elements.map((element) =>
    element == null
      ? ""
      : printHirBindingPattern(element.pattern) +
        (element.initializer == null
          ? ""
          : ` = ${printHirExpression(element.initializer)}`),
  );
  if (pattern.rest != null) {
    elements.push(`...${printHirBindingPattern(pattern.rest)}`);
  }
  return `[${elements.join(", ")}]`;
}

function appendHirStatement(
  lines: string[],
  statement: HirStatement,
  indent: string,
): void {
  const location = ` @${rangeText(statement.range)}`;
  if (
    statement.kind === "binding-init" ||
    statement.kind === "const" ||
    statement.kind === "let"
  ) {
    lines.push(
      `${indent}${statement.kind} %b${statement.bindingId} ${statement.name}` +
        `${hintText(statement.hint == null ? [] : [statement.hint])} = ` +
        `${printHirExpression(statement.initializer)}${location}`,
    );
  } else if (statement.kind === "binding-pattern") {
    lines.push(
      `${indent}${statement.declarationKind} ${statement.mode} ` +
        `${printHirBindingPattern(statement.pattern)} = ` +
        `${printHirExpression(statement.initializer)}${location}`,
    );
  } else if (statement.kind === "expression") {
    lines.push(
      `${indent}${printHirExpression(statement.expression)}${location}`,
    );
  } else if (statement.kind === "function-init") {
    lines.push(
      `${indent}function-init %b${statement.bindingId} ${statement.name} ` +
        `= @f${statement.functionId}${location}`,
    );
  } else if (statement.kind === "return") {
    const value =
      statement.expression == null
        ? "undefined"
        : printHirExpression(statement.expression);
    lines.push(`${indent}return ${value}${location}`);
  } else if (statement.kind === "throw") {
    lines.push(
      `${indent}throw ${printHirExpression(statement.expression)}${location}`,
    );
  } else if (statement.kind === "try") {
    lines.push(`${indent}try${location}`);
    appendHirStatement(lines, statement.block, `${indent}  `);
    if (statement.handler != null) {
      lines.push(
        `${indent}catch ${printHirBindingPattern(statement.handler.pattern)}`,
      );
      appendHirStatement(lines, statement.handler.body, `${indent}  `);
    }
    if (statement.finalizer != null) {
      lines.push(`${indent}finally`);
      appendHirStatement(lines, statement.finalizer, `${indent}  `);
    }
  } else if (statement.kind === "block") {
    lines.push(`${indent}block${location}`);
    for (const child of statement.body) {
      appendHirStatement(lines, child, `${indent}  `);
    }
  } else if (statement.kind === "break" || statement.kind === "continue") {
    const label = statement.label == null ? "" : ` ${statement.label}`;
    lines.push(`${indent}${statement.kind}${label}${location}`);
  } else if (statement.kind === "labeled") {
    lines.push(`${indent}${statement.label}:${location}`);
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else if (statement.kind === "while") {
    lines.push(
      `${indent}while ${printHirExpression(statement.test)}${location}`,
    );
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else if (statement.kind === "do-while") {
    lines.push(`${indent}do${location}`);
    appendHirStatement(lines, statement.body, `${indent}  `);
    lines.push(`${indent}while ${printHirExpression(statement.test)}`);
  } else if (statement.kind === "for") {
    const head = [
      statement.declarations == null
        ? statement.init == null
          ? ""
          : printHirExpression(statement.init)
        : statement.declarations
            .map((declaration) => {
              const target =
                declaration.kind === "binding"
                  ? `%b${declaration.bindingId} ${declaration.name}`
                  : printHirBindingPattern(declaration.pattern);
              return (
                `${declaration.declarationKind} ${target} = ` +
                printHirExpression(declaration.initializer)
              );
            })
            .join(", "),
      statement.test == null ? "" : printHirExpression(statement.test),
      statement.update == null ? "" : printHirExpression(statement.update),
    ].join("; ");
    lines.push(`${indent}for (${head})${location}`);
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else if (statement.kind === "for-of") {
    const target =
      statement.target.kind === "declaration"
        ? `${statement.target.declarationKind} ` +
          `%b${statement.target.bindingId} ${statement.target.name}`
        : statement.target.kind === "pattern-declaration"
          ? `${statement.target.declarationKind} ` +
            printHirBindingPattern(statement.target.pattern)
          : statement.target.kind === "assignment-pattern"
            ? printHirBindingPattern(statement.target.pattern)
            : statement.target.kind === "binding"
              ? `%b${statement.target.bindingId} ${statement.target.name}`
              : `${printHirExpression(statement.target.object)}[` +
                `${printHirExpression(statement.target.key)}]`;
    lines.push(
      `${indent}for ${statement.awaited === true ? "await " : ""}` +
        `(${target} of ${printHirExpression(statement.iterable)})${location}`,
    );
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else if (statement.kind === "switch") {
    lines.push(
      `${indent}switch ${printHirExpression(statement.discriminant)}` +
        location,
    );
    for (const switchCase of statement.cases) {
      lines.push(
        switchCase.test == null
          ? `${indent}  default:`
          : `${indent}  case ${printHirExpression(switchCase.test)}:`,
      );
      for (const child of switchCase.body) {
        appendHirStatement(lines, child, `${indent}    `);
      }
    }
  } else {
    lines.push(`${indent}if ${printHirExpression(statement.test)}${location}`);
    appendHirStatement(lines, statement.consequent, `${indent}  `);
    if (statement.alternate != null) {
      lines.push(`${indent}else`);
      appendHirStatement(lines, statement.alternate, `${indent}  `);
    }
  }
}

/** Print deterministic, source-located HIR for review and snapshots. */
export function printHir(program: HirProgram): string {
  const lines = [`hir ${JSON.stringify(program.sourceId)}`];
  for (const functionValue of program.functions) {
    const parameters = functionValue.parameters
      .map(
        (parameter) =>
          `${parameter.rest === true ? "..." : ""}%b` +
          `${parameter.bindingId} ${parameter.name}` +
          hintText(parameter.hints),
      )
      .join(", ");
    lines.push(
      `function @f${functionValue.id} ${functionValue.name}(${parameters})` +
        `${hintText(functionValue.returnHints)} ` +
        `@${rangeText(functionValue.range)}`,
    );
    for (const statement of functionValue.body) {
      appendHirStatement(lines, statement, "  ");
    }
  }
  lines.push(`script @${rangeText(program.range)}`);
  for (const statement of program.body) {
    appendHirStatement(lines, statement, "  ");
  }
  return `${lines.join("\n")}\n`;
}
