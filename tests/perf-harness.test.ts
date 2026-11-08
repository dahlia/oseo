import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import { kernels, readKernel, renderKernel } from "../tools/perf/corpus.ts";
import {
  defaultMethod,
  orderForRound,
  perfHost,
  variants,
  validateMethod,
} from "../tools/perf/plan.ts";
import {
  checkExecution,
  execute,
  parseCounters,
  parseRss,
  rssCommand,
} from "../tools/perf/observation.ts";
import type { Counters, Execution } from "../tools/perf/observation.ts";
import {
  distribution,
  observeKernel,
  sampleKernel,
  sampleRss,
  sampleStartup,
} from "../tools/perf/sampling.ts";
import { prepare } from "../tools/perf/prepare.ts";
import type { HostMetadata } from "../tools/perf/prepare.ts";
import {
  artifact,
  requireBothHosts,
  validateEvidence,
} from "../tools/perf/evidence.ts";
import type {
  Artifact,
  CounterEvidence,
  Evidence,
  KernelEvidence,
} from "../tools/perf/evidence.ts";

const host: HostMetadata = {
  target: "linux-x86_64-gnu",
  os: "linux 6.18.0",
  architecture: "x64",
  cpu: "AMD EPYC synthetic fixture",
  logicalCpus: 2,
  memoryBytes: 100,
  commit: "a".repeat(40),
  dirty: false,
  node: "v24.21.0",
  deno: "deno 2.9.7 (stable, release, x86_64-unknown-linux-gnu)",
  bun: "1.4.4",
  zig: "0.16.0",
  postject: '{"npm:postject":[{"version":"1.0.0-alpha.6"}]}',
  pinsSha256: "b".repeat(64),
  lockSha256: "c".repeat(64),
};
const macHost: HostMetadata = {
  ...host,
  target: "macos-aarch64",
  os: "darwin 25.0.0",
  architecture: "arm64",
  cpu: "Apple M4",
  deno: "deno 2.9.7 (stable, release, aarch64-apple-darwin)",
};
const kernel = kernels[0]!;
const counters = {
  guardHits: 1,
  guardMisses: 2,
  overflowMisses: 3,
  genericAdditionCalls: 4,
  allocations: 5,
  collections: 6,
};
const marker = "OSEO_OBSERVATIONS " + JSON.stringify(counters) + "\n";

function result(id = "sieve", iterations = 100): Execution {
  return {
    stdout: `PERF_OK ${id} ${iterations}\nPERF_TIME 7\n`,
    stderr: "",
    status: 0,
    signal: null,
    wallMs: 10,
  };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "oseo-perf-test-"));
}

test("every corpus self-check runs and detects a wrong computation", () => {
  const directory = scratch();
  try {
    for (const item of kernels) {
      const body = readKernel(item);
      const path = join(directory, item.id + ".cjs");
      writeFileSync(path, renderKernel(item, body, 1));
      const good = spawnSync(process.execPath, [path], { encoding: "utf8" });
      assert.equal(good.status, 0, good.stderr);
      assert.equal(
        checkExecution({ ...good, wallMs: 1 }, item.id, 1) >= 0,
        true,
      );
      // Corrupt the computation while keeping the independent oracle fixed.
      writeFileSync(
        path,
        renderKernel(item, body + "\nbenchmark = () => -1;", 1),
      );
      const bad = spawnSync(process.execPath, [path], { encoding: "utf8" });
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /Self-check failed/u);
      assert.throws(() => checkExecution({ ...bad, wallMs: 1 }, item.id, 1));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("zero exit and wrong or missing output are still failures", () => {
  for (const stdout of [
    "",
    "PERF_OK sieve 100\n",
    "PERF_OK sieve 99\nPERF_TIME 7\n",
    "PERF_OK sieve 100\nPERF_TIME NaN\n",
    "extra\nPERF_OK sieve 100\nPERF_TIME 7\n",
  ]) {
    assert.throws(() => checkExecution({ ...result(), stdout }, "sieve", 100));
  }
  assert.throws(() =>
    checkExecution({ ...result(), signal: "SIGTERM" }, "sieve", 100),
  );
  assert.throws(() => checkExecution({ ...result(), status: 1 }, "sieve", 100));
  assert.throws(() =>
    checkExecution({ ...result(), wallMs: NaN }, "sieve", 100),
  );
  assert.throws(
    () => checkExecution({ ...result(), stderr: marker }, "sieve", 100),
    /Instrumented/u,
  );
});

test("counter builds require six counters and one record", () => {
  assert.deepEqual(parseCounters(marker), counters);
  for (const stderr of [
    "",
    marker + marker,
    "OSEO_OBSERVATIONS {}\n",
    "OSEO_OBSERVATIONS null\n",
    "OSEO_OBSERVATIONS []\n",
  ]) {
    assert.throws(() => parseCounters(stderr));
  }
  for (const value of [-1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() =>
      parseCounters(
        "OSEO_OBSERVATIONS " +
          JSON.stringify({
            ...counters,
            allocations: value,
          }),
      ),
    );
  }
  assert.deepEqual(
    observeKernel({ command: "observed", args: [] }, kernel, 100, () => ({
      ...result(),
      stderr: marker,
    })),
    counters,
  );
});

test("both native hosts plan all engines and separate startup binaries", () => {
  assert.equal(perfHost("linux", "x64"), "linux-x86_64-gnu");
  assert.equal(perfHost("darwin", "arm64"), "macos-aarch64");
  assert.throws(() => perfHost("linux", "arm64"), /Unsupported/u);
  for (const target of ["linux-x86_64-gnu", "macos-aarch64"] as const) {
    const forms = variants(kernel, "/path with spaces", target, "/node");
    assert.equal(forms.length, 9);
    assert.equal(forms.filter((form) => form.blocked != null).length, 2);
    assert.deepEqual(
      forms.find((form) => form.id === "node-jitless")!.run.args,
      ["--jitless", "/path with spaces/sieve.js"],
    );
    const sea = forms.find((form) => form.id === "node-sea")!;
    assert.equal(
      sea.builds.some((build) => build.command === "codesign"),
      target === "macos-aarch64",
    );
    assert.ok(sea.builds.find((build) => build.command === "postject"));
    assert.throws(
      () => sampleKernel(kernel, forms, defaultMethod, () => result()),
      /fully built/u,
    );
  }
});

test("rotating samples retain repetitions and discard warmups", () => {
  const forms = variants(kernel, "/unused", host.target, "/node").filter(
    (form) => form.blocked == null,
  );
  const calls: string[] = [];
  const samples = sampleKernel(kernel, forms, defaultMethod, (command) => {
    calls.push(command.command);
    return result();
  });
  assert.equal(calls.length, 18 * forms.length);
  assert.equal(samples.length, 15 * forms.length);
  assert.deepEqual(orderForRound(["a", "b", "c"], 1), ["b", "c", "a"]);
  assert.throws(() => orderForRound([], 0));
  assert.throws(() =>
    sampleKernel(kernel, forms, { ...defaultMethod, repetitions: 14 }, () =>
      result(),
    ),
  );
  let count = 0;
  assert.throws(() =>
    sampleKernel(kernel, forms, defaultMethod, () => {
      count += 1;
      return { ...result(), status: 1 };
    }),
  );
  assert.equal(count, 1);
  assert.deepEqual(
    sampleStartup({ command: "startup", args: [] }, defaultMethod, () =>
      result("startup", 1),
    ),
    Array.from({ length: 15 }, () => 10),
  );
});

test("RSS is normalized to bytes and collected outside timing", () => {
  assert.equal(parseRss(host.target, "PERF_RSS_KIB 123\n"), 123 * 1024);
  assert.equal(
    parseRss("macos-aarch64", "  123 maximum resident set size\n"),
    123,
  );
  assert.throws(() => parseRss(host.target, "PERF_RSS_KIB 0\n"));
  assert.throws(() =>
    parseRss(host.target, "PERF_RSS_KIB 1\nPERF_RSS_KIB 2\n"),
  );
  assert.deepEqual(
    rssCommand("macos-aarch64", { command: "/app", args: ["x"] }),
    { command: "/usr/bin/time", args: ["-l", "/app", "x"] },
  );
  assert.deepEqual(
    sampleRss(
      { command: "app", args: [] },
      host.target,
      kernel,
      defaultMethod,
      () => ({ ...result(), stderr: "PERF_RSS_KIB 10\n" }),
    ),
    Array.from({ length: 15 }, () => 10240),
  );
});

test("distribution keeps dispersion and rejects invalid samples", () => {
  assert.deepEqual(distribution([1, 2, 3]), {
    count: 3,
    min: 1,
    max: 3,
    median: 2,
    p95: 3,
    mean: 2,
    standardDeviation: Math.sqrt(2 / 3),
    mad: 1,
  });
  assert.equal(distribution([1, 2, 3, 100]).median, 2.5);
  for (const values of [[], [NaN], [Infinity], [-1]]) {
    assert.throws(() => distribution(values));
  }
});

test("preparation writes blocked recipes without starting engines", () => {
  const directory = scratch();
  try {
    const destination = join(directory, "prepared");
    prepare(destination, host, process.execPath);
    const text = readFileSync(join(destination, "plan.json"), "utf8");
    assert.match(text, /"phase": "prepared"/u);
    assert.match(text, /"observeSpecialization": true/u);
    assert.match(text, /Requires integrated optimized/u);
    assert.match(
      readFileSync(join(destination, "startup.js"), "utf8"),
      /PERF_OK startup 1/u,
    );
    assert.throws(
      () => prepare(destination, host, process.execPath),
      /exists/u,
    );
    assert.throws(() => renderKernel(kernel, "", 0));
    assert.throws(() =>
      execute({ command: join(directory, "missing"), args: [] }),
    );
    assert.equal(artifact(join(destination, "sieve.js")).sha256.length, 64);
    assert.throws(() => artifact(destination), /regular artifact/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function evidence(): Evidence {
  const file: Artifact = { path: "/fake", bytes: 1, sha256: "a".repeat(64) };
  return {
    schema: 1,
    phase: "measured",
    runId: "synthetic-test",
    measuredAt: "2026-11-08T00:00:00.000Z",
    host,
    method: defaultMethod,
    buildConfiguration: "optimized",
    observeSpecialization: false,
    sanitizers: [],
    conditions: {
      power: "AC power, performance mode (synthetic)",
      backgroundLoad: "idle (synthetic)",
      cachePolicy: "warm-process-launch",
      notes: "synthetic, no measurement",
    },
    kernels: kernels.map((item) => ({
      id: item.id,
      source: { ...file },
      variants: variants(item, "/fake", host.target, "/node").map((form) => ({
        id: form.id,
        executable: form.executable == null ? null : { ...file },
        generatedC: form.generatedC == null ? null : [{ ...file }],
        counterBuild:
          form.specialization == null
            ? null
            : {
                executable: { ...file, sha256: "b".repeat(64) },
                observeSpecialization: true,
                counters: { ...counters },
              },
        startupMs: Array.from({ length: 15 }, () => 1),
        peakRssBytes: Array.from({ length: 15 }, () => 1024),
      })),
      samples: variants(item, "/fake", host.target, "/node").flatMap((form) =>
        Array.from({ length: 15 }, (_, round) => ({
          round,
          variant: form.id,
          runtimeMs: 1,
          processMs: 2,
        })),
      ),
    })),
  };
}

test("publication rejects incomplete evidence and a lone native host", () => {
  const valid = evidence();
  validateEvidence(valid);
  assert.throws(() => requireBothHosts([valid]), /Linux AMD64/u);
  requireBothHosts([valid, { ...valid, host: macHost }]);
  assert.throws(() =>
    validateEvidence({ ...valid, sanitizers: ["undefined"] }),
  );
  assert.throws(() =>
    validateEvidence({ ...valid, host: { ...host, dirty: true } }),
  );
  const first = valid.kernels[0]!;
  const replaceFirst = (changed: KernelEvidence): readonly KernelEvidence[] =>
    valid.kernels.map((item) => (item.id === first.id ? changed : item));
  assert.throws(
    () =>
      validateEvidence({
        ...valid,
        kernels: replaceFirst({ ...first, samples: first.samples.slice(1) }),
      }),
    /Incomplete runtime samples/u,
  );
  assert.throws(
    () =>
      validateEvidence({
        ...valid,
        kernels: replaceFirst({ ...first, variants: first.variants.slice(1) }),
      }),
    /Incomplete variant matrix/u,
  );
  const native = first.variants[0]!;
  const sameExecutable = {
    ...native,
    counterBuild: {
      ...native.counterBuild!,
      executable: native.executable!,
    },
  };
  assert.throws(
    () =>
      validateEvidence({
        ...valid,
        kernels: replaceFirst({
          ...first,
          variants: first.variants.map((item) =>
            item.id === native.id ? sameExecutable : item,
          ),
        }),
      }),
    /Separate observed executable/u,
  );
});

function damagedEvidence(change: (record: Evidence) => void): Evidence {
  const record = structuredClone(evidence());
  change(record);
  return record;
}

function damageField<Value>(
  target:
    | Artifact
    | CounterEvidence
    | Counters
    | Evidence
    | HostMetadata
    | Evidence["conditions"]
    | Evidence["method"],
  key: string,
  value: Value,
): void {
  if (value === undefined) {
    Reflect.deleteProperty(target, key);
  } else {
    Object.defineProperty(target, key, { value, configurable: true });
  }
}

test("publication validates persisted observed counters", () => {
  for (const flag of [false, undefined, null, 1, "true"]) {
    const record = damagedEvidence((item) => {
      damageField(
        item.kernels[0]!.variants[0]!.counterBuild!,
        "observeSpecialization",
        flag,
      );
    });
    assert.throws(() => validateEvidence(record), {
      message: "Counter evidence requires an observed build.",
    });
  }
  for (const value of [undefined, null, false, []]) {
    const record = damagedEvidence((item) => {
      damageField(
        item.kernels[0]!.variants[0]!.counterBuild!,
        "counters",
        value,
      );
    });
    assert.throws(() => validateEvidence(record), {
      message: "Performance counters must be a object.",
    });
  }
  const empty = damagedEvidence((item) => {
    damageField(item.kernels[0]!.variants[0]!.counterBuild!, "counters", {});
  });
  assert.throws(() => validateEvidence(empty), {
    message: "Invalid counter: guardHits",
  });
  for (const key of Object.keys(counters)) {
    for (const value of [
      undefined,
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "1",
      null,
      false,
    ]) {
      const record = damagedEvidence((item) => {
        damageField(
          item.kernels[0]!.variants[0]!.counterBuild!.counters,
          key,
          value,
        );
      });
      assert.throws(() => validateEvidence(record), {
        message: `Invalid counter: ${key}`,
      });
    }
  }
});

test("publication validates all artifact roles without local files", () => {
  const roles = [
    "source",
    "executable",
    "generatedC",
    "counter-build",
  ] as const;
  for (const role of roles) {
    for (const [key, values] of [
      [
        "bytes",
        [
          undefined,
          -1,
          0,
          0.5,
          NaN,
          Infinity,
          -Infinity,
          Number.MAX_SAFE_INTEGER + 1,
          "1",
          null,
        ],
      ],
      [
        "sha256",
        [
          undefined,
          "",
          "different",
          "a".repeat(63),
          "a".repeat(65),
          "g".repeat(64),
          "a".repeat(64) + "\n",
          null,
          1,
        ],
      ],
      ["path", [undefined, "", "  ", null, 1]],
    ] as const) {
      for (const value of values) {
        const record = damagedEvidence((item) => {
          const first = item.kernels[0]!;
          const native = first.variants[0]!;
          const target =
            role === "source"
              ? first.source
              : role === "executable"
                ? native.executable!
                : role === "generatedC"
                  ? native.generatedC![0]!
                  : native.counterBuild!.executable;
          damageField(target, key, value);
        });
        assert.throws(() => validateEvidence(record), {
          message: `Invalid artifact: ${role}`,
        });
      }
    }
  }
  const remote = damagedEvidence((item) => {
    damageField(
      item.kernels[0]!.source,
      "path",
      "https://artifacts.example/source.js",
    );
    damageField(item.kernels[0]!.source, "bytes", 1);
    damageField(item.kernels[0]!.source, "sha256", "A".repeat(64));
  });
  validateEvidence(remote);
});

test("publication compares canonical observed and timed digests", () => {
  const record = damagedEvidence((item) => {
    damageField(
      item.kernels[0]!.variants[0]!.counterBuild!.executable,
      "sha256",
      "A".repeat(64),
    );
  });
  assert.throws(() => validateEvidence(record), {
    message: "Separate observed executable and generated C required.",
  });
  assert.throws(
    () => requireBothHosts([record, { ...evidence(), host: macHost }]),
    { message: "Separate observed executable and generated C required." },
  );
});

test("publication requires the existing schema and explicit timed flag", () => {
  for (const [key, values] of [
    ["schema", [undefined, 0, 2, "1"]],
    ["observeSpecialization", [undefined, null, 0, "", true]],
    ["sanitizers", ["", { length: 0 }, undefined, null]],
  ] as const) {
    for (const value of values) {
      const record = damagedEvidence((item) => damageField(item, key, value));
      assert.throws(() => validateEvidence(record), {
        message: "Evidence must use uninstrumented optimized builds.",
      });
    }
  }
});

test("publication requires complete host provenance", () => {
  for (const value of [undefined, null, [], false, "host"]) {
    assert.throws(
      () =>
        validateEvidence(
          damagedEvidence((item) => {
            damageField(item, "host", value);
          }),
        ),
      { message: "Invalid host metadata." },
    );
  }
  for (const value of [undefined, null, true, 0, "false"]) {
    assert.throws(
      () =>
        validateEvidence(
          damagedEvidence((item) => {
            damageField(item.host, "dirty", value);
          }),
        ),
      { message: "Measurements require a clean tree." },
    );
  }
  for (const key of [
    "os",
    "architecture",
    "cpu",
    "node",
    "deno",
    "bun",
    "zig",
    "postject",
  ] as const) {
    for (const value of [
      undefined,
      null,
      1,
      false,
      [],
      {},
      "",
      "  ",
      "unknown",
    ]) {
      assert.throws(
        () =>
          validateEvidence(
            damagedEvidence((item) => {
              damageField(item.host, key, value);
            }),
          ),
        { message: `Invalid host provenance: ${key}` },
      );
    }
  }
  for (const key of ["logicalCpus", "memoryBytes"] as const) {
    for (const value of [
      undefined,
      null,
      "1",
      false,
      0,
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.throws(
        () =>
          validateEvidence(
            damagedEvidence((item) => {
              damageField(item.host, key, value);
            }),
          ),
        { message: `Invalid host provenance: ${key}` },
      );
    }
  }
  for (const key of ["pinsSha256", "lockSha256"] as const) {
    for (const value of [
      undefined,
      null,
      1,
      "",
      "unknown",
      "a".repeat(63),
      "a".repeat(65),
      "g".repeat(64),
      "a".repeat(64) + "\n",
    ]) {
      assert.throws(
        () =>
          validateEvidence(
            damagedEvidence((item) => {
              damageField(item.host, key, value);
            }),
          ),
        { message: `Invalid host provenance: ${key}` },
      );
    }
  }
});

test("publication requires matching native host descriptions", () => {
  for (const [key, values] of [
    ["target", [undefined, null, 1, "linux-aarch64-musl", "macos-aarch64"]],
    ["os", ["darwin 25.0.0"]],
    ["architecture", ["arm64"]],
  ] as const) {
    for (const value of values) {
      assert.throws(
        () =>
          validateEvidence(
            damagedEvidence((item) => {
              damageField(item.host, key, value);
            }),
          ),
        { message: "Host target, OS and architecture must match." },
      );
    }
  }
  for (const key of ["logicalCpus", "memoryBytes"] as const) {
    for (const value of [1, Number.MAX_SAFE_INTEGER]) {
      validateEvidence(
        damagedEvidence((item) => {
          damageField(item.host, key, value);
        }),
      );
    }
  }
  requireBothHosts([evidence(), { ...evidence(), host: macHost }]);
});

test("publication rejects missing or invalid revision identities", () => {
  for (const value of [
    undefined,
    null,
    1,
    "",
    "unknown",
    "HEAD",
    "a".repeat(39),
    "a".repeat(41),
    "g".repeat(40),
    "0".repeat(40),
    "0".repeat(64),
  ]) {
    assert.throws(
      () =>
        validateEvidence(
          damagedEvidence((item) => {
            damageField(item.host, "commit", value);
          }),
        ),
      { message: "Invalid host provenance: commit" },
    );
  }
  const linux = damagedEvidence((item) => {
    damageField(item.host, "commit", undefined);
  });
  const mac = { ...evidence(), host: structuredClone(macHost) };
  damageField(mac.host, "commit", undefined);
  assert.throws(() => requireBothHosts([linux, mac]), {
    message: "Invalid host provenance: commit",
  });
  assert.throws(
    () =>
      requireBothHosts([
        evidence(),
        { ...evidence(), host: { ...macHost, commit: "d".repeat(40) } },
      ]),
    { message: "Hosts must measure the same revision and policy." },
  );
  validateEvidence(
    damagedEvidence((item) => {
      damageField(item.host, "commit", "d".repeat(64));
    }),
  );
});

test("publication compares canonical known revisions", () => {
  requireBothHosts([
    evidence(),
    { ...evidence(), host: { ...macHost, commit: "A".repeat(40) } },
  ]);
});

test("publication requires run identity and measurement conditions", () => {
  for (const value of [undefined, null, 1, [], false]) {
    assert.throws(
      () =>
        validateEvidence(
          damagedEvidence((item) => {
            damageField(item, "conditions", value);
          }),
        ),
      { message: "Invalid measurement conditions." },
    );
  }
  for (const [key, values] of [
    ["runId", [undefined, null, 1, "", "  ", "unknown"]],
    [
      "measuredAt",
      [undefined, null, 1, "", "test", "2026-02-30T00:00:00.000Z"],
    ],
  ] as const) {
    for (const value of values) {
      assert.throws(
        () =>
          validateEvidence(
            damagedEvidence((item) => {
              damageField(item, key, value);
            }),
          ),
        { message: `Invalid measurement provenance: ${key}` },
      );
    }
  }
  for (const [key, values] of [
    ["power", [undefined, null, 1, [], "", "  ", "unknown"]],
    ["backgroundLoad", [undefined, null, 1, [], "", "  ", "unknown"]],
    ["cachePolicy", [undefined, null, 1, "", "cold"]],
    ["notes", [undefined, null, 1, [], {}]],
  ] as const) {
    for (const value of values) {
      assert.throws(
        () =>
          validateEvidence(
            damagedEvidence((item) => {
              damageField(item.conditions, key, value);
            }),
          ),
        { message: `Invalid measurement condition: ${key}` },
      );
    }
  }
  validateEvidence(
    damagedEvidence((item) => {
      damageField(item.conditions, "notes", "");
      damageField(item.host, "pinsSha256", "B".repeat(64));
      damageField(item.host, "lockSha256", "C".repeat(64));
    }),
  );
});

test("persisted sampling policies require rotating order", () => {
  for (const value of [undefined, null, false, 1, "", "fixed", []]) {
    const record = damagedEvidence((item) => {
      damageField(item.method, "order", value);
    });
    for (const validate of [
      () => validateMethod(record.method),
      () => validateEvidence(record),
    ]) {
      assert.throws(validate, {
        message: "Rotating engine order is required.",
      });
    }
  }
});

test("publication compares policy values independently of key order", () => {
  const mac: Evidence = {
    ...evidence(),
    host: macHost,
    method: {
      order: defaultMethod.order,
      iterations: defaultMethod.iterations,
      repetitions: defaultMethod.repetitions,
      warmups: defaultMethod.warmups,
    },
  };
  requireBothHosts([evidence(), mac]);
  assert.throws(
    () =>
      requireBothHosts([
        evidence(),
        { ...mac, method: { ...mac.method, warmups: mac.method.warmups + 1 } },
      ]),
    { message: "Hosts must measure the same revision and policy." },
  );
});
