import assert from "node:assert";

globalThis.sampleRate = 48000;

let registeredName = null;
let registeredClass = null;

globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage: (message) => {
        if (message && message.type === "ready") {
          globalThis.__oudReady = true;
        }
      },
    };
  }
};

globalThis.registerProcessor = (name, cls) => {
  registeredName = name;
  registeredClass = cls;
};

await import("../js/worklet.js");

assert.strictEqual(registeredName, "oud-processor", "processor name");
assert.ok(registeredClass, "processor class registered");

const processor = new registeredClass();
await new Promise((resolve) => setTimeout(resolve, 500));
assert.strictEqual(globalThis.__oudReady, true, "engine ready message received");

processor.port.onmessage({
  data: { type: "pluck", string: 3, frequency: 220, velocity: 0.9 },
});

const left = new Float32Array(128);
const right = new Float32Array(128);
const outputs = [[left, right]];
let keepAlive = true;
for (let block = 0; block < 10; block++) {
  keepAlive = processor.process([], outputs);
}
assert.ok(keepAlive, "process returns true to stay alive");

let energy = 0;
for (const sample of left) energy += sample * sample;
assert.ok(energy > 0.00005, `expected audible output, energy=${energy}`);
assert.strictEqual(
  Math.max(...right.map((s, i) => Math.abs(s - left[i]))),
  0,
  "stereo channels mirror mono bus"
);

processor.port.onmessage({
  data: { type: "glissando", string: 3, frequency: 330 },
});
for (let block = 0; block < 20; block++) processor.process([], outputs);

processor.port.onmessage({ data: { type: "garbage-event" } });
processor.port.onmessage({ data: null });
processor.port.onmessage({
  data: { type: "pluck", string: 999, frequency: 100 },
});
for (let block = 0; block < 5; block++) processor.process([], outputs);
let finite = true;
for (const sample of left) if (!Number.isFinite(sample)) finite = false;
assert.ok(finite, "output stays finite after malformed messages");

console.log("PASS  AudioWorklet pipeline end-to-end: register -> init -> pluck -> glissando -> render");
console.log(`      output energy over 10 blocks: ${energy.toFixed(5)}`);
console.log("ALL WORKLET TESTS PASSED");
