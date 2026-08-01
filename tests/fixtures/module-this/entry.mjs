import { dependencyReceiver, dependencyThis } from "./dependency.mjs";

console.log("entry", this === undefined, typeof this, this);
console.log("imported", dependencyThis === undefined);
console.log("imported call", dependencyReceiver() === undefined);
const arrow = () => this;
console.log("arrow", arrow() === undefined);
function inner() {
  return this;
}
console.log("inner", inner() === undefined);
function innerArrowOwner() {
  const nested = () => this;
  return nested();
}
console.log("inner arrow", innerArrowOwner() === undefined);
const holder = {
  arrowMember: () => this,
  method() {
    return this;
  },
};
console.log(
  "member",
  holder.method() === holder,
  holder.arrowMember() === undefined,
);
const detached = holder.method;
console.log("detached", detached() === undefined);
class Owner {
  read() {
    return this;
  }
  static readStatic() {
    return this;
  }
}
const owner = new Owner();
console.log("class", owner.read() === owner, Owner.readStatic() === Owner);
function* stepped() {
  yield this;
}
console.log("generator", stepped().next().value === undefined);
function defaulted(value = this) {
  return value;
}
const arrowDefaulted = (value = this) => value;
console.log(
  "default",
  defaulted() === undefined,
  defaulted(holder) === holder,
  arrowDefaulted() === undefined,
);
async function later() {
  return this;
}
await Promise.resolve();
console.log("after await", this === undefined, arrow() === undefined);
console.log("async", (await later()) === undefined);
