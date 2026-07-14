const summary = {
  language: "erasable TypeScript",
  values: [1, 2, 3].map((value: number): number => value * value),
};

console.log(JSON.stringify(summary));
