import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileIdentity as identify } from "../../perf-profile-capture.ts";
import type { FileIdentity as FilePin } from "../../perf-profile-capture.ts";
import type { KernelHost as HostIdentity } from "./collector.ts";

import { requireKernelDirectory as privateDirectory } from "./source.ts";
import type { KernelSource } from "./source.ts";

import {
  readKernelControl as readControl,
  readKernelOriginalJson as readOriginal,
  writeKernelControl as writeControl,
} from "./control.ts";

/** Root pins an existing interpreter and this new private producer. */
export interface LifetimeAllocation {
  readonly python: FilePin;
  readonly pythonVersion: string;
  readonly source: FilePin;
  readonly observer: KernelSource;
}

/** Kernel request binding; no demo deployment or public origin. */
export interface KernelLifetimeInput {
  readonly linuxLifetime: LifetimeAllocation;
  readonly output: string;
  readonly host: HostIdentity;
  readonly taskId: string;
  readonly runId: string;
  readonly manifestSha256: string;
  readonly channelResponseMs: number;
  readonly limits: { readonly timeoutMs: number };
  readonly collector: { readonly bounds: { readonly maxSamples: number } };
  readonly env: Readonly<Record<string, string>>;
}

interface Binding {
  readonly taskId: string;
  readonly runId: string;
  readonly manifestSha256: string;
  readonly host: HostIdentity;
  readonly phase: "kernel-control";
}

interface Config {
  readonly directory: string;
  readonly controlPid: number;
  readonly rootPid: number;
  readonly host: HostIdentity;
  readonly pythonVersion: string;
  readonly pythonPath: string;
  readonly pythonSha256: string;
  readonly sourceSha256: string;
  readonly binding: Binding;
  readonly responseMs: number;
  readonly timeoutMs: number;
  readonly maxSamples: number;
}

interface Arm {
  readonly challenge: { readonly nonce: string; readonly observerPid: number };
  readonly response: {
    readonly challenge: Arm["challenge"];
    readonly binding: Binding;
  };
  readonly config: Config;
  readonly hostObservation: {
    readonly boot: string;
    readonly uid: number;
    readonly hostname: string;
    readonly hardware: {
      readonly value: string | null;
      readonly error: {
        readonly errno: number;
        readonly message: string;
      } | null;
    };
  };
  readonly leaderStat: string;
  readonly handleGeneration: string;
  readonly pidfdNumber: number;
  readonly events: readonly unknown[];
}

/** One causal post-sample acknowledgement; it supplies no missing birth. */
export interface LifetimeProof {
  readonly sample: FilePin;
  readonly probe: FilePin;
  readonly sampleSequence: number;
  readonly rootArmedNs: string;
  readonly requestedNs: string;
  readonly receivedNs: string;
  readonly leaderPid: number;
  readonly leaderStat: string;
  readonly arm: FilePin;
  readonly transcript: FilePin;
  readonly handleGeneration: string;
}

export { kernelSessionStat as sessionStat } from "./ownership.ts";
import { kernelSessionStat as sessionStat } from "./ownership.ts";

/** Bounded newline protocol; no retry, queue, or timeout extension. */
export class KernelLifetimeFrames {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #ms: number;
  #buffer = Buffer.alloc(0);
  #lastRaw = "";
  #failure: Error | null = null;
  #waiter: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  } | null = null;
  constructor(input: Readable, output: Writable, ms: number) {
    this.#input = input;
    this.#output = output;
    this.#ms = ms;
    input.on("data", (bytes: Buffer) => {
      this.#buffer = Buffer.concat([this.#buffer, bytes]);
      if (this.#buffer.length > 65_536)
        this.#fail(new Error("Oversize observer frame"));
      this.#drain();
    });
    input.on("error", (error) => this.#fail(error));
    input.on("end", () => this.#fail(new Error("Observer EOF")));
    output.on("error", (error) => this.#fail(error));
  }
  #fail(error: Error): void {
    this.#failure ??= error;
    this.#waiter?.reject(error);
    this.#waiter = null;
    this.#buffer = Buffer.alloc(0);
    this.#input.destroy();
    this.#output.destroy();
  }
  #drain(): void {
    if (!this.#waiter || this.#failure) return;
    const end = this.#buffer.indexOf(10);
    if (end < 0) return;
    const waiter = this.#waiter;
    this.#waiter = null;
    try {
      this.#lastRaw = this.#buffer.subarray(0, end + 1).toString("utf8");
      const frame = this.#buffer.subarray(0, end).toString("utf8");
      this.#buffer = this.#buffer.subarray(end + 1);
      waiter.resolve(frame);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.#fail(failure);
      waiter.reject(failure);
    }
  }
  get lastRaw(): string {
    return this.#lastRaw;
  }
  send<Value>(value: Value): void {
    if (this.#failure) throw this.#failure;
    const bytes = JSON.stringify(value) + "\n";
    assert.ok(Buffer.byteLength(bytes) <= 65_536);
    this.#output.write(bytes);
  }
  async read<Value>(): Promise<Value> {
    if (this.#failure) throw this.#failure;
    assert.equal(this.#waiter, null);
    const raw = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const failure = new Error("Observer response timeout");
        this.#fail(failure);
      }, this.#ms);
      this.#waiter = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.#drain();
    });
    // SAFETY: JSON decoding is followed by exact arm/nonce/request replay.
    return JSON.parse(raw) as Value;
  }
  destroy(error: Error = new Error("Observer channel closed")): void {
    this.#fail(error);
    this.#input.destroy();
    this.#output.destroy();
  }
}

export function kernelLifetimeConfig(
  input: KernelLifetimeInput,
  controlPid: number,
  rootPid: number,
): Config {
  assert.equal(input.host.target, "linux-x86_64-gnu");
  const allocation = input.linuxLifetime;
  assert.ok(allocation, "Linux lifetime interpreter/source unassigned");
  for (const pin of [allocation.python, allocation.source]) {
    assert.deepEqual(identify(pin.path), pin);
    assert.equal(realpathSync(pin.path), pin.path);
    assert.equal(pin.mode & 0o022, 0);
  }
  assert.equal(
    allocation.source.path,
    join(allocation.observer.root, "demo-linux-lifetime.py"),
  );
  assert.equal(
    allocation.observer.commit,
    "e391e1d9a4e3ae8733076742440ea37f9705feb4",
  );
  assert.deepEqual(
    allocation.observer.files.find(
      (pin) => pin.path === allocation.source.path,
    ),
    allocation.source,
  );
  assert.equal(
    allocation.source.sha256,
    "b6ae72f71a8b80a3aba440224a184b6f950fc5daed635873c89b5c3e78c5c77f",
  );
  assert.ok(allocation.pythonVersion.length > 0);
  assert.ok(input.taskId.length > 0 && input.runId.length > 0);
  assert.match(input.manifestSha256, /^[a-f0-9]{64}$/u);
  for (const limit of [
    input.channelResponseMs,
    input.limits.timeoutMs,
    input.collector.bounds.maxSamples,
  ])
    assert.ok(Number.isSafeInteger(limit) && limit > 0);
  return {
    directory: join(input.output, "lifetime"),
    controlPid,
    rootPid,
    host: input.host,
    pythonVersion: allocation.pythonVersion,
    pythonPath: allocation.python.path,
    pythonSha256: allocation.python.sha256,
    sourceSha256: allocation.source.sha256,
    binding: {
      taskId: input.taskId,
      runId: input.runId,
      manifestSha256: input.manifestSha256,
      host: input.host,
      phase: "kernel-control",
    },
    responseMs: input.channelResponseMs,
    timeoutMs: input.limits.timeoutMs,
    maxSamples: input.collector.bounds.maxSamples,
  };
}

export function requireKernelLifetimeArm(
  arm: Arm,
  config: Config,
  observerPid: number,
): void {
  assert.deepEqual(arm.config, config);
  assert.equal(arm.challenge.observerPid, observerPid);
  assert.match(arm.challenge.nonce, /^[a-f0-9]{64}$/u);
  assert.deepEqual(arm.response, {
    challenge: arm.challenge,
    binding: config.binding,
  });
  assert.match(arm.handleGeneration, /^[a-f0-9]{64}$/u);
  assert.deepEqual(arm.events, []);
  assert.ok(Number.isInteger(arm.pidfdNumber) && arm.pidfdNumber >= 0);
  assert.equal(
    arm.hostObservation.boot.toLowerCase(),
    config.host.boot.toLowerCase(),
  );
  assert.equal(arm.hostObservation.uid, config.host.uid);
  assert.ok(arm.hostObservation.hostname);
  if (arm.hostObservation.hardware.value != null) {
    assert.equal(
      arm.hostObservation.hardware.value.toLowerCase(),
      config.host.hardware.toLowerCase(),
    );
    assert.equal(arm.hostObservation.hardware.error, null);
  } else {
    assert.ok(arm.hostObservation.hardware.error?.message);
    assert.ok(Number.isInteger(arm.hostObservation.hardware.error.errno));
  }
  const stat = sessionStat(arm.leaderStat);
  assert.equal(stat.pid, config.controlPid);
  assert.equal(stat.ppid, config.rootPid);
  assert.equal(stat.group, stat.pid);
  assert.equal(stat.sid, stat.pid);
}

/** Spawn directly before the control child's first git/ps subprocess. */
export async function startChildLifetime(allocation: {
  readonly deployment: KernelLifetimeInput;
  readonly parentPid: number;
}): Promise<{
  readonly done: Promise<void>;
  readonly stop: () => void;
}> {
  const input = allocation.deployment;
  const config = kernelLifetimeConfig(input, process.pid, allocation.parentPid);
  mkdirSync(config.directory, { mode: 0o700 });
  privateDirectory(config.directory);
  const stderr = openSync(join(config.directory, "stderr.bin"), "wx", 0o600);
  const child = spawn(
    config.pythonPath,
    ["-I", "-B", input.linuxLifetime!.source.path, JSON.stringify(config)],
    {
      stdio: ["pipe", "pipe", stderr],
      env: input.env,
      cwd: "/",
    },
  );
  closeSync(stderr);
  const done = new Promise<void>((resolve, reject) => {
    let childFailure: Error | null = null;
    child.once("error", (error) => {
      childFailure = error;
    });
    child.once("close", (code, signal) => {
      const observed = { pid: child.pid ?? null, code, signal };
      try {
        writeControl(join(config.directory, "reaped.json"), observed);
      } catch (retention) {
        reject(
          new AggregateError(
            [
              ...(childFailure ? [childFailure] : []),
              new Error(
                `Observed lifetime helper reap: ${JSON.stringify(observed)}`,
              ),
              retention,
            ],
            "Observer reap retention failed; observed terminal preserved",
          ),
        );
        return;
      }
      try {
        if (childFailure) throw childFailure;
        assert.equal(code, 0);
        assert.equal(signal, null);
        const terminal = readControl<{ status: string }>(
          join(config.directory, "terminal.json"),
        );
        assert.equal(terminal.status, "closed");
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  // The caller's finally awaits this rejection.
  void done.catch(() => undefined);
  const stop = () => {
    // EOF wakes the helper without interrupting its finally publication.
    child.stdin?.destroy();
  };
  try {
    assert.ok(child.stdout && child.stdin, "Observer stdio unavailable");
    const frames = new KernelLifetimeFrames(
      child.stdout,
      child.stdin,
      input.channelResponseMs,
    );
    assert.ok(child.pid);
    writeControl(join(config.directory, "spawn.json"), {
      pid: child.pid,
      controlPid: process.pid,
      config,
      source: input.linuxLifetime!.source,
      python: input.linuxLifetime!.python,
    });
    const challenge = await frames.read<Arm["challenge"]>();
    assert.equal(challenge.observerPid, child.pid);
    assert.match(challenge.nonce, /^[a-f0-9]{64}$/u);
    const challengeRaw = frames.lastRaw;
    const response = { challenge, binding: config.binding };
    frames.send(response);
    const arm = await frames.read<Arm>();
    requireKernelLifetimeArm(arm, config, child.pid);
    assert.deepEqual(arm.challenge, challenge);
    writeControl(join(config.directory, "arm.json"), arm);
    writeControl(join(config.directory, "pipe.json"), {
      challengeRaw,
      responseRaw: JSON.stringify(response) + "\n",
      armRaw: frames.lastRaw,
      spawn: identify(join(config.directory, "spawn.json")),
      arm: identify(join(config.directory, "arm.json")),
      endpointContract: "only original Node and direct helper; no extra stdio",
    });
    return { done, stop };
  } catch (failure) {
    stop();
    try {
      await done;
    } catch (cleanup) {
      throw new AggregateError(
        [failure, cleanup],
        "Observer bootstrap failed",
        { cause: cleanup },
      );
    }
    throw failure;
  }
}

/** Metadata for one observed socket path; a nonce is no inode identity. */
export interface LifetimeSocketIdentity {
  readonly device: string;
  readonly inode: string;
  readonly uid: number;
  readonly gid: number;
  readonly mode: number;
}

/** Require exact socket metadata rather than only matching owner and mode. */
export function requireLifetimeSocketIdentity(
  original: LifetimeSocketIdentity,
  throughProc: LifetimeSocketIdentity,
): void {
  assert.deepEqual(throughProc, original, "Observer socket identity mismatch");
}

function socketMetadata(path: string): LifetimeSocketIdentity {
  const metadata = lstatSync(path, { bigint: true });
  assert.ok(metadata.isSocket(), "Observer endpoint is not a socket");
  return {
    device: metadata.dev.toString(),
    inode: metadata.ino.toString(),
    uid: Number(metadata.uid),
    gid: Number(metadata.gid),
    mode: Number(metadata.mode & 0o777n),
  };
}

/** Both filesystem paths refer to this same original socket. */
export interface KernelLifetimeEndpoint {
  readonly procPath: string;
  readonly identity: LifetimeSocketIdentity;
}

/** Resolve the actual helper cwd and compare both paths before connection. */
export function observeLifetimeSocket(
  directory: string,
  helperPid: number,
): KernelLifetimeEndpoint {
  assert.ok(Number.isSafeInteger(helperPid) && helperPid > 1);
  const cwd = `/proc/${helperPid}/cwd`;
  assert.equal(realpathSync(cwd), directory, "Observer cwd mismatch");
  const procPath = `${cwd}/observer.sock`;
  const observe = socketMetadata;
  const identity = observe(join(directory, "observer.sock"));
  requireLifetimeSocketIdentity(identity, observe(procPath));
  return { procPath, identity };
}

/** Root owns this connection; the control event loop never relays samples. */
export class RootLifetime {
  readonly #arm: Arm;
  readonly #pin: FilePin;
  readonly #frames: KernelLifetimeFrames;
  readonly #armed: string;
  #sequence = 0;
  #lastSample = -1;
  #busy = false;
  #closed = false;
  private constructor(arm: Arm, pin: FilePin, frames: KernelLifetimeFrames) {
    this.#arm = arm;
    this.#pin = pin;
    this.#frames = frames;
    this.#armed = process.hrtime.bigint().toString();
  }
  static async bind(
    input: KernelLifetimeInput,
    childPid: number,
  ): Promise<RootLifetime> {
    const config = kernelLifetimeConfig(input, childPid, process.pid);
    privateDirectory(config.directory);
    const spawnRecord = readControl<{
      pid: number;
      config: Config;
      source: FilePin;
      python: FilePin;
    }>(join(config.directory, "spawn.json"));
    assert.deepEqual(spawnRecord.config, config);
    assert.deepEqual(spawnRecord.source, input.linuxLifetime!.source);
    assert.deepEqual(spawnRecord.python, input.linuxLifetime!.python);
    const path = join(config.directory, "arm.json");
    const pin = identify(path);
    const arm = readControl<Arm>(path);
    requireKernelLifetimeArm(arm, config, spawnRecord.pid);
    const endpoint = observeLifetimeSocket(config.directory, spawnRecord.pid);
    assert.equal(endpoint.identity.uid, input.host.uid);
    assert.equal(endpoint.identity.mode, 0o600);
    const socket = connect(endpoint.procPath);
    const frames = new KernelLifetimeFrames(
      socket,
      socket,
      input.channelResponseMs,
    );
    try {
      const hello = {
        kind: "hello",
        nonce: randomBytes(32).toString("hex"),
        binding: config.binding,
      };
      frames.send(hello);
      const reply = await frames.read();
      assert.deepEqual(
        observeLifetimeSocket(config.directory, spawnRecord.pid),
        endpoint,
        "Observer socket changed during connection",
      );
      assert.deepEqual(reply, {
        hello,
        arm,
        peer: {
          pid: process.pid,
          uid: process.getuid!(),
          gid: process.getgid!(),
        },
      });
      const pipePath = join(config.directory, "pipe.json");
      const pipePin = identify(pipePath);
      const pipe = readControl<{
        challengeRaw: string;
        responseRaw: string;
        armRaw: string;
        arm: FilePin;
        spawn: FilePin;
      }>(pipePath);
      assert.deepEqual(JSON.parse(pipe.challengeRaw), arm.challenge);
      assert.deepEqual(JSON.parse(pipe.responseRaw), arm.response);
      assert.deepEqual(JSON.parse(pipe.armRaw), arm);
      assert.deepEqual(pipe.arm, pin);
      assert.deepEqual(identify(pipe.spawn.path), pipe.spawn);
      assert.deepEqual(identify(path), pin);
      const result = new RootLifetime(arm, pin, frames);
      writeControl(join(config.directory, "root-arm.json"), {
        hello,
        reply,
        wireReply: frames.lastRaw,
        wireHello: JSON.stringify(hello) + "\n",
        pipe: pipePin,
        endpoint,
        arm: pin,
        rootArmedNs: result.#armed,
        actualRootPid: process.pid,
        spawnedControlPid: childPid,
      });
      return result;
    } catch (error) {
      frames.destroy();
      throw error;
    }
  }
  async poll(
    sample: FilePin,
    probe: FilePin,
    sampleSequence: number,
  ): Promise<LifetimeProof> {
    assert.equal(this.#closed, false);
    assert.equal(this.#busy, false, "Concurrent observer request");
    assert.ok(sampleSequence > this.#lastSample);
    assert.deepEqual(identify(sample.path), sample);
    assert.deepEqual(identify(probe.path), probe);
    // SAFETY: pinned S sample; only its causal end clock is consumed here.
    const completed = JSON.parse(readFileSync(sample.path, "utf8")) as {
      end: { monotonicNs: string };
    };
    const requestedNs = process.hrtime.bigint().toString();
    assert.ok(BigInt(completed.end.monotonicNs) <= BigInt(requestedNs));
    this.#busy = true;
    try {
      const request = {
        kind: "poll",
        binding: this.#arm.config.binding,
        sequence: this.#sequence,
        sampleSequence,
        sample,
        probe,
        handleGeneration: this.#arm.handleGeneration,
      };
      this.#frames.send(request);
      const response = await this.#frames.read();
      const receivedNs = process.hrtime.bigint().toString();
      assert.deepEqual(response, { request, events: [] });
      assert.deepEqual(identify(sample.path), sample);
      assert.deepEqual(identify(probe.path), probe);
      assert.deepEqual(identify(this.#pin.path), this.#pin);
      const path = join(
        this.#arm.config.directory,
        `poll-${this.#sequence}.json`,
      );
      writeControl(path, {
        request,
        response,
        requestedNs,
        receivedNs,
        wireRequest: JSON.stringify(request) + "\n",
        wireResponse: this.#frames.lastRaw,
        arm: this.#pin,
      });
      this.#sequence++;
      this.#lastSample = sampleSequence;
      return {
        sample,
        probe,
        sampleSequence,
        rootArmedNs: this.#armed,
        requestedNs,
        receivedNs,
        leaderPid: this.#arm.config.controlPid,
        leaderStat: this.#arm.leaderStat,
        arm: this.#pin,
        transcript: identify(path),
        handleGeneration: this.#arm.handleGeneration,
      };
    } finally {
      this.#busy = false;
    }
  }
  async close(): Promise<void> {
    assert.equal(this.#busy, false);
    assert.equal(this.#closed, false);
    this.#closed = true;
    try {
      const request = {
        kind: "close",
        binding: this.#arm.config.binding,
        sequence: this.#sequence,
        handleGeneration: this.#arm.handleGeneration,
      };
      this.#frames.send(request);
      const response = await this.#frames.read();
      assert.deepEqual(response, { request, closed: true });
      writeControl(join(this.#arm.config.directory, "root-close.json"), {
        request,
        response,
        wireRequest: JSON.stringify(request) + "\n",
        wireResponse: this.#frames.lastRaw,
        arm: this.#pin,
      });
    } finally {
      this.#frames.destroy();
    }
  }
  destroy(): void {
    this.#frames.destroy();
    this.#closed = true;
  }
}

/** Recheck the original pipe, Root handshake and causal poll at consumption. */
export function replayKernelLifetimeProof(
  proof: LifetimeProof,
  sample: FilePin,
  probe: FilePin,
  sequence: number,
  host: HostIdentity,
  rootPid: number,
): ReturnType<typeof sessionStat> | null {
  assert.deepEqual(proof.sample, sample);
  assert.deepEqual(proof.probe, probe);
  assert.equal(proof.sampleSequence, sequence);
  for (const pin of [sample, probe, proof.arm, proof.transcript])
    assert.deepEqual(identify(pin.path), pin);
  const arm = readControl<Arm>(proof.arm.path);
  assert.deepEqual(arm.config.host, host);
  assert.equal(arm.config.controlPid, proof.leaderPid);
  assert.equal(arm.config.rootPid, rootPid);
  requireKernelLifetimeArm(arm, arm.config, arm.challenge.observerPid);
  assert.equal(arm.leaderStat, proof.leaderStat);
  assert.equal(arm.handleGeneration, proof.handleGeneration);
  const poll = readControl<{
    readonly arm: FilePin;
    readonly request: {
      readonly kind: string;
      readonly binding: Binding;
      readonly sequence: number;
      readonly sampleSequence: number;
      readonly sample: FilePin;
      readonly probe: FilePin;
      readonly handleGeneration: string;
    };
    readonly response: {
      readonly request: object;
      readonly events: readonly [];
    };
    readonly requestedNs: string;
    readonly receivedNs: string;
    readonly wireRequest: string;
    readonly wireResponse: string;
  }>(proof.transcript.path);
  assert.deepEqual(poll.arm, proof.arm);
  assert.equal(poll.request.kind, "poll");
  assert.deepEqual(poll.request.binding, arm.config.binding);
  assert.equal(poll.request.handleGeneration, proof.handleGeneration);
  assert.deepEqual(poll.request.sample, sample);
  assert.deepEqual(poll.request.probe, probe);
  assert.equal(poll.request.sampleSequence, sequence);
  assert.deepEqual(poll.response, { request: poll.request, events: [] });
  assert.deepEqual(JSON.parse(poll.wireRequest), poll.request);
  assert.deepEqual(JSON.parse(poll.wireResponse), poll.response);
  assert.equal(poll.requestedNs, proof.requestedNs);
  assert.equal(poll.receivedNs, proof.receivedNs);
  assert.ok(BigInt(proof.receivedNs) >= BigInt(proof.requestedNs));
  // S wrote the sample and probe whole; the records around them are frames.
  const completed = readOriginal<{
    readonly end: {
      readonly monotonicNs: string;
    };
  }>(sample.path);
  const observed = readOriginal<{
    readonly start: {
      readonly monotonicNs: string;
    };
    readonly end: {
      readonly monotonicNs: string;
    };
  }>(probe.path);
  assert.ok(
    BigInt(observed.end.monotonicNs) >= BigInt(observed.start.monotonicNs),
  );
  assert.ok(
    BigInt(completed.end.monotonicNs) >= BigInt(observed.end.monotonicNs),
  );
  assert.ok(BigInt(proof.requestedNs) >= BigInt(completed.end.monotonicNs));
  const root = readControl<{
    readonly arm: FilePin;
    readonly rootArmedNs: string;
    readonly actualRootPid: number;
    readonly spawnedControlPid: number;
    readonly hello: object;
    readonly reply: object;
    readonly wireHello: string;
    readonly wireReply: string;
    readonly pipe: FilePin;
  }>(join(arm.config.directory, "root-arm.json"));
  assert.deepEqual(root.arm, proof.arm);
  assert.equal(root.rootArmedNs, proof.rootArmedNs);
  assert.equal(root.actualRootPid, rootPid);
  assert.equal(root.spawnedControlPid, proof.leaderPid);
  assert.deepEqual(JSON.parse(root.wireHello), root.hello);
  assert.deepEqual(JSON.parse(root.wireReply), root.reply);
  assert.deepEqual(root.reply, {
    hello: root.hello,
    arm,
    peer: { pid: rootPid, uid: host.uid, gid: process.getgid!() },
  });
  assert.deepEqual(identify(root.pipe.path), root.pipe);
  const pipe = readControl<{
    readonly arm: FilePin;
    readonly spawn: FilePin;
    readonly challengeRaw: string;
    readonly responseRaw: string;
    readonly armRaw: string;
  }>(root.pipe.path);
  assert.deepEqual(pipe.arm, proof.arm);
  assert.deepEqual(JSON.parse(pipe.challengeRaw), arm.challenge);
  assert.deepEqual(JSON.parse(pipe.responseRaw), arm.response);
  assert.deepEqual(JSON.parse(pipe.armRaw), arm);
  assert.deepEqual(identify(pipe.spawn.path), pipe.spawn);
  const spawnRecord = readControl<{
    readonly pid: number;
    readonly config: Config;
  }>(pipe.spawn.path);
  assert.equal(spawnRecord.pid, arm.challenge.observerPid);
  assert.deepEqual(spawnRecord.config, arm.config);
  if (BigInt(proof.rootArmedNs) > BigInt(observed.start.monotonicNs))
    return null;
  return sessionStat(proof.leaderStat);
}

/** A close acknowledgement is followed by actual helper reap and FD cleanup. */
export function requireKernelLifetimeCleanup(
  directory: string,
): readonly FilePin[] {
  const arm = readControl<Arm>(join(directory, "arm.json"));
  const reaped = readControl<{
    readonly pid: number;
    readonly code: number;
    readonly signal: string | null;
  }>(join(directory, "reaped.json"));
  assert.equal(reaped.pid, arm.challenge.observerPid);
  assert.equal(reaped.code, 0);
  assert.equal(reaped.signal, null);
  const terminal = readControl<{
    readonly status: string;
    readonly requests: number;
    readonly cleanup: Readonly<Record<string, string>>;
    readonly cleanupErrors: readonly object[];
  }>(join(directory, "terminal.json"));
  assert.equal(terminal.status, "closed");
  assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of [
    "streamClose",
    "clientClose",
    "clientFdClosed",
    "serverClose",
    "socketUnlink",
    "pidfdClose",
  ])
    assert.equal(terminal.cleanup[key], "completed");
  const closed = readControl<{
    readonly request: { readonly sequence: number };
    readonly response: { readonly request: object; readonly closed: boolean };
  }>(join(directory, "root-close.json"));
  assert.deepEqual(closed.response, { request: closed.request, closed: true });
  assert.equal(terminal.requests, closed.request.sequence);
  return [
    "arm.json",
    "pipe.json",
    "spawn.json",
    "root-arm.json",
    "root-close.json",
    "terminal.json",
    "reaped.json",
    "stderr.bin",
  ].map((name) => identify(join(directory, name)));
}
