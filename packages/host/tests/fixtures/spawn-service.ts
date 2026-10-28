const mode = process.argv[2];
process.on("message", () => {
  if (mode === "crash") process.exit(7);
  else if (mode === "disconnect") process.disconnect();
  else process.send?.(mode === "malformed" ? null : { id: -1 });
});
