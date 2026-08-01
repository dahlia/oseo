export const dependencyThis = this;
export function dependencyReceiver() {
  // The receiver an ordinary module function reads is the observation.
  // eslint-disable-next-line no-this-in-exported-function -- Observed.
  return this;
}
console.log("dependency", this === undefined);
