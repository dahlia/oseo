// Copyright (C) 2018 Valerie Young. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

var notExportedVar;
let notExportedLet;
const notExportedConst = null;
function notExportedFunc() {}
function* notExportedGen() {}
class notExportedClass {}

var starAsBindingId;

export var starAsVarDecl;
export let starAsLetDecl;
export const starAsConstDecl = null;
export function starAsFuncDecl() {}
export function* starAsGenDecl() {}
export class starAsClassDecl {}
export { starAsBindingId };
export { starAsBindingId as starIdName };
export { starAsIndirectIdName } from "./ns.mjs";
export { starAsIndirectIdName as starAsIndirectIdName2 } from "./ns.mjs";
export * as namespaceBinding from "./ns.mjs";
