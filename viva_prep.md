# 🎓 Viva Preparation Guide: GesturePlay AI

This guide explains the technical inner workings of your project so you can confidently answer questions during your viva.

---

## 1. High-Level Architecture
- **Tech Stack**: Pure **Vanilla JavaScript (ES6)**, **HTML5**, and **CSS3**. No frameworks (like React/Angular) were used to keep it lightweight and high-performance.
- **Engine**: The system uses **Google MediaPipe (Hand Landmarker Tasks)** for real-time computer vision.
- **Rendering**: Games are rendered using the **HTML5 Canvas API**, which allows for high-frame-rate (60 FPS) 2D graphics.
- **Audio**: We use the **Web Audio API** to synthesize arcade sounds (square waves/oscillators) dynamically, avoiding the need for external audio files.

---

## 2. How the AI Works (MediaPipe)
- **Landmark Detection**: MediaPipe identifies **21 specific points** (landmarks) on each hand.
- **Processing Loop**: 
  1. `requestAnimationFrame` captures a frame from the webcam.
  2. The frame is sent to the `HandLandmarker` model.
  3. The model returns **Normalized Coordinates** (values from 0 to 1) for all 21 points.
  4. These coordinates are mapped to the Canvas pixel dimensions.

---

## 3. Gesture Recognition Logic
We don't use "black box" AI for gestures; we use **Geometric Heuristics**:
- **Fist Detection**: We calculate the distance between the fingertip (e.g., Point 8) and the knuckle (Point 5). If the distance is below a threshold, the finger is "folded." If 3+ fingers are folded, it's a **Fist**.
- **Drawing (Doodle)**: We check if the Index finger is "up" (Tip Y < PIP Y) while the other three fingers are "down."
- **Erasing**: We detect an "Open Palm" (all fingers extended and spread apart).
- **Boxing Guard**: We calculate the distance between the centers of both hands. If they are close to each other and positioned high, the "Guard" state is activated.

---

## 4. Key Technical Challenges & Solutions
- **Latency (Lag)**: Solved by using **WASM-optimized bundles** from MediaPipe.
- **Mirroring**: Webcam video is mirrored (`scaleX(-1)`) so that when the user moves left, the character moves left on screen (intuitive interaction).
- **Smoothing**: We use **Linear Interpolation (Lerp)** to prevent the "jittery" movement of hand circles, making the tracking feel smooth even if the AI flickers.

---

## 5. Potential Viva Questions
- **Q: Why not use a library like jQuery or React?**
  *A: To minimize overhead and ensure the game runs smoothly even on low-end hardware. Vanilla JS provides the lowest possible latency for AI processing.*
- **Q: How do you handle different screen sizes?**
  *A: The Canvas is dynamically resized using a `resize()` listener, and coordinates are normalized to the canvas width/height ratio.*
- **Q: Where is the data stored?**
  *A: We use `localStorage` to persist high scores and player stats locally on the browser.*
