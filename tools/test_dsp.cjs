const assert = require("assert");

function main(factoryResult) {
  const Module =
    typeof factoryResult.then === "function" ? undefined : factoryResult;
  const ready = Module ? Promise.resolve(Module) : factoryResult;
  return ready.then(runAll);
}

function runAll(Module) {
  assert.ok(typeof Module.OudEngine === "function", "OudEngine missing from module");
  const SR = 48000;
  const engine = new Module.OudEngine(SR, 6);

function rms(buf, start, end) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / (end - start));
}

function estimateFrequency(buf, start, end) {
  let mean = 0;
  for (let i = start; i < end; i++) mean += buf[i];
  mean /= end - start;
  let bestLag = 1;
  let bestVal = -Infinity;
  const minLag = Math.max(2, Math.floor(SR / 520));
  const maxLag = Math.min((end - start) >> 1, Math.ceil(SR / 60));
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = start; i + lag < end; i++) {
      sum += (buf[i] - mean) * (buf[i + lag] - mean);
    }
    if (sum > bestVal) {
      bestVal = sum;
      bestLag = lag;
    }
  }
  return SR / bestLag;
}

function renderSeconds(seconds) {
  const total = Math.floor(seconds * SR);
  const out = new Float32Array(total);
  const BLOCK = 128;
  for (let offset = 0; offset < total; offset += BLOCK) {
    const frames = Math.min(BLOCK, total - offset);
    const view = engine.outputView(frames);
    engine.render(frames);
    out.set(view.subarray(0, frames), offset);
  }
  return out;
}

const EXPECTED_OPEN = [87, 110, 147, 196, 261, 350];
for (let i = 0; i < 6; i++) {
  const f = engine.stringFrequency(i);
  assert.ok(
    Math.abs(f - EXPECTED_OPEN[i]) < 0.05,
    `string ${i} tuning: got ${f}, want ${EXPECTED_OPEN[i]}`
  );
}
console.log("PASS  open string tuning:", EXPECTED_OPEN.join(", "), "Hz");

engine.pluckString(0, 1.0);
let buf = renderSeconds(0.6);
assert.ok(buf.every((x) => Number.isFinite(x)), "NaN/Inf in output");
console.log("PASS  no NaN/Inf after pluck");

buf = renderSeconds(0.5);
const est = estimateFrequency(buf, Math.floor(0.05 * SR), Math.floor(0.45 * SR));
assert.ok(Math.abs(est - 87) < 6, `string 0 pitch: estimated ${est.toFixed(1)} Hz, want ~87`);
console.log(`PASS  low-string pitch estimate: ${est.toFixed(1)} Hz (~87)`);

engine.pluckString(5, 1.0);
buf = renderSeconds(0.5);
const estHi = estimateFrequency(buf, Math.floor(0.02 * SR), Math.floor(0.45 * SR));
assert.ok(Math.abs(estHi - 350) < 18, `string 5 pitch: estimated ${estHi.toFixed(1)} Hz, want ~350`);
console.log(`PASS  high-string pitch estimate: ${estHi.toFixed(1)} Hz (~350)`);

engine.pluckString(2, 1.0);
const early = renderSeconds(4.0);
const rmsEarly = rms(early, 0, SR >> 1);
const rmsLate = rms(early, SR * 3, SR * 4);
assert.ok(rmsEarly > 0.001, "early RMS too quiet");
assert.ok(rmsLate < rmsEarly / 8, `decay insufficient: early=${rmsEarly.toFixed(4)}, late=${rmsLate.toFixed(4)}`);
assert.ok(rmsLate < 0.05, `not settled near silence: late RMS=${rmsLate.toFixed(4)}`);
console.log(`PASS  natural decay: RMS ${rmsEarly.toFixed(4)} -> ${rmsLate.toFixed(4)} over ~3s`);

engine.setStringFrequency(5, 520);
engine.pluckString(5, 1.0);
renderSeconds(0.25);
engine.setStringFrequency(5, 300);
renderSeconds(0.06);
const postGlide = renderSeconds(0.45);
const estGlide = estimateFrequency(
  postGlide,
  postGlide.length >> 2,
  postGlide.length - 1
);
assert.ok(Math.abs(estGlide - 300) < 12, `post-glissando pitch: ${estGlide.toFixed(1)} Hz, want ~300`);
console.log(`PASS  glissando retune 520->300 Hz renders at ${estGlide.toFixed(1)} Hz`);

let maxJump = 0;
for (let i = 1; i < postGlide.length; i++) {
  maxJump = Math.max(maxJump, Math.abs(postGlide[i] - postGlide[i - 1]));
}
assert.ok(maxJump < 0.35, `discontinuity during glide: jump=${maxJump.toFixed(3)}`);
console.log(`PASS  interpolated buffer resize is click-free (max sample jump ${maxJump.toFixed(3)})`);

for (let s = 0; s < 6; s++) engine.pluckString(s, 0.9);
const chord = renderSeconds(0.3);
const rmsChord = rms(chord, 0, chord.length - 1);
assert.ok(rmsChord > 0.005, `polyphonic mix too quiet: ${rmsChord}`);
console.log(`PASS  full 6-string polyphony renders (RMS ${rmsChord.toFixed(4)})`);

engine.pluckString(-1, 1);
engine.pluckString(99, 1);
engine.setStringFrequency(42, 999);
renderSeconds(0.1);
console.log("PASS  out-of-range indices are safely ignored");

console.log("\nALL DSP TESTS PASSED");
}

module.exports = { main };

if (require.main === module) {
  require(require("path").resolve(process.argv[2]))().then(main);
}
