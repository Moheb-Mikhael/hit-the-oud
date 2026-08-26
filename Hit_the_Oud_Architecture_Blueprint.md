# Hit the Oud: System Architecture & Requirements

**Objective:** Build a real-time, physics-based acoustic simulation of an Arabic oud using a custom C++ DSP engine compiled to WebAssembly, paired with a Vanilla JavaScript/HTML5 Canvas frontend. Do not make any structural assumptions outside of these explicit parameters.

### 1. DSP Audio Engine (C++ Core)
*   **Algorithm:** Implement a fully polyphonic Karplus-Strong string synthesis model capable of executing multiple independent circular buffers simultaneously. 
*   **Memory Allocation:** Use dynamic allocation for the string buffers to future-proof the engine for 7-string or 8-string setups, though only 6 will be initialized for now.
*   **Reference Tuning:** The 6 open string frequencies ($f_{open}$) from lowest to highest must be explicitly initialized as `[87.0, 110.0, 147.0, 196.0, 261.0, 350.0]` Hz.
*   **Buffer Management:** Use linear interpolation when dynamically resizing the active buffer length during a frequency shift to prevent audio artifacts or clicking.

### 2. Frontend Interface Mapping & Physics Constraint
*   **Layout & Geometry:** Render a horizontal layout (landscape) on an HTML5 Canvas. The horizontal X-axis maps to the physical string length. The vertical Y-axis must be mathematically divided into 6 equal horizontal collision zones to determine the `activeStringIndex`.
*   **Physical Boundary Constraint:** The absolute mathematical string length ($L$) is 60 cm. The interactive X-axis range must be strictly clamped to represent only the first 20 cm (the playable neck). 
*   **Visual Rendering:** Render a completely fretless canvas. When a string collision zone is actively clicked and held, visually render a dynamic, oscillating sine wave animation to represent the physical vibration.

### 3. Interaction & Audio Routing
*   **Browser Audio API:** Bind the compiled WebAssembly C++ processing loop strictly to an `AudioWorklet` to ensure isolated, real-time performance on a dedicated audio thread. 
*   **Pitch Mechanics:** Implement continuous glissando mapping. As the pointer slides horizontally across the X-axis while held down, dynamically update the physical distance ($x$), calculate the new frequency via $f_{new} = f_{open} \left( \frac{60}{60 - x} \right)$, and resize the audio buffer in real-time.

### 4. UI/UX Visual Specifications (Modern Oud Aesthetic)
*   **Canvas Resolution:** Explicitly set the canvas dimensions to `1200px` wide by `300px` high.
*   **Background:** Fill the canvas with `#18110E` (Dark Ebony). Do not use image textures.
*   **Resting String Colors:** Render strings 4, 5, and 6 (the bass courses) using `#C48A5E` (Copper). Render strings 1, 2, and 3 (the treble courses) using `#F4EBD9` (Ivory). 
*   **Active State Animation:** When a collision zone is triggered, the sine wave animation for that specific string must switch to `#FFC107` (Luminous Gold) and render with a slightly thicker stroke weight to emphasize the responsive motion.
*   **Typography:** If displaying the live Hz frequency on screen, use a clean, modern sans-serif font in `#FFFFFF` with slight opacity, positioned cleanly in the corner of the active zone.

### 5. Build & Setup Architecture
*   **Frontend Framework:** Use strict Vanilla JavaScript (HTML5, JS, CSS) for maximum canvas rendering performance without virtual DOM overhead.
*   **Audio Policy Initialization:** Build a "Click to Start Simulation" UI overlay button. This must unlock the `AudioContext` securely upon the first user interaction before initializing the AudioWorklet and un-mounting the button.
*   **Compilation:** Provide a complete `CMakeLists.txt` file configured to compile the C++ source into WebAssembly via Emscripten, specifically handling the `<emscripten/bind.h>` exports for the AudioWorklet.
