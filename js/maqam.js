export const STRING_CM = 60;
export const NECK_CM = 20;

export const OCTAVE_COLORS = {
  2: "#E5484D",
  3: "#FF9E2C",
  4: "#FFE14D",
  5: "#4FC978",
};

export function octaveOf(freq) {
  return Math.floor((69 + 12 * Math.log2(freq / 440)) / 12 + 1e-4) - 1;
}

export function octaveColor(freq) {
  const octaves = Object.keys(OCTAVE_COLORS).map(Number);
  const lo = Math.min(...octaves);
  const hi = Math.max(...octaves);
  const clamped = Math.min(Math.max(octaveOf(freq), lo), hi);
  return OCTAVE_COLORS[clamped];
}

const LETTERS = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
const NATURAL_PCQ = { Do: 0, Re: 4, Mi: 8, Fa: 10, Sol: 14, La: 18, Si: 22 };

const SEMITONE_NAMES = [
  { letter: "Do", kind: "natural" },
  { letter: "Re", kind: "bemol" },
  { letter: "Re", kind: "natural" },
  { letter: "Mi", kind: "bemol" },
  { letter: "Mi", kind: "natural" },
  { letter: "Fa", kind: "natural" },
  { letter: "Sol", kind: "bemol" },
  { letter: "Sol", kind: "natural" },
  { letter: "La", kind: "bemol" },
  { letter: "La", kind: "natural" },
  { letter: "Si", kind: "bemol" },
  { letter: "Si", kind: "natural" },
];

const ACCIDENTAL_SUFFIX = { 0: "", "-2": "b", "-1": "½", 1: "½#", 2: "#" };
const ACCIDENTAL_KIND = {
  0: "natural",
  "-2": "bemol",
  "-1": "half-bemol",
  1: "half-diez",
  2: "diez",
};

export const MAQAMAT = {
  Rast: [0, 4, 7, 10, 14, 18, 21, 24],
  Bayati: [0, 3, 7, 10, 14, 17, 20, 24],
  Hijaz: [0, 2, 8, 10, 14, 16, 20, 24],
  Saba: [0, 3, 6, 8, 14, 16, 20, 24],
  Nahawand: [0, 4, 6, 10, 14, 16, 20, 24],
  Kurd: [0, 2, 6, 10, 14, 16, 20, 24],
  Ajam: [0, 4, 8, 10, 14, 18, 22, 24],
  Sikah: [0, 3, 7, 11, 14, 17, 21, 24],
};

export const TONICS = [
  { name: "Do", quarters: 0, letter: 0 },
  { name: "Reb", quarters: 2, letter: 1 },
  { name: "Re", quarters: 4, letter: 1 },
  { name: "Mib", quarters: 6, letter: 2 },
  { name: "Mi", quarters: 8, letter: 2 },
  { name: "Fa", quarters: 10, letter: 3 },
  { name: "Solb", quarters: 12, letter: 4 },
  { name: "Sol", quarters: 14, letter: 4 },
  { name: "Lab", quarters: 16, letter: 5 },
  { name: "La", quarters: 18, letter: 5 },
  { name: "Sib", quarters: 20, letter: 6 },
  { name: "Si", quarters: 22, letter: 6 },
  { name: "Mi½", quarters: 7, letter: 2 },
  { name: "Si½", quarters: 21, letter: 6 },
];

const TONIC_BASE_Q = 24 * Math.log2(130.813 / 440);

function pitchClassQuarters(qAbs) {
  return (((Math.round(qAbs) + 18) % 24) + 24) % 24;
}

function signedDiff(value, period) {
  let diff = value % period;
  if (diff > period / 2) diff -= period;
  if (diff <= -period / 2) diff += period;
  return diff;
}

function spellNote(letter, diff) {
  return {
    label: letter + (ACCIDENTAL_SUFFIX[String(diff)] ?? "?"),
    kind: ACCIDENTAL_KIND[String(diff)] ?? "natural",
  };
}

export function fullMapNotes(openFreq) {
  const baseQ = 24 * Math.log2(openFreq / 440);
  const notes = [];
  for (let k = 1; k <= 7; k++) {
    const f = openFreq * Math.pow(2, k / 12);
    const x = STRING_CM * (1 - openFreq / f);
    if (x < 0 || x > NECK_CM) continue;
    const pc = pitchClassQuarters(baseQ + 2 * k);
    const info = SEMITONE_NAMES[Math.round(pc / 2) % 12];
    notes.push({
      x,
      freq: f,
      label: info.letter + (info.kind === "bemol" ? "b" : ""),
      kind: info.kind,
      tonic: false,
    });
    if (info.kind === "natural") {
      const fh = openFreq * Math.pow(2, (2 * k - 1) / 24);
      const xh = STRING_CM * (1 - openFreq / fh);
      if (xh >= 0 && xh <= NECK_CM) {
        notes.push({ x: xh, freq: fh, label: info.letter + "½", kind: "half-bemol", tonic: false });
      }
    }
  }
  return notes.sort((a, b) => a.x - b.x);
}

export function maqamNotes(openFreq, maqamName, tonicIndex) {
  const steps = MAQAMAT[maqamName];
  const tonic = TONICS[tonicIndex];
  if (!steps || !tonic) return [];
  const found = [];
  for (let oct = -1; oct <= 1; oct++) {
    for (let d = 0; d < steps.length; d++) {
      const qAbs = TONIC_BASE_Q + tonic.quarters + oct * 24 + steps[d];
      const freq = 440 * Math.pow(2, qAbs / 24);
      if (freq < openFreq * 0.999 || freq > openFreq * 1.5 * 1.001) continue;
      const x = STRING_CM * (1 - openFreq / freq);
      if (x < 0 || x > NECK_CM) continue;
      const letter = LETTERS[(tonic.letter + d) % 7];
      const diff = signedDiff(
        pitchClassQuarters(qAbs) - NATURAL_PCQ[letter],
        24
      );
      const spelled = spellNote(letter, diff);
      found.push({
        x,
        freq,
        label: spelled.label,
        kind: spelled.kind,
        tonic: d % 7 === 0,
      });
    }
  }
  found.sort((a, b) => a.x - b.x);
  const deduped = [];
  for (const note of found) {
    if (!deduped.some((seen) => Math.abs(seen.x - note.x) < 0.02)) {
      deduped.push(note);
    }
  }
  return deduped;
}
