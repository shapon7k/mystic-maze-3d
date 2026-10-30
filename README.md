# Mystic Maze 3D

**Mystic Maze 3D** is a complete, playable 3D first-person circular labyrinth puzzle game designed with procedural maze generation, ancient geometric stone architecture, and atmospheric cosmic lighting.

The central gameplay principle is:
> **Explore. Observe. Remember. Navigate. Escape.**

The challenge comes entirely from spatial exploration, observation of square stone halls, decision-making, and backtracking.

---

## Non-Negotiable Exploration Rules

In accordance with pure spatial puzzle design:
- **No minimap** or map screen.
- **No compass**, GPS, or directional arrows.
- **No route markers** or highlighted correct paths.
- **No hints**, automatic pathfinding, or distance indicators.
- **Natural discovery only**: The central exit sanctum can only be seen and heard when entering or directly facing into the chamber with an unobstructed line of sight.

---

## Features

- **Procedural Square Labyrinth**: Generates a new square-grid layout for every run with guaranteed solvability (randomized depth-first search with a few extra loops and many dead ends).
- **16:9 Opening Menu Flow**: Splash (tap to continue) → Main Menu (Play, Settings, About) → Play Setup (difficulty and optional seed). The menu always fits a 16:9 stage, from small phones to tablets, with no scrolling.
- **Seeded Runs & Replayability**: Enter custom seeds or generate randomized seeds across three difficulty tiers:
  - *Initiate*: 8 × 8 Grid · 64 Chambers
  - *Seeker*: 11 × 11 Grid · 121 Chambers
  - *Archon*: 14 × 14 Grid · 196 Chambers
- **Custom First-Person Physics**: Smooth sliding collision against solid square stone walls (collision boxes are exactly the rendered walls).
- **Atmospheric Visuals**: PBR stone materials, ancient runic carvings, floating cosmic dust particles, and atmospheric fog.
- **100% Procedural Web Audio**: Zero external audio assets—mystical ambient synth drone, stone footsteps, and victory chimes synthesized in real time via the Web Audio API.
- **Fully Offline & Self-Contained**: Requires no external APIs, no API keys, and no backend server.

---

## Controls

### Mobile Touchscreen
- **Movement**: Virtual analog joystick positioned on the bottom-left of the screen.
- **Camera Look**: Drag across the right half of the screen to look and turn smoothly.
- **Sprint**: Hold or tap the lightning rune button on the bottom-right for increased movement speed.
- **Pause / Settings**: Tap the Pause button in the top-right corner.

### Desktop Keyboard & Mouse
- **Move**: `W`, `A`, `S`, `D` or `Arrow Keys`
- **Look**: Click and drag with mouse across the screen
- **Sprint**: Hold `Shift`
- **Pause**: Press `Esc` or `P`
- **Start / Confirm**: Press `Enter` or `Space`

---

## Platform & Technical Notice

> **Important**: This project is a **browser-based 3D web application** built with **Three.js**, **React**, and **TypeScript**.
> It is optimized for mobile touchscreens (responsive viewport, touch gestures, software-WebGL fallbacks, and low-occlusion HUD) and desktop web browsers.
> **It is NOT a native Android APK/AAB package or Unity C# project.**

---

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### Production Build
```bash
npm run build
```

### Type Checking / Linting
```bash
npm run lint
```

### Automated Tests
```bash
npm test
```

---

## Android Build (Capacitor)

The repository includes a configured native Android project located in `./android` powered by **Capacitor**:
- **Application ID**: `com.mysticmaze3d.game`
- **Application Name**: `Mystic Maze 3D`
- **Orientation**: Locked to `sensorLandscape`
- **Display**: Immersive fullscreen with hidden status bar and system navigation bars
- **Screen Wake**: Screen kept awake during gameplay via native `FLAG_KEEP_SCREEN_ON` and Screen Wake Lock API
- **Permissions**: **Zero permissions** (`AndroidManifest.xml` contains no internet, camera, audio, location, or contacts permissions). All 3D assets, procedural audio, and game logic load 100% locally from device storage with zero network access.

### Building the Debug APK on Your Computer

To compile the Android APK, you need a computer with **Java JDK (17+)** and **Android Studio** (with the Android SDK):

1. **Clone or download the project repository** to your local machine.
2. **Install dependencies and compile web assets**:
   ```bash
   npm install
   npm run build
   npx cap sync android
   ```
   *What this does*: Compiles the TypeScript/Vite web application into `dist/` and syncs the static assets into `android/app/src/main/assets/public`.

3. **Option A: Build via Command Line (Gradle)**:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   *(On Windows use `gradlew.bat assembleDebug`)*  
   *What this does*: Executes Gradle, builds the native Android wrapper and WebView, and outputs the debug APK file to `android/app/build/outputs/apk/debug/app-debug.apk`.

4. **Option B: Build & Run via Android Studio**:
   ```bash
   npx cap open android
   ```
   *What this does*: Launches Android Studio with the `./android` project. From there:
   - Click **Run** (`Shift + F10`) to deploy and test directly on a connected Android phone or emulator.
   - Or go to **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate the APK.

