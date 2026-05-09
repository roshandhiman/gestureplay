# 🖐️ GesturePlay AI
### *The Future of Gaming is in Your Hands*

**GesturePlay AI** is a futuristic, browser-based gaming platform that uses AI-powered hand tracking to control immersive arcade games. No controllers, no touch—just pure gesture-based interaction.

![GesturePlay AI Dashboard](https://img.shields.io/badge/Status-Production--Ready-brightgreen)
![Tech Stack](https://img.shields.io/badge/Stack-HTML--CSS--JS--MediaPipe-blue)

---

## 🚀 Live Demo
**[Deploy to Vercel]** | **[View Demo](#)** *(Replace with your link)*

---

## 🎮 The Games

### 🥊 Boxing Arena (Webcam AR)
Your webcam IS the ring. Use real fists to punch incoming holographic pads and dodge body blows by moving your head.
*   **Gestures:** Fist (Punch), Head Tilt (Dodge).

### 🐦 Sky Glide (Flappy Pro)
Navigate a neon bird through a progressively difficult cityscape.
*   **Gestures:** Hand height (Vertical Flight).

### 🏎️ Neon Racer
Steer a futuristic car through high-speed traffic.
*   **Gestures:** Move hand Left/Right (Steering).

### ⚔️ Blade Master
A cyberpunk slicing experience. Slice fruits and dodge bombs with rapid movements.
*   **Gestures:** Rapid hand swipe (Slice).

### ✍️ Air Canvas Pro
A high-precision 3D drawing tool.
*   **Gestures:** Index finger (Draw), Open Palm (Erase), Fist (Free move).

### 👊 Shadow Strike
A rhythm-based reflex game.
*   **Gestures:** Multi-hand punching of neon nodes.

---

## ✨ Features
-   🤖 **AI Tracking:** Powered by Google MediaPipe for low-latency hand landmarker detection.
-   🎶 **Synth Audio Engine:** Real-time sound synthesis using Web Audio API (no heavy MP3 files).
-   📈 **Progressive Difficulty:** Games get faster and harder as your score increases.
-   💾 **Persistence:** High scores and stats saved via `localStorage`.
-   🌌 **Futuristic UI:** Dark-mode, glassmorphism, and neon aesthetics with GSAP-ready animations.
-   📱 **Fully Responsive:** Works smoothly on low-end laptops and high-end desktops.

---

## 🛠️ Technical Stack
-   **Frontend:** Vanilla HTML5, CSS3 (Modern Flexbox/Grid), JavaScript (ES6+ Modules).
-   **AI Engine:** [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker).
-   **Audio:** Web Audio API (Dynamic Oscillator Synthesis).
-   **Animations:** CSS Transitions & GSAP (Optional).

---

## 🏁 Getting Started

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/GesturePlayAI.git
   ```
2. Open the folder:
   ```bash
   cd GesturePlayAI
   ```
3. Run a local server (Required for MediaPipe/Modules):
   ```bash
   # Python
   python3 -m http.server 8000
   
   # Or using Node.js
   npx serve
   ```
4. Visit `http://localhost:8000`.

### Vercel Deployment
GesturePlay AI is ready for one-click deployment on Vercel:
1. Push this code to a GitHub repo.
2. Connect the repo to Vercel.
3. Vercel will automatically detect the `index.html` and deploy it as a static site.

---

## 📜 Academic Purpose
This project was developed for a **College Project Showcase**, demonstrating the integration of Computer Vision (CV) in browser-based environments using lightweight, pure technologies.

---

## 🤝 Contributing
Feel free to fork this project, add new games, or improve the AI sensitivity!

---

*Made with ❤️ and AI for Gesture Gaming enthusiasts.*
