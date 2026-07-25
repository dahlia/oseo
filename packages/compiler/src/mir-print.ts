import { rangeText } from "./hir-print.ts";
import type { MirFunction, MirProgram, MirTerminator } from "./mir.ts";
function printTerminator(terminator: MirTerminator): string {
  if (terminator.kind === "return") return `return %${terminator.value}`;
  if (terminator.kind === "jump") {
    const values = terminator.values?.map((value) => ` %${value}`).join("");
    return `jump bb${terminator.target}${values ?? ""}`;
  }
  if (terminator.kind === "branch") {
    return (
      `branch %${terminator.test} bb${terminator.whenTrue} ` +
      `bb${terminator.whenFalse}`
    );
  }
  if (terminator.kind === "resume-completion") {
    const completion = `resume-completion bb${terminator.completionSlot}`;
    const destinations = [
      terminator.outerAbrupt == null
        ? undefined
        : `throw bb${terminator.outerAbrupt.blockId}`,
      terminator.outerFinalizer == null
        ? undefined
        : `finally bb${terminator.outerFinalizer.blockId}`,
    ].filter((destination) => destination != null);
    return destinations.length === 0
      ? completion
      : `${completion} via ${destinations.join(", ")}`;
  }
  return "unreachable";
}

function appendMirFunction(lines: string[], functionValue: MirFunction): void {
  const restParameters = functionValue.parameters
    .map((parameter, index) =>
      parameter.rest === true ? `...${index}:${parameter.name}` : undefined,
    )
    .filter((parameter) => parameter != null);
  const restText =
    restParameters.length === 0 ? "" : ` rest=[${restParameters.join()}]`;
  lines.push(
    `function @f${functionValue.id} ${functionValue.name} roots=` +
      `${functionValue.rootSlotCount}` +
      restText +
      ` @${rangeText(functionValue.range)}`,
  );
  if (functionValue.specialization != null) {
    const specialization = functionValue.specialization;
    const hints = specialization.hints
      .map((hint) => `${hint.provenance}:${hint.name}`)
      .join(", ");
    lines.push(
      `  specialize ${specialization.kind} hints=[${hints}] ` +
        `generic-fallback bb${specialization.genericBlock} ` +
        `join bb${specialization.joinBlock}`,
    );
  }
  for (const block of functionValue.blocks) {
    const parameters = block.parameters?.map((value) => `%${value}`).join(", ");
    lines.push(
      `  bb${block.id}${parameters == null ? "" : `(${parameters})`}:`,
    );
    for (const operation of block.operations) {
      const argumentText = operation.arguments
        .map((argument) => `%${argument}`)
        .join(", ");
      const resultText =
        operation.checkedResult != null
          ? `%${operation.id}, %${operation.checkedResult}`
          : operation.iteratorNextMethodResult != null
            ? `%${operation.id}, %${operation.iteratorNextMethodResult}`
            : operation.iteratorValueResult != null
              ? `%${operation.id}, %${operation.iteratorValueResult}`
              : `%${operation.id}`;
      const hintTextValue =
        operation.hint == null
          ? ""
          : ` hint=${operation.hint.provenance}:${operation.hint.name}`;
      const cacheText =
        operation.cacheId == null ? "" : ` cache=%${operation.cacheId}`;
      const argumentListText =
        operation.argumentListId == null
          ? ""
          : ` argument-list=%${operation.argumentListId}`;
      const iteratorStateText =
        operation.iteratorDoneState == null
          ? ""
          : ` done-state=%${operation.iteratorDoneState}`;
      lines.push(
        `    ${resultText} = ${operation.kind} ` +
          `${operation.detail}` +
          `${argumentText === "" ? "" : ` ${argumentText}`} ` +
          `@${rangeText(operation.range)}${hintTextValue}${cacheText}` +
          argumentListText +
          iteratorStateText,
      );
    }
    lines.push(`    ${printTerminator(block.terminator)}`);
  }
}

/** Print deterministic MIR without host paths or object identities. */
export function printMir(program: MirProgram): string {
  const lines = [
    `mir ${JSON.stringify(program.sourceId)} ` +
      `specialization ${program.specialization}`,
  ];
  for (const binding of program.globalBindings) {
    lines.push(`global %b${binding.id} ${binding.name}`);
  }
  for (const functionValue of program.functions) {
    appendMirFunction(lines, functionValue);
  }
  appendMirFunction(lines, program.script);
  return `${lines.join("\n")}\n`;
}
