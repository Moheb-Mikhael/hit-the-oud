import createOudModule from "../build/oud_dsp.js";

const RENDER_QUANTUM = 128;
const COURSE_COUNT = 6;
const VOICE_COUNT = 12;

class OudProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.view = null;
    this.pendingMessages = [];
    this.port.onmessage = (event) => this.handleMessage(event.data);

    createOudModule({
      locateFile: (path) => new URL("../build/" + path, import.meta.url).href,
    })
      .then((Module) => {
        this.engine = new Module.OudEngine(sampleRate, VOICE_COUNT);
        this.view = this.engine.outputView(RENDER_QUANTUM);
        const queued = this.pendingMessages;
        this.pendingMessages = null;
        for (const message of queued) {
          this.handleMessage(message);
        }
        this.port.postMessage({ type: "ready" });
      })
      .catch((error) => {
        this.port.postMessage({ type: "error", message: String(error) });
      });
  }

  handleMessage(message) {
    if (!message || typeof message.type !== "string") {
      return;
    }
    if (!this.engine) {
      if (this.pendingMessages) {
        this.pendingMessages.push(message);
      }
      return;
    }
    switch (message.type) {
      case "pluck": {
        const course = message.string | 0;
        if (course < 0 || course >= COURSE_COUNT) {
          break;
        }
        if (typeof message.frequency === "number") {
          this.engine.setCourseFrequency(course, message.frequency);
        }
        const velocity = Number(message.velocity);
        this.engine.pluckCourse(
          course,
          Number.isFinite(velocity) && velocity > 0 ? velocity : 0.8,
          message.bright === false ? 0 : 1
        );
        if (message.sustain) {
          this.engine.setCourseSustain(course, true);
        }
        break;
      }
      case "release": {
        const course = message.string | 0;
        if (course < 0 || course >= COURSE_COUNT) {
          break;
        }
        this.engine.setCourseSustain(course, false);
        break;
      }
      case "glissando": {
        if (typeof message.frequency === "number") {
          const course = message.string | 0;
          if (course < 0 || course >= COURSE_COUNT) {
            break;
          }
          this.engine.setCourseFrequency(course, message.frequency);
        }
        break;
      }
      default:
        break;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output.length > 1 ? output[1] : left;
    if (!this.engine || !this.view) {
      left.fill(0);
      if (right !== left) {
        right.fill(0);
      }
      return true;
    }
    const frames = Math.min(left.length, RENDER_QUANTUM);
    this.engine.render(frames);
    left.set(this.view.subarray(0, frames));
    if (right !== left) {
      right.set(this.view.subarray(0, frames));
    }
    return true;
  }
}

registerProcessor("oud-processor", OudProcessor);
