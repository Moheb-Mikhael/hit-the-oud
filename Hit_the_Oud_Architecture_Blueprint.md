# Hit the Oud: System Architecture & Requirements

**Objective:** Build a real-time, physics-based acoustic simulation of an Arabic oud using a custom C++ DSP engine compiled to WebAssembly, paired with a Vanilla JavaScript/HTML5 Canvas frontend. Do not make any structural assumptions outside of these explicit parameters.

### 1. DSP Audio Engine (C++ Core) & Acoustic Timbre
*   **Algorithm & Voices:** Implement a fully polyphonic Karplus-Strong string synthesis model capable of executing multiple independent circular buffers simultaneously. The engine runs 12 physical string voices organized as 6 unison-doubled courses, matching a real Arabic oud.
*   **Memory Allocation:** Use dynamic allocation for the string buffers; the voice count is a constructor parameter, initialized as 12 voices (6 courses × 2 strings).
*   **Reference Tuning:** The 6 course pitches (f_open) from lowest to highest must be explicitly initialized as [87.0, 110.0, 147.0, 196.0, 261.0, 350.0] Hz.
*   **The Unison Detune (Chorus Effect):** Apply a randomized microtonal offset (e.g., +/- 0.3 Hz to +/- 0.8 Hz) to the second string of every pair to produce the authentic shimmering resonance.
*   **Nylon/Gut Excitation & Bowl Resonance:** Pre-filter the initial white noise burst through a sharp low-pass filter to simulate a risha striking nylon/gut. The feedback loop must aggressively attenuate high-frequency harmonics to mimic the deep acoustic reflection of the wooden bowl.
*   **Buffer Management:** Use linear interpolation when dynamically resizing the active buffer length. Dynamically adjust the low-pass filter coefficient to slightly brighten the tone as pitch increases.

### 2. Frontend Interface Mapping & Physics Constraint
*   **Layout & Geometry:** Render a horizontal layout (landscape) on an HTML5 Canvas (1200px width by 300px height). The Y-axis is divided into 6 equal horizontal collision zones to determine the active courseIndex.
*   **Physical Boundary:** The mathematical string length (L) is 60 cm. The interactive X-axis range is strictly clamped to the first 20 cm (the playable neck), measured right-to-left from the nut at the RIGHT edge of the canvas.
*   **Visual Aesthetics:** Fretless canvas. Background #18110E. Bass courses #C48A5E; treble courses #F4EBD9. Each course is drawn as two closely-spaced parallel lines. Active courses render twin phase-offset sine waves in #FFC107.
*   **Typography & UI:** Display live Hz frequency in modern sans-serif #FFFFFF. Include a rail of six buttons labeled `Fa · La · Re · Sol · Do · Fa` positioned to the right of the strings; clicking plucks the open course.

### 3. Interaction Mechanics (Risha & Left Hand)
*   **Browser Audio API:** Bind the compiled WebAssembly C++ loop strictly to an AudioWorklet.
*   **Velocity-Based Risha Dynamics:** Map vertical boundary-crossing velocity (v = delta_y / delta_t) to the excitation amplitude. Downward velocity triggers a brighter filter; upward triggers a softer filter.
*   **Multi-Touch Strumming:** Track multiple pointers independently. Dragging vertically across zones plucks each new course entered, while previously crossed strings enter their natural decay phase.
*   **Continuous Excitation & Sustained Sliding:** When a course is actively held, bypass the Karplus-Strong decay to sustain the note indefinitely. Dragging horizontally updates the frequency instantly for smooth microtonal glissando and organic vibrato.
*   **Natural Acoustic Damping:** Upon pointer release, re-engage a ~3-second mathematical damping filter so the kinetic energy dissipates naturally into silence, with bass strings sustaining slightly longer than treble.

### 4. Build & Setup Architecture
*   **Frontend Framework:** Use strict Vanilla JavaScript (HTML5, JS, CSS).
*   **Audio Policy Initialization:** Build a "Click to Start Simulation" UI overlay button to unlock the AudioContext securely.
*   **Compilation:** Provide a complete CMakeLists.txt file configured to compile the C++ source into WebAssembly via Emscripten, specifically handling the <emscripten/bind.h> exports.
