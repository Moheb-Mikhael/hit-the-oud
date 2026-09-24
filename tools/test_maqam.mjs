import assert from "node:assert";
import {
  NECK_CM,
  MAQAMAT,
  TONICS,
  OCTAVE_COLORS,
  fullMapNotes,
  maqamNotes,
  octaveOf,
  octaveColor,
} from "../js/maqam.js";

const OPEN = [87.0, 110.0, 147.0, 196.0, 261.0, 350.0];

function labels(notes) {
  return notes.map((n) => n.label);
}

function checkBounds(notes, where) {
  for (const n of notes) {
    assert.ok(Number.isFinite(n.x), `${where}: non-finite x`);
    assert.ok(n.x >= -1e-9 && n.x <= NECK_CM + 1e-9, `${where}: x=${n.x} out of neck`);
    assert.ok(typeof n.label === "string" && n.label.length > 0, `${where}: bad label`);
    assert.ok(typeof n.kind === "string", `${where}: bad kind`);
  }
}

assert.strictEqual(Object.keys(MAQAMAT).length, 8, "maqam count");
assert.strictEqual(TONICS.length, 14, "tonic count");
for (const [name, steps] of Object.entries(MAQAMAT)) {
  assert.strictEqual(steps.length, 8, `${name}: degree count`);
  assert.strictEqual(steps[0], 0, `${name}: must start at tonic`);
  assert.strictEqual(steps[7], 24, `${name}: must end at octave`);
}
console.log("PASS  8 maqams x 8 degrees, 14 tonics registered");

const bayati = maqamNotes(146.83, "Bayati", 2);
assert.deepStrictEqual(labels(bayati), ["Re", "Mi½", "Fa½#", "Sol", "La"]);
checkBounds(bayati, "Bayati-on-Re");
console.log("PASS  Bayati on Re spells:", labels(bayati).join(" "));

const sikah = maqamNotes(160.0, "Sikah", 12);
assert.deepStrictEqual(labels(sikah), ["Mi½", "Fa", "Sol", "La", "Si½"]);
checkBounds(sikah, "Sikah-on-Mi½");
console.log("PASS  Sikah on Mi½ spells:", labels(sikah).join(" "));

const rast = maqamNotes(130.81, "Rast", 0);
assert.deepStrictEqual(labels(rast), ["Do", "Re", "Mi½", "Fa", "Sol"]);
checkBounds(rast, "Rast-on-Do");
console.log("PASS  Rast on Do spells:", labels(rast).join(" "));

const hijaz = maqamNotes(146.83, "Hijaz", 2);
assert.deepStrictEqual(labels(hijaz), ["Re", "Mib", "Fa#", "Sol", "La"]);
checkBounds(hijaz, "Hijaz-on-Re");
console.log("PASS  Hijaz on Re spells:", labels(hijaz).join(" "));

const nahawand = maqamNotes(196.0, "Nahawand", 0);
assert.ok(labels(nahawand).includes("Sib"), "Nahawand flat-7th present");
console.log("PASS  Nahawand on Do spells:", labels(nahawand).join(" "));

for (let c = 0; c < OPEN.length; c++) {
  const full = fullMapNotes(OPEN[c]);
  assert.ok(full.length >= 8, `course ${c}: too few map notes`);
  checkBounds(full, `full map course ${c}`);
  for (let i = 1; i < full.length; i++) {
    assert.ok(full[i].x > full[i - 1].x, `course ${c}: notes not sorted`);
  }
}
const course0Labels = labels(fullMapNotes(OPEN[0]));
for (const want of ["Sol", "La", "Sib", "Do", "Sol½", "La½", "Do½"]) {
  assert.ok(course0Labels.includes(want), `F course missing ${want}`);
}
console.log("PASS  full map: 6 courses in-bounds, F course has Sol La Sib Do + halves");

for (const maqam of Object.keys(MAQAMAT)) {
  for (let t = 0; t < TONICS.length; t++) {
    for (let c = 0; c < OPEN.length; c++) {
      const notes = maqamNotes(OPEN[c], maqam, t);
      checkBounds(notes, `${maqam} t${t} c${c}`);
      assert.ok(
        notes.every((n) => !n.tonic || n.label.length > 0),
        "tonic label present"
      );
    }
  }
}
console.log("PASS  exhaustive sweep: 8 maqams x 14 tonics x 6 courses all in-bounds");

assert.deepStrictEqual(maqamNotes(196, "Nope", 0), [], "unknown maqam -> []");
assert.deepStrictEqual(maqamNotes(196, "Rast", 99), [], "unknown tonic -> []");
console.log("PASS  invalid maqam/tonic safely returns no notes");

assert.strictEqual(octaveOf(87), 2, "F2 -> octave 2");
assert.strictEqual(octaveOf(110), 2, "A2 -> octave 2");
assert.strictEqual(octaveOf(246.94), 3, "B3 -> octave 3");
assert.strictEqual(octaveOf(261.63), 4, "C4 -> octave 4");
assert.strictEqual(octaveOf(350), 4, "F4 -> octave 4");
assert.strictEqual(octaveOf(440), 4, "A4 -> octave 4");
assert.strictEqual(octaveOf(523.25), 5, "C5 -> octave 5");
assert.strictEqual(octaveColor(40), OCTAVE_COLORS[2], "low clamp");
assert.strictEqual(octaveColor(3000), OCTAVE_COLORS[5], "high clamp");
assert.deepStrictEqual(
  Object.values(OCTAVE_COLORS),
  ["#E5484D", "#FF9E2C", "#FFE14D", "#4FC978"],
  "rainbow palette order"
);
console.log("PASS  octave numbering, boundaries, palette clamping");

for (let c = 0; c < OPEN.length; c++) {
  for (const n of fullMapNotes(OPEN[c])) {
    assert.ok(Number.isFinite(n.freq), "full map note freq");
    assert.ok([2, 3, 4, 5].includes(octaveOf(n.freq)), `octave in range, got ${octaveOf(n.freq)}`);
  }
}
const rastDo = maqamNotes(130.81, "Rast", 0);
assert.ok(rastDo[0].tonic, "first Rast note is tonic");
assert.strictEqual(octaveOf(rastDo[0].freq), 3, "Rast Do tonic in octave 3");
for (const maqam of Object.keys(MAQAMAT)) {
  for (let t = 0; t < TONICS.length; t++) {
    for (let c = 0; c < OPEN.length; c++) {
      for (const n of maqamNotes(OPEN[c], maqam, t)) {
        assert.ok(Number.isFinite(n.freq), "maqam note freq");
        assert.ok([2, 3, 4, 5].includes(octaveOf(n.freq)), "maqam octave in range");
        assert.ok(/^#[0-9A-F]{6}$/i.test(octaveColor(n.freq)), "valid octave color");
      }
    }
  }
}
console.log("PASS  every note carries a freq mapping to octaves 2-5 with a valid color");

console.log("\nALL MAQAM THEORY TESTS PASSED");
