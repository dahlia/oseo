let fromRoot;
try {
  await import("./cycle-root.mjs");
} catch (error) {
  fromRoot = error;
}
console.log("root rejects", fromRoot.message);
let fromMember;
try {
  await import("./cycle-member.mjs");
} catch (error) {
  fromMember = error;
}
console.log("member shares the root error", fromMember === fromRoot);

// The second cycle starts from a parent, so its root has no top-level
// capability until the member's request creates one.
const fromParent = await import("./via-parent.mjs").catch((e) => e);
const fromSecondMember = await import("./cycle2-member.mjs").catch((e) => e);
console.log(
  "capability created for the root",
  fromParent.message,
  fromSecondMember === fromParent,
);
