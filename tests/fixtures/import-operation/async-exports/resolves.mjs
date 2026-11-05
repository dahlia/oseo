export let value = "initial";
export let late;
value = await Promise.resolve("awaited");
late = await new Promise((resolve) => setTimeout(() => resolve("timer"), 0));
