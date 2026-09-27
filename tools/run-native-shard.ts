import { run } from "node:test";
import { spec } from "node:test/reporters";

const concurrency = Number(process.argv[2]);
const files = process.argv.slice(3);
if (
  !Number.isSafeInteger(concurrency) ||
  concurrency < 1 ||
  files.length === 0
) {
  throw new Error(
    "Native shard runner requires concurrency and explicit files.",
  );
}
// Node's CLI sorts file arguments. The API keeps this measured-cost order.
const controller = new AbortController();
let interrupted: NodeJS.Signals | undefined;
function restoreSignals(): void {
  for (const [signal, forward] of Object.entries(forwarders)) {
    process.removeListener(signal, forward);
  }
}
function interrupt(signal: NodeJS.Signals): void {
  if (interrupted != null) {
    // Preserve force-interrupt behavior if a child ignores graceful abort.
    restoreSignals();
    process.kill(process.pid, signal);
    return;
  }
  interrupted = signal;
  controller.abort();
}
const forwarders = {
  SIGINT: () => interrupt("SIGINT"),
  SIGTERM: () => interrupt("SIGTERM"),
};
for (const [signal, forward] of Object.entries(forwarders)) {
  process.on(signal, forward);
}
const stream = run({ files, concurrency, signal: controller.signal });
stream.on("end", () => {
  restoreSignals();
  if (interrupted != null) process.kill(process.pid, interrupted);
});
stream.on("test:fail", () => {
  process.exitCode = 1;
});
stream.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
stream.compose(new spec()).pipe(process.stdout);
