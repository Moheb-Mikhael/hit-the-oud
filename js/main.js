const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 300;
const STRING_COUNT = 6;
const OPEN_FREQUENCIES = [87.0, 110.0, 147.0, 196.0, 261.0, 350.0];
const FULL_STRING_LENGTH_CM = 60;
const MAX_PRESS_CM = 20;
const TWO_PI = Math.PI * 2;

const COLOR_BACKGROUND = "#18110E";
const COLOR_BASS = "#C48A5E";
const COLOR_TREBLE = "#F4EBD9";
const COLOR_ACTIVE = "#FFC107";

const canvas = document.getElementById("oud-canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startButton = document.getElementById("start-btn");
const overlayStatus = document.getElementById("overlay-status");

const ZONE_HEIGHT = CANVAS_HEIGHT / STRING_COUNT;

let audioContext = null;
let oudNode = null;
let simulationReady = false;

const pointers = new Map();
const phase = new Float32Array(STRING_COUNT);
let lastFrameTime = 0;

function zoneIndexFromY(y) {
  const index = Math.floor(y / ZONE_HEIGHT);
  return Math.min(Math.max(index, 0), STRING_COUNT - 1);
}

function eventToCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * CANVAS_WIDTH) / rect.width,
    y: ((event.clientY - rect.top) * CANVAS_HEIGHT) / rect.height,
  };
}

function xCentimeters(px) {
  const cm = ((CANVAS_WIDTH - px) / CANVAS_WIDTH) * MAX_PRESS_CM;
  return Math.min(Math.max(cm, 0), MAX_PRESS_CM);
}

function frequencyFor(stringIndex, xCm) {
  return (
    OPEN_FREQUENCIES[stringIndex] *
    (FULL_STRING_LENGTH_CM / (FULL_STRING_LENGTH_CM - xCm))
  );
}

function sendPluck(stringIndex, frequency) {
  if (!oudNode || !simulationReady) return;
  oudNode.port.postMessage({
    type: "pluck",
    string: stringIndex,
    frequency,
    velocity: 0.9,
  });
}

function sendGlissando(stringIndex, frequency) {
  if (!oudNode || !simulationReady) return;
  oudNode.port.postMessage({
    type: "glissando",
    string: stringIndex,
    frequency,
  });
}

canvas.addEventListener("pointerdown", (event) => {
  if (!simulationReady) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const point = eventToCanvasPoint(event);
  const stringIndex = zoneIndexFromY(point.y);
  const xCm = xCentimeters(point.x);
  pointers.set(event.pointerId, { string: stringIndex, xCm });
  sendPluck(stringIndex, frequencyFor(stringIndex, xCm));
});

canvas.addEventListener("pointermove", (event) => {
  const state = pointers.get(event.pointerId);
  if (!state) return;
  event.preventDefault();
  const point = eventToCanvasPoint(event);
  const stringIndex = zoneIndexFromY(point.y);
  state.xCm = xCentimeters(point.x);
  const frequency = frequencyFor(stringIndex, state.xCm);
  if (stringIndex !== state.string) {
    state.string = stringIndex;
    sendPluck(stringIndex, frequency);
  } else {
    sendGlissando(stringIndex, frequency);
  }
});

function releasePointer(event) {
  pointers.delete(event.pointerId);
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("lostpointercapture", releasePointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

async function startSimulation() {
  startButton.disabled = true;
  overlayStatus.textContent = "";
  try {
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.audioWorklet.addModule("js/worklet.js");
    oudNode = new AudioWorkletNode(audioContext, "oud-processor", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    oudNode.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "error") {
        showStartError(data.message);
      }
    };
    oudNode.connect(audioContext.destination);
    await audioContext.resume();
    simulationReady = true;
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 450);
    lastFrameTime = performance.now();
    requestAnimationFrame(renderFrame);
  } catch (error) {
    showStartError(String(error));
  }
}

function showStartError(message) {
  startButton.disabled = false;
  overlayStatus.textContent = "Audio failed to start: " + message;
}

startButton.addEventListener("click", startSimulation);

const NOTE_LABELS = ["Fa", "La", "Re", "Sol", "Do", "Fa"];
const canvasWrap = document.querySelector(".canvas-wrap");

for (let c = 0; c < STRING_COUNT; c++) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "open-string-btn";
  button.textContent = NOTE_LABELS[c];
  button.style.top = ((c + 0.5) / STRING_COUNT) * 100 + "%";
  button.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      sendPluck(c, OPEN_FREQUENCIES[c]);
    }
  );
  canvasWrap.appendChild(button);
}

function strokeSine(centerY, ph, cycles, amplitude) {
  ctx.beginPath();
  const STEPS = 240;
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS;
    const envelope = Math.sin(Math.PI * u);
    const y =
      centerY + Math.sin(u * cycles * TWO_PI + ph) * amplitude * envelope;
    if (i === 0) {
      ctx.moveTo(0, y);
    } else {
      ctx.lineTo(u * CANVAS_WIDTH, y);
    }
  }
  ctx.stroke();
}

function renderFrame(now) {
  const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.05);
  lastFrameTime = now;

  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (let s = 0; s < STRING_COUNT; s++) {
    const centerY = (s + 0.5) * ZONE_HEIGHT;
    const zoneTop = s * ZONE_HEIGHT;
    const active = [];
    for (const state of pointers.values()) {
      if (state.string === s) active.push(state);
    }

    if (active.length === 0) {
      ctx.strokeStyle = s < 3 ? COLOR_BASS : COLOR_TREBLE;
      ctx.lineWidth = 1.6;
      for (const offset of [-3, 3]) {
        ctx.beginPath();
        ctx.moveTo(0, centerY + offset);
        ctx.lineTo(CANVAS_WIDTH, centerY + offset);
        ctx.stroke();
      }
      continue;
    }

    const lead = active[0];
    const frequency = frequencyFor(s, lead.xCm);
    phase[s] += dt * TWO_PI * Math.min(frequency, 420) * 0.05;
    const cycles = 2 + 3 * (lead.xCm / MAX_PRESS_CM);

    ctx.strokeStyle = COLOR_ACTIVE;
    ctx.lineWidth = 3;
    strokeSine(centerY - 3, phase[s], cycles, 9);
    strokeSine(centerY + 3, phase[s] - 0.35, cycles, 7.6);

    ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    active.forEach((state, k) => {
      const label = frequencyFor(s, state.xCm).toFixed(1) + " Hz";
      ctx.fillText(label, CANVAS_WIDTH - 82, zoneTop + 8 + k * 16);
    });
  }

  requestAnimationFrame(renderFrame);
}
