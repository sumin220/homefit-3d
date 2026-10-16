# Product Requirements Document (PRD v1.0) — HomeFit 3D (먼저가봄 홈)

- **Date:** October 16, 2026
- **Track:** Track 3 — Google AI for Social Good
- **Model:** Gemini 4 Argon (`gemini-4-argon`) via `@google/genai` Interactions API
- **Status:** Final MVP Specification

---

## 1. Product Definition

**HomeFit 3D (먼저가봄 홈)** is an indoor 3D (Floor · Mid · Overhead) mobility barrier verifier and home modification physics simulator designed for **crutch and wheelchair users** (as well as their caregivers and occupational therapists) preparing for hospital discharge or daily indoor living.

Given a single indoor room photo and the resident's biometric & mobility-aid constraints, **Gemini 4 Argon (`gemini-4-argon`)** extracts spatial structures and hazard candidates across **three elevation layers (Floor `0–30cm`, Mid-Torso `30–130cm`, and Overhead `130–195cm`)**. An isomorphic **Three.js 3D Physics & Kinematic Verifier (`kinematicVerifier.ts`)** then simulates articulated full-body trajectories—walking, 360° pivoting, sit-to-stand forward head pitch, and overhead reach—to detect 3D collisions, separate visual estimates from verified tape measurements, and synthesize a verified **Before → After** layout modification patch.

> **One-Sentence Submission Pitch:**
> *HomeFit 3D helps crutch and wheelchair users preview 3D indoor mobility hazards—from floor clutter and tight furniture gaps to overhead head-strike zones—verify room layouts against their personal body and aid constraints, and identify what needs measuring or modifying at home.*

---

## 2. Problem Statement & Real-Life Origin Story

### 2.1 The Real Accident Behind HomeFit 3D: Why 2D Grab-Bar Checklists Fail
Our team member's parent uses crutches daily inside the home. In their bathroom, a stainless-steel **wall grab bar** was already installed next to the toilet. According to conventional 2D accessibility checklists, this bathroom passed as *"Accessible (Grab Bar Present)"*.

However, a severe accident occurred: while stepping around plastic floor basins and bath caddies on wet ceramic tiles to sit and stand using crutches, their crutch stance narrowed to `44cm`. As they rose from the toilet (`Sit-to-Stand`), their torso and head pitched forward `+28cm` into a **protruding overhead tempered-glass cabinet (`Y = 128cm–178cm`)**, shattering tempered glass across the bathroom floor.

### 2.2 Five Core Gaps We Solve
1. **Outdoor-Only Bias of Existing Apps:** Existing barrier-free maps focus almost exclusively on outdoor sidewalks and transit stations, leaving the indoor home environment (bathrooms, corridors, bedrooms)—where post-discharge falls and head trauma happen most frequently—completely unverified.
2. **Failure of 2D Floor-Plan Checklists (Ignoring 3D Full-Body Kinematics):**
   - Traditional checklists only inspect the 2D floor (thresholds or corridor width).
   - Real indoor accidents happen as a **3D Domino Effect**:
     1. **Floor Layer (`0–30cm`):** Door threshold lips, wet tiles, and floor clutter (basins/caddies) restrict where crutch tips or wheelchair casters can land.
     2. **Mid Layer (`30–130cm`):** Restricted floor stance or tight furniture gaps (`< 68cm` crutches / `< 78cm` wheelchair) force an off-axis upper-body twist when reaching for grab bars or pivoting.
     3. **Overhead Layer (`130–195cm`):** During **Sit-to-Stand (`+28cm` forward head pitch)** or crutch pivoting, the head trajectory arcs directly into protruding overhead glass cabinets—or reaching above `Y > 135cm` forces a crutch user to release one crutch handle on a slippery floor.
3. **Divergent Biomechanical Constraints by Mobility Aid:**
   - **Manual Wheelchair Users:** Require `>= 78cm` clear passage width, `>= 140cm` 360° turning circle diameter, `<= 1.5cm` threshold lip, and `<= 120cm` seated reach height.
   - **Bilateral Crutch Users:** Require `>= 68cm` bilateral crutch-tip stance width, high-friction wet-floor matting, unobstructed **Sit-to-Stand forward head-pitch clearance (`+28cm`)**, and waist/eye-level storage (`85–115cm`) so neither hand releases a crutch handle.
4. **Epistemic Gap Between Single-Photo Estimates and On-Site Tape Measurements:**
   - A single 2D photo cannot guarantee millimeter-exact dimensions or non-visual properties (wet tile friction coefficient, internal wall-stud pull strength). An honest AI system must explicitly distinguish `Standard Spec`, `Visual Estimate (Needs Tape Measure)`, and `User Measured`, plus surface `Unverified Zones`.
5. **Real-World Fixture Constraints (Human-in-the-Loop Lock):**
   - When an AI suggests *"remove the overhead cabinet"* or *"move the heavy dining table"*, caregivers often face landlord restrictions or built-in fixtures. Caregivers must be able to **Lock (`Locked / Built-In`)** any fixture and have the solver compute a non-destructive safety adaptation (e.g., shatterproof film + elastomer bumper guard + clearing floor clutter to shift stance away from the cabinet).

---

## 3. Target Users

| User Group | Core Need |
| :--- | :--- |
| **Crutch Users (Daily Indoor Mobility / Post-Surgery)** | Ensure wide crutch-tip floor stance, prevent wet-tile slips, eliminate overhead cabinet head-strike hazards during sit-to-stand, and store daily items within safe reach (`<= 135cm`) without releasing a crutch. |
| **Wheelchair Users (Hospital-to-Home Discharge)** | Verify doorway and furniture pinch points (`>= 78cm`), 360° turning circles (`>= 140cm`), threshold ramp requirements (`<= 1.5cm`), and toilet/bed transfer clearances. |
| **Family Caregivers** | Audit a parent's home from photos before hospital discharge, lock non-movable fixtures, input real tape-measure numbers, and get an actionable checklist split into `$0 Immediate Actions` vs. `85%-Subsidized Welfare Equipment`. |
| **Occupational Therapists & Housing Welfare Counselors** | Conduct pre-visit 3D spatial previews to pinpoint exact clearances and on-site verification items. |

---

## 4. Core Value Propositions & Differentiation

1. **3-Layer Volumetric & Kinematic Verification (`Floor 0–30cm` · `Mid 30–130cm` · `Overhead 130–195cm`):** Evaluates the entire 3D human movement envelope rather than a flat 2D floor plan.
2. **Photo-to-3D Evidence Traceability:** Every 3D bounding box and collision marker is bi-directionally linked to its 2D bounding box (`box2d`) on the original photo and its 3D causal chain.
3. **Epistemic Honesty & Tape-Measure Override:**
   - Never fabricates false certainty from a single 2D photo.
   - Tags every object dimension as `Standard Spec`, `Visual Estimate`, or `User Measured`, and allows caregivers to enter real tape-measure values (`cm`) to dynamically re-verify the 3D scene.
4. **Closed-Loop Autonomous Remediation (`Observe → Simulate → Verify → Patch → Re-Verify`):** Generates an autonomous `After` 3D layout patch and re-runs the deterministic kinematic engine to prove collisions drop to zero.
5. **Human-in-the-Loop Constraint Locking:** Respects caregiver-locked fixtures and dynamically adapts the safety patch (or honestly reports `Incompatible` if a locked corridor obstacle makes passage physically impossible).

---

## 5. Functional Requirements (`F01` ~ `F14`)

| ID | Feature | Definition of Done |
| :--- | :--- | :--- |
| **F01** | **Biometric & Mobility Profile Configuration** | Switch between `Bilateral Crutches` and `Manual Wheelchair` and adjust `userHeightCm`, `minPassageWidthCm`, `turningRadiusCm`, `maxStepThresholdCm`, `sitToStandForwardPitchCm`, and `maxSafeReachHeightCm` with instant 3D re-verification. |
| **F02** | **Real-Case Presets & Custom Room Photo Upload** | Provide Preset 1 (*Parent's Bathroom Real Overhead Glass Accident*) and Preset 2 (*Post-Surgery Living-to-Bedroom Corridor Pinch*), plus custom JPG/PNG/WebP photo upload analyzed by `gemini-4-argon`. |
| **F03** | **3-Layer Multimodal Spatial Extraction** | Extract 2D bounding boxes (`box2d`) and 3D bounding volumes categorized into `floor` (`0–30cm`), `mid` (`30–130cm`), and `overhead` (`130–195cm`) layers with material hazard tags (`tempered_glass`, `wet_slippery_tile`, etc.). |
| **F04** | **Epistemic Uncertainty & Unverified Zone Separation** | Explicitly list single-photo blind spots (`unverifiedZones`, such as wet tile dynamic friction and wall anchor pull-out strength) with interactive on-site confirmation checkboxes. |
| **F05** | **Three.js 3D Room & 3-Layer Hazard Rendering** | Render interactive 3D room geometry, elevation slice planes, object bounding boxes, downward overhead hazard projection zones, and collision shockwave spheres. |
| **F06** | **Articulated Full-Body Avatar & Sit-to-Stand Head Arc** | Animate an articulated 3D crutch or wheelchair avatar across waypoints (`Step 1` to `Step 4`) and render the 3D `CatmullRomCurve3` head-pitch trajectory arc. |
| **F07** | **Deterministic 3-Layer Kinematic Physics Verifier** | Mathematically evaluate threshold lips, floor clutter stance narrowing, corridor pinch gaps, 360° turning cylinders, sit-to-stand overhead head-strike intersections, and one-handed high reach hazards in [`kinematicVerifier.ts`](../src/shared/kinematicVerifier.ts). |
| **F08** | **On-Site Tape-Measure Override (`Visual Estimate → User Measured`)** | Allow users to input actual tape-measured dimensions (`widthCm`, `heightCm`, `depthCm`, `mountHeightYCm`), promoting the object to `user_measured` and immediately recalculating 3D geometry and collision status. |
| **F09** | **Human-in-the-Loop Fixture Locking (`Lock / Built-In`)** | Allow caregivers to lock any fixture (`lockedByUser`), forcing non-structural safety adaptations or retaining unresolvable pinch warnings honestly. |
| **F10** | **Autonomous 3D Remediation Patch (`BEFORE → AFTER`)** | Generate and preview the remediated 3D room layout that clears movable clutter, recesses/guards overhead glass, adds waist-level storage (`Y = 98cm`), and installs threshold ramps and non-slip mats. |
| **F11** | **Bidirectional Photo ↔ 3D ↔ Hazard Inspector Sync** | Clicking any hazard card or 2D bounding box focuses the 3D avatar at the corresponding waypoint and highlights the colliding 3D object. |
| **F12** | **Strict 3-Tier Epistemic Verdict State Machine** | Classify overall scene status strictly into `Incompatible` (`FAIL_CRITICAL_HAZARDS`), `Needs checking` (`NEEDS_ON_SITE_CHECK`), or `Meets checked conditions` (`VERIFIED_SAFE_PASS`)—never claiming "100% Guaranteed Safe". |
| **F13** | **Actionable Pre-Discharge & Korean Welfare Subsidy Checklist** | Group remediation steps into `IMMEDIATE_ZERO_COST ($0)`, `WELFARE_EQUIPMENT (85% Korean Long-Term Care Insurance Subsidy)`, and `HOME_MODIFICATION` with one-click summary export. |
| **F14** | **Non-Indoor / Occluded Photo Guardrail** | When `gemini-4-argon` detects a non-indoor or severely occluded photo (`isIndoorRoom === false`), block false safety verdicts and display a clear re-upload warning banner. |

---

## 6. Division of Responsibility: Gemini 4 Argon vs. Deterministic Physics Engine

| Component | Core Responsibility |
| :--- | :--- |
| **Gemini 4 Argon (`gemini-4-argon`)** | • Multimodal 2D-to-3D perception across `Floor`, `Mid`, and `Overhead` layers<br>• Reasoning over multi-layer causal domino chains (`thoughtSummary`)<br>• Identifying single-photo blind spots (`unverifiedZones`) and non-indoor inputs (`isIndoorRoom`)<br>• Synthesizing constraint-aware 3D remediation patches around caregiver-locked fixtures |
| **Deterministic 3D Physics Verifier (`kinematicVerifier.ts`)** | • Exact 3D bounding-box & kinematic trajectory intersection math<br>• Enforcing biometric thresholds (`userHeightCm`, `sitToStandForwardPitchCm`, `minPassageWidthCm`, `turningRadiusCm`)<br>• Applying caregiver `Tape-Measure Overrides` and `HITL Fixture Locks` with 0ms latency<br>• Computing the strict 3-tier verification status (`Incompatible` / `Needs checking` / `Meets checked conditions`) |
