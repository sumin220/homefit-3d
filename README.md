# HomeFit 3D (먼저가봄 홈)
**3D Indoor Mobility & Head-to-Toe Hazard Physics Verifier Powered by Gemini 4 Argon (`gemini-4-argon`)**

- 🌐 **Live Cloud Run Deployment:** [https://homefit-3d-778497310901.asia-northeast3.run.app](https://homefit-3d-778497310901.asia-northeast3.run.app)
- 🎬 **60-Second Demo Video (with English Voiceover):** [`docs/HomeFit3D_Demo_60s.mp4`](docs/HomeFit3D_Demo_60s.mp4)

> **Google DeepMind AI Hackathon — Track 3: Google AI for Social Good**
> *Accessibility doesn't stop at the floor. Born from a real accident where a crutch-using parent struck an overhead glass cabinet while navigating a cramped bathroom, HomeFit 3D uses Gemini 4 Argon (`gemini-4-argon`) to reconstruct home photos into an interactive Three.js 3D space, run 3D head-to-toe kinematic collision simulations, and autonomously verify safer room layouts.*

---

## 1. Origin Story: Why 2D Floor Checklists Fail

Our parents use crutches inside the home every day. In their bathroom, a stainless-steel **wall grab bar** was already installed next to the toilet. By conventional 2D accessibility checklists, this bathroom was marked *"Accessible (Grab Bar Present)"*.

Yet a serious accident happened: while stepping around floor basins and bath caddies on wet ceramic tiles to sit/stand using crutches, our parent's upper body pitched forward (`+28cm` sit-to-stand lean arc) into a **protruding overhead tempered-glass cabinet (`Y = 146cm`, `34cm` depth)**, shattering glass across the bathroom floor.

**The Core Insight:**
Indoor mobility barriers are **3-Dimensional**, not 2D floor plans:
1. **Floor Layer (`0–30cm`):** Door threshold lips (`3.2cm`), wet slippery tiles, and floor clutter (buckets/caddies) narrow where crutch tips (`>= 68cm`) or wheelchair casters (`>= 78cm`) can land.
2. **Mid/Torso Layer (`30–130cm`):** Narrowed stance or tight furniture gaps (`< 68cm` crutches / `< 78cm` wheelchair) force an off-axis upper-body lean when reaching for grab bars or pivoting.
3. **Overhead Head-Strike Layer (`130–195cm`):** During **Sit-to-Stand (`+28cm` forward head pitch)** or crutch pivoting, the head trajectory arcs directly into low or deep overhead glass cabinets (`-8cm` collision penetration)—and reaching above `Y > 135cm` forces a crutch user to release one crutch handle on a wet floor.

---

## 2. Closed-Loop Verification Architecture (`Observe 3D → Simulate Physics → Argon Patch → Re-Verify`)

HomeFit 3D implements a strict **Observe → Act → Verify → Remediate** loop combining **Gemini 4 Argon (`gemini-4-argon`)** with a **Deterministic 3D Kinematic Physics Verifier** ([`src/shared/kinematicVerifier.ts`](src/shared/kinematicVerifier.ts)):

1. **Dynamic Multimodal 3D Scene Reconstruction (`gemini-4-argon`):**
   - Uses `@google/genai` **Interactions API** (`client.interactions.create`, `model: "gemini-4-argon"`, `store: false`, `generation_config: { thinking_level: "medium", thinking_summaries: "auto" }`) to analyze preset or custom uploaded room photos.
   - Extracts a complete 3D scene graph (`roomDimensions`, `beforeObjects` with 2D normalized `[ymin, xmin, ymax, xmax]` + metric 3D `position`/`dimensions`, `afterObjects`, `remediationChecklist`, and `unverifiedZones`) across `Floor`, `Mid`, and `Overhead` layers.
   - Automatically detects non-indoor or blurry photos (`isIndoorRoom: false`) and halts false clearance claims.
2. **Deterministic 3D Full-Body Kinematic Simulation (`Three.js` + `kinematicVerifier.ts`):**
   - Simulates an articulated 3D character (`Crutches User`, `Manual Wheelchair User`, `Walker User`, or `Cane User`) along indoor waypoints.
   - Projects **real-time 3D-to-2D Floating HUD Callout Badges** (`💥 Head Strike (-8cm)`, `📏 Stance 44cm < 68cm`, `🔒 Locked`, `📏 Measured`) directly over 3D objects in the viewport.
3. **Autonomous 3D Spatial Remediation & Vector Visualization:**
   - When the physics engine returns `Incompatible (FAIL)`, Argon synthesizes a 3D layout patch and renders **3D dashed ghost wireframes + green displacement vector arrows (`THREE.ArrowHelper`)** in `AFTER` mode showing exact furniture relocations and cabinet depth reductions.
   - Re-runs the 3D simulator to verify **0 collisions (`Verified Safe` / `Needs checking`)**.
4. **Epistemic Humility & Human-in-the-Loop (HITL) Collaboration:**
   - **On-Site 4-Dimension Tape-Measure Override (`F08`):** Clicking any 3D object lets caregivers override `visual_estimate` dimensions (`Width`, `Height`, `Depth`, `CenterY` in `cm`) with real physical tape-measure readings (`user_measured`), immediately updating the 3D mesh and re-running the collision engine.
   - **Single-Photo Blind-Spot Audit (`F04` & `F12`):** Explicitly lists occluded floor/stud blind spots and enforces a 3-state Epistemic Verdict (`Incompatible` / `Needs checking` / `Verified Safe`).
   - **Caregiver Fixture Locks (`F09`):** Locking a built-in cabinet or heavy furniture forces the solver to compute a non-destructive safety adaptation (e.g., shatter-guard film + edge bumper pads + waist-level `105cm` caddy).
   - **1-Page Printable Safety & Korean Welfare Subsidy Spec Sheet (`F10` & `F13`):** Exports a 1-page contractor & subsidy schedule mapped to Korean Long-Term Care Insurance codes (`노인장기요양보험 복지용구 85% 지원`: `F01010`, `F02010`, `F03010`).

---

## 3. Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key

# 3. Build frontend & start full-stack NestJS server on http://localhost:8080
npm run build
npm start
```

---

## 4. Deploy to Google Cloud Run

```bash
gcloud run deploy homefit-3d \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=YOUR_GEMINI_API_KEY"
```

---

## 5. Tech Stack

- **AI & Multimodal Reasoning:** **Gemini 4 Argon (`gemini-4-argon`)** via `@google/genai` **Interactions API** (`client.interactions.create`, `thinking_level: "medium"`)
- **Backend Framework:** **NestJS v11** (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) — Modular DI architecture ([`AppModule`](src/server/app.module.ts), [`HomeFitController`](src/server/homefit.controller.ts), [`ArgonService`](src/server/argon.service.ts), [`argonEngine.ts`](src/server/argonEngine.ts))
- **3D Simulation & Frontend:** **React 19**, **Three.js (`r174`)**, **Tailwind CSS v4**, **Lucide React**
- **Physics Verifier:** Deterministic 3D Full-Body Kinematic & AABB Swept-Volume Engine ([`src/shared/kinematicVerifier.ts`](src/shared/kinematicVerifier.ts))
- **Deployment:** Dockerized single-container full-stack build for **Google Cloud Run**

---

## 6. Project Documentation (`docs/`)

- [**Product Requirements Document (`docs/PRD.md`)**](docs/PRD.md) — Executive Summary, Real-World Origin Story, Target Personas, Core User Flow, and Subsidy Checklist Mapping
- [**Technical Requirements Document (`docs/TRD.md`)**](docs/TRD.md) — System Architecture, NestJS Backend Design, Gemini 4 Argon Interactions API Integration, and 3D Kinematic Physics Formulas

