# Competitive Research: Strength-Training Apps — Engine & UX Teardown

> Goal: extract best-in-class mechanics for exercise programming, progression, equipment handling and session UX, and map concrete upgrades for Vorcelab's runner-focused **renfo** module. Renfo must stay **SIMPLE** (runners, not bodybuilders) and **DETERMINISTIC**.
> Date: 2026-06-16. Author: competitive-analysis pass.

---

## 0. How to read this file
Each app teardown covers: (1) exercise library, (2) programming/personalization (rule-based vs ML), (3) progression & autoregulation, (4) equipment/constraints, (5) session-in-progress UX, (6) periodization. Sources cited inline + consolidated at the bottom. Final section = synthesis + critique of Vorcelab renfo + concrete upgrades.

---

## 1. Per-App Teardowns

### 1.1 Fitbod — the ML-driven "what-should-I-do-today" engine
- **Library:** 800–1,600+ exercises (sources vary; help center says 800+, marketing says 1,600+), each with HD demo video, muscle tagging (primary/secondary), equipment tags.
- **Programming (hybrid ML + rules):** Every workout, Fitbod **scores and ranks all exercises** for that user. Scoring inputs: (1) muscle-recovery status [primary], (2) goal & experience appropriateness (rated by in-house trainers across strength/hypertrophy/general × novice/intermediate/advanced), (3) feedback history (added/removed/favorited), (4) training-split compatibility (no chest on leg day), (5) available equipment.
- **Muscle-recovery model (the signature feature):** each muscle group gets a **0–100% recovery score** derived from recent training volume; muscles trained in the last **48–72h** are deprioritized. Cardio (Apple Health/Fitbit/Strava) feeds fatigue. If a still-fatigued muscle must appear, it's given **lower-intensity or alternative movements**.
- **Progression:** rep ranges by goal (strength 1–6 @ ~85–100% 1RM, 3–5 min rest; hypertrophy 6–12, 10–20 sets/muscle/wk). Weight derived from **e1RM via Epley**; for new exercises, **seeds starting weight from aggregate data across millions of users**. **Reps-in-Reserve (RiR)** logged per set adjusts loading. Periodic **"Max Effort" sets** (AMRAP on last set) recalibrate 1RM.
- **Equipment:** explicit profiles (full gym / home / dumbbells-only). Larger library = more substitution room. Auto-substitutes alternatives for same muscle when equipment/fatigue constrains.
- **Session UX:** prefilled weights, rest timer, plate math, video demos, swap-exercise button.
- **Takeaway for runners:** the recovery-% model is the gem — but its ML/black-box nature is the opposite of deterministic. The *idea* (don't hammer a fatigued muscle group; auto-downgrade intensity) is portable as a simple rule.
- Sources: [Fitbod algorithm blog](https://fitbod.me/blog/fitbod-algorithm/), [Muscle recovery](https://fitbod.me/blog/muscle-recovery/), [Fitbod vs Hevy](https://fitbod.me/blog/fitbod-vs-hevy-9-reasons-fitbod-beats-hevy/).

### 1.2 Boostcamp — curated, coach-authored deterministic programs
- **Library/programs:** 130+ coach-designed routines built-in (nSuns, GZCLP, 5/3/1, Reddit PPL, PHUL, PHAT, etc.). Programs ship with **built-in progressions, periodization, deload weeks**. Free core; Pro adds analytics + exclusive programs.
- **Engine:** **not ML** — these are deterministic, author-defined progression schemes (e.g., 5/3/1's %-of-training-max waves; GZCLP's stage-based double progression with auto-deload on failure).
- **Session UX:** rest timer, **plate calculator**, RPE tracking, exercise demo videos.
- **Takeaway:** proof that runners' best fit is **pre-authored deterministic templates with clear progression rules**, not a recommender. Vorcelab's DUP schema is already this shape.
- Source: [Boostcamp review](https://generationiron.com/boostcamp-app-review/), [boostcamp.app](https://www.boostcamp.app/).

### 1.3 Juggernaut AI — gold standard for RPE autoregulation
- **Engine:** prescribes a **target RPE per set**, not a fixed weight. Logs **target RPE vs actual performance** and **recalibrates next session's loads** from that gap. Adjusts weights/sets/reps/volume to keep the lifter in the optimal zone ("if you beat expectation it pushes harder; if you struggle it backs off").
- **Periodization:** block periodization (accumulation → realization → deload) with autoregulated loads inside blocks.
- **Takeaway:** the **RPE-feedback → next-load** loop is the most copyable autoregulation mechanic, and it can be made fully deterministic (a lookup table). Vorcelab already does a simplified version of this in `computeNextLoad`.
- Source: [JuggernautAI independent review](https://dr-muscle.com/juggernaut-workout-app-review/).

### 1.4 RP Strength (Renaissance Periodization) Hypertrophy App — subjective-feedback volume autoregulation
- **Engine:** deterministic mesocycle (typically 4–6 wk accumulation + deload). After each session user enters **soreness, joint pain, pump quality, workload (how hard the set pushed)**. The algorithm **adds or removes sets next week** based on this feedback (MEV→MAV→MRV logic): recovered + great pump + pushed limits → add sets; sore/under-recovered → hold or cut.
- **Progression:** "volume-first" — sets climb week to week while intensity (%1RM) edges up; deload resets at mesocycle end.
- **Takeaway:** **set/volume autoregulation from cheap subjective signals** (soreness, "how hard") is deterministic and simple. For runners this is gold: you don't want to *add load* on a leg-strength exercise the day after a hard run — you want to *reduce volume*. RP shows how a single self-report can drive volume deterministically.
- Source: [RP Hypertrophy critique](https://dr-muscle.com/rp-hypertrophy-app-critique/), [rpstrength.com](https://rpstrength.com/pages/hypertrophy-app).

### 1.5 Liftosaur — the deterministic, scriptable reference architecture (most relevant to Vorcelab)
- **Engine:** program is **plain text** ("Liftoscript"); finishing a workout **rewrites the text** with new weights/reps/sets → effectively a **state machine**. Fully deterministic and inspectable.
- **Built-in progressions:** (1) **Linear (lp)** — ±fixed amount/% after N attempts; (2) **Double progression (dp)** — increase reps within a range, then reset reps and bump weight; (3) **Reps-sum (sum)** — bump weight if total reps across sets exceeds a threshold.
- **e1RM/RPE:** training max = **90% of 1RM**; 1RM via **Epley**. If weight unspecified, it's pulled from **RPE tables** (e.g., @10 RPE for 12 reps ≈ 65% 1RM). Exposes `RPE[n]`, `completedRPE[n]`, and 1RM of the current exercise to the script. Can gate progression on "all sets completed."
- **Plate rounding:** user declares bar + plates; weights are **rounded to loadable increments**.
- **Session UX:** weights/reps **prefilled** → tap check to confirm; rest timers between sets; failed sets trigger scripted branch (e.g., switch rep scheme / deload).
- **Takeaway:** This is the blueprint for a **simple deterministic engine**: a small set of named progression primitives (lp / dp / reps-sum / %TM) + e1RM + RPE table + plate rounding, all transparent. Vorcelab should converge on exactly this primitive set rather than ad-hoc rules.
- Source: [Liftosaur docs](https://github.com/astashov/liftosaur/blob/master/src/docs/content/docs.md), [Liftoscript](https://www.liftosaur.com/doc/liftoscript), [overview](https://www.liftosaur.com/blog/posts/liftosaur-overview/).

### 1.6 Strong — minimalist logger, manual everything
- **Library:** large; custom exercises. **Warm-up calculator**, supersets, custom rest timers, **e1RM + RPE tracking (Pro)**, advanced charts, plate math, CSV export, Apple Health/Siri.
- **Engine:** **no recommender** — user programs everything; app just logs and computes e1RM/PRs. Deterministic by virtue of being manual.
- **Takeaway:** sets the **logging UX bar**: per-set type (warmup/working/drop/failure), per-exercise rest timers, fast set entry, e1RM/PR surfacing.
- Source: [strong.app](https://www.strong.app/), [Strong vs Setgraph](https://setgraph.app/articles/strong-app-review-is-it-worth-it-honest-comparison-vs-setgraph).

### 1.7 Hevy — the social logger; clean routine builder
- **Library:** 400+ exercises (equipment-free + barbell/db/machine/suspension/bands) with HD demos.
- **Routines:** templates with replace/rearrange/remove/add, **supersets of 2+ exercises**, **per-movement rest timers** (5s–5min), set types (warmup/drop/failure).
- **Engine:** template-driven, **no autoregulation**; manual progressive overload. Strong social layer.
- **Takeaway:** best-in-class **routine builder + automatic per-exercise rest timer** UX; the per-movement rest config (short for isolation, long for heavy) is worth copying.
- Source: [Hevy rest timer](https://www.hevyapp.com/features/workout-rest-timer/), [exercise library](https://www.hevyapp.com/features/exercise-library/), [supersets/routines](https://www.hevyapp.com/features/gym-routines/).

### 1.8 Caliber — human-coach + progressive overload on a fixed exercise set
- **Library:** 500+ exercises with **excellent video tutorials**. Free self-guided tier; paid human coaching (~$200/mo).
- **Engine:** philosophy = **progressively overload a *small handful* of exercises per muscle group, same movements week to week**, adding reps or weight on ≥1 exercise each session. Coach (human) curates around goals/experience/equipment.
- **Takeaway:** validates a **runner-appropriate minimalism** — keep a *small, stable* exercise set and just progress it; don't churn exercises like Fitbod. This is exactly right for runners.
- Source: [Caliber review (BarBend)](https://barbend.com/caliber-fitness-app-review/), [Garage Gym Reviews](https://www.garagegymreviews.com/caliber-app-review).

### 1.9 Freeletics — bodyweight AI coach, coarse feedback loop
- **Engine:** AI Coach trained on 60M+ users; after each session user gives **active feedback (too easy / just right / too hard)** + passive performance signals; next workout auto-adjusts difficulty. Considers age/gender/fitness level/preferences.
- **Focus:** HIIT + **bodyweight** (no equipment) — directly relevant to runners' home/limited-equipment case.
- **Takeaway:** the **3-button difficulty feedback** ("too easy / ok / too hard") is the simplest possible autoregulation UI and maps cleanly to bodyweight/band exercises that have **no kg to log**. Vorcelab needs this for its bodyweight/band/yoga categories where e1RM is meaningless.
- Source: [Freeletics — how the Coach works](https://www.freeletics.com/en/blog/posts/AI-and-your-Coach/).

### 1.10 Ladder — team-based fixed programming (no adaptation)
- **Engine:** choose a coach/team; receive a **fresh weekly plan** (same for the whole team that day). Video demos, rest timers, logging. **Fixed programs — no individual recovery/biometric adaptation.** Social accountability is the product.
- **Takeaway:** mostly a counter-example; reinforces that a fixed weekly template is acceptable if delivery/UX is clean — but it leaves autoregulation on the table.
- Source: [Ladder review (Bustle)](https://www.bustle.com/wellness/ladder-app-review).

### 1.11 Setgraph — speed-logging + Smart Plates
- **Engine:** pure tracker; **rapid set logging**, automatic rest timers, **Smart Plates** (exact plate-loading calculation), filters by rep/weight range, real-time comparison vs last session, daily progress graphs.
- **Takeaway:** **"compare to last session" inline** during logging and Smart Plates are concrete UX wins. Showing the user "+2.5 kg vs last time" at the moment of entry drives progressive overload without any engine.
- Source: [Setgraph strength apps 2026](https://setgraph.app/ai-blog/best-apps-for-strength-training-2026), [Strong vs Setgraph](https://setgraph.app/articles/strong-app-review-is-it-worth-it-honest-comparison-vs-setgraph).

### 1.12 Runna (runner-specific strength) — the direct comparable
- **Engine:** strength plans **designed to complement the running schedule** (build strength without compromising runs). User picks **strength experience level, session duration, available equipment** (down to **zero equipment / all bodyweight**). Workout types: **Legs & Core, Full Body, Upper Body**. Claims runners who add strength are 6% more likely to PB.
- **Takeaway:** This is Vorcelab's closest competitor in positioning. Notably Runna keeps it **coarse and simple** (3 workout types, level + duration + equipment) — validates simplicity. Vorcelab's **focus-category model + co-periodization with the run plan is actually more sophisticated** than Runna here, which is a real differentiator to protect.
- Source: [Runna strength for runners](https://support.runna.com/en/articles/6262149-everything-you-need-to-know-about-strength-training-for-runners), [Runna strength training](https://www.runna.com/training/strength-training).

---

## 2. Cross-App Synthesis — Best Mechanics by Dimension

| Dimension | Best-in-class mechanic | Who does it | Deterministic? | Port to renfo? |
|---|---|---|---|---|
| **Exercise library** | Rich muscle tagging + HD demo video per movement + curated **small stable set** | Caliber (video), Fitbod (tagging) | yes | Demo video gap is renfo's #1 weakness |
| **Exercise selection** | Score by recovery + equipment + split; or **just keep a stable handful and progress it** | Fitbod (ML) vs Caliber (rules) | Caliber yes | Caliber model fits runners |
| **Load progression** | Named primitives: **linear / double-progression / reps-sum / %TM**, e1RM via Epley, RPE table fallback | Liftosaur | yes | Adopt the primitive set |
| **Load autoregulation** | **RPE target → next-load** lookup; AMRAP/Max-Effort to recalibrate e1RM | Juggernaut, Fitbod, Liftosaur | can be | renfo has a simple version; formalize as a table |
| **Volume autoregulation** | **Subjective soreness/"how hard" → add/hold/cut sets** | RP Strength | yes | High value for run-fatigue interaction |
| **No-load exercises** | **3-button "too easy / ok / too hard"** feedback for bodyweight/band/yoga | Freeletics | yes | Fills renfo's bodyweight/yoga gap |
| **Equipment** | Explicit profiles + **substitution to same-muscle alternative** when gear/fatigue blocks | Fitbod, Hevy, Runna | rules yes | renfo has profiles; lacks substitution |
| **Session UX — rest** | **Per-exercise auto rest timer** (short isolation / long heavy), +30s, skip | Hevy, Setgraph | yes | renfo has this; good |
| **Session UX — logging** | Prefilled weights → tap-to-confirm; **inline "vs last session"**; Smart Plates | Liftosaur, Setgraph | yes | Add "vs last session" + plate math |
| **Session UX — structure** | Supersets, warm-up calculator, set types (warmup/working/drop) | Strong, Hevy | yes | renfo lacks supersets/circuits |
| **Periodization** | Authored blocks/mesocycles with **automatic deload weeks** | Boostcamp, RP, Juggernaut | yes | renfo has DUP + deload already |

**The deterministic thesis:** every autoregulation mechanic worth copying (Juggernaut RPE→load, RP soreness→volume, Freeletics 3-button, Liftosaur progression primitives) can be expressed as **transparent lookup tables / if-then rules**. None require ML. The only thing ML buys (Fitbod) is large-library exercise *novelty*, which is exactly what runners DON'T need — they need a small, stable, progressing set.

---

## 3. Critique of Vorcelab's Renfo Module vs Best-in-Class

**What renfo already does well (keep / protect):**
- **Co-periodization with the run plan** (`renfoFusion.ts`): mapping running phase → DUP phase, "hard day hard," ≤1 heavy session/week, avoiding heavy work before key runs. *This is more sophisticated than Runna and is renfo's core differentiator.* Nobody else integrates strength fatigue with a running plan deterministically.
- **Deterministic DUP** (`renfoProgram.ts`): 3-week FORCE/VOLUME/PUISSANCE rotation + 4-week deload extension. Matches Boostcamp/RP philosophy, fully transparent.
- **e1RM via Epley** (`calcE1rm`) + **RPE-based `computeNextLoad`** with 1.25 kg plate rounding. This is a legit, simple autoregulation loop — conceptually identical to Juggernaut/Liftosaur, just lighter.
- **Home/gym equipment profiles** with `isVariantFeasible` / `getBestVariant` priority fallback. Solid; on par with Fitbod/Runna in concept.
- **Session player**: rest timer with audio cues, progress bar, +30s/skip, RPE selector, load prefill. UX is roughly at Hevy/Strong level for a single exercise.

**Gaps vs best-in-class (the critique):**
1. **No demo videos** — "DÉMO À VENIR" placeholders, broken GIF links. Every serious competitor (Fitbod, Caliber, Hevy, Ladder) has HD video + cues. This is renfo's most visible weakness for beginners (and runners ARE strength beginners).
2. **No autoregulation for bodyweight/band/yoga/mobility** — `computeNextLoad` only works on `external_kg`. For `bodyweight_variant`, `band`, and all the yoga/stretching/mobilité focuses there is **no progression signal at all**. Freeletics' 3-button feedback is the missing piece.
3. **No volume autoregulation from run fatigue** — co-periodization places sessions intelligently *in advance*, but once you're in a session the day after an unexpectedly hard run, nothing trims sets. RP's soreness→volume is the deterministic fix.
4. **No exercise substitution / swap-in-session** — if `getBestVariant` returns null (no gear) the exercise is silently dropped; there's no "swap for an equivalent same-muscle movement." Fitbod/Hevy/Runna all let you substitute.
5. **No inline "vs last session" / progressive-overload nudge** at logging time — Setgraph/Strong surface last-time load+reps and PRs right where you enter the number. Cheap, high-impact for adherence.
6. **No supersets / circuits** — mobility, core, and time-pressed runner sessions are naturally circuit-shaped; renfo runs strictly sequential with rest between every set.
7. **No time-per-session budgeting** — Runna lets users pick session duration and scales the workout. renfo has fixed session structures; a runner with 15 min vs 40 min gets the same plan.
8. **e1RM never recalibrated by AMRAP** — `calcE1rm` updates from logged working sets, but there's no periodic Max-Effort/AMRAP test (Fitbod/Liftosaur) to correct drift, and no 1RM test protocol.

---

## 4. Concrete Upgrades for Renfo (prioritized, all deterministic, all simple)

1. **Add a 3-button "trop facile / ok / trop dur" feedback for non-loaded exercises** (bodyweight/band/yoga/mobilité). Map deterministically: *too easy* → progress the variant (next harder `load_variant_option`, +1 rep, or +1 set up to a cap); *ok* → hold; *too hard* → regress variant or −1 rep. This closes the biggest engine gap (Freeletics model) and makes ALL focus categories progress, not just the kg ones.

2. **Generalize `computeNextLoad` into a small set of named progression primitives** (Liftosaur model): `linear` (kg lifts), `double_progression` (reps-in-range → then +load), `rep_progression` (bodyweight: add reps then advance variant), `time_under_tension` (eccentric/core holds: add seconds). Store the chosen scheme per exercise variant. Keeps everything transparent and testable.

3. **Run-fatigue volume autoregulation (RP-style, deterministic).** Before/at session start, derive a single readiness flag from already-known run data (recent long run / hard session / high weekly impact zone) and apply: readiness LOW → drop the last set of heavy exercises and cap RPE at 7; readiness OK → as planned. This extends the existing `weeklyFocuses`/impact-zone logic from *placement* into *in-session volume*.

4. **Exercise substitution.** When `getBestVariant` returns null (or user taps "swap"), offer the next exercise in `SESSION_EXERCISES` sharing ≥1 `primary_muscles` tag and feasible with current equipment. Never silently drop. Tag each exercise with a small `substitutes: string[]` or compute by muscle overlap.

5. **Inline "vs last session" at logging** (Setgraph/Strong). In the active-set stage, show last session's load × reps × RPE for this variant and a delta badge ("+2.5 kg"). Add a Smart-Plates breakdown (e.g., "20 + 5 + 1.25 per side") next to the load input — renfo already rounds to 1.25 kg, so the math is trivial.

6. **Demo media per exercise.** Even short looping clips or annotated stills + the existing `position`/`movement`/`common_errors` cues, surfaced in the active stage. Highest-visibility fix for the runner-beginner audience; fixes the "DÉMO À VENIR" debt.

7. **Periodic e1RM recalibration via optional AMRAP.** Every N weeks (e.g., end of a VOLUME→FORCE transition), prompt one **AMRAP "rep test"** set on a key lift and recompute e1RM via the existing Epley `calcE1rm`. Keeps load suggestions honest without a formal 1RM test.

8. **Session time budget.** Let the user pick a duration (15 / 25 / 40 min) per session; deterministically scale exercise count / sets to fit (drop accessory exercises first, keep the heavy/primary movement). Matches Runna and serves time-pressed runners.

**Sequencing recommendation:** (1)+(2)+(4) are the engine core (make every category progress + never drop exercises); (3) is the unique runner-fatigue differentiator; (5)+(6) are high-ROI UX; (7)+(8) are polish.

---

## 5. Consolidated Sources
- Fitbod: https://fitbod.me/blog/fitbod-algorithm/ · https://fitbod.me/blog/muscle-recovery/ · https://fitbod.me/blog/fitbod-vs-hevy-9-reasons-fitbod-beats-hevy/
- Boostcamp: https://generationiron.com/boostcamp-app-review/ · https://www.boostcamp.app/
- Juggernaut AI: https://dr-muscle.com/juggernaut-workout-app-review/
- RP Strength: https://dr-muscle.com/rp-hypertrophy-app-critique/ · https://rpstrength.com/pages/hypertrophy-app
- Liftosaur: https://github.com/astashov/liftosaur/blob/master/src/docs/content/docs.md · https://www.liftosaur.com/doc/liftoscript · https://www.liftosaur.com/blog/posts/liftosaur-overview/
- Strong: https://www.strong.app/ · https://setgraph.app/articles/strong-app-review-is-it-worth-it-honest-comparison-vs-setgraph
- Hevy: https://www.hevyapp.com/features/workout-rest-timer/ · https://www.hevyapp.com/features/exercise-library/ · https://www.hevyapp.com/features/gym-routines/
- Caliber: https://barbend.com/caliber-fitness-app-review/ · https://www.garagegymreviews.com/caliber-app-review
- Freeletics: https://www.freeletics.com/en/blog/posts/AI-and-your-Coach/
- Ladder: https://www.bustle.com/wellness/ladder-app-review
- Setgraph: https://setgraph.app/ai-blog/best-apps-for-strength-training-2026
- Runna (runner-specific comparable): https://support.runna.com/en/articles/6262149-everything-you-need-to-know-about-strength-training-for-runners · https://www.runna.com/training/strength-training
