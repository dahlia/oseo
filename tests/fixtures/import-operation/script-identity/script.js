var isFirstScript = typeof globalThis.evaluated === "undefined";
if (isFirstScript) globalThis.evaluated = 0;
globalThis.evaluated += 1;
console.log(isFirstScript ? "script evaluates" : "module evaluates");
var requests = Promise.all([import("./script.js"), import("./script.js")]);
var p = requests.then(async function (namespaces) {
  var again = await import("./script.js");
  return [
    globalThis.evaluated,
    namespaces[0] === namespaces[1],
    again === namespaces[0],
  ];
});
if (isFirstScript) {
  p.then(function (result) {
    console.log("evaluations", result.join(" "));
  });
}
