# Competitive Research — How Running Apps Implement Strength ("Renfo") for Runners

**Author:** Competitive research (Vorcelab)
**Date:** 2026-06-16
**Scope:** How 18 running/trail/AI-coaching platforms deliver STRENGTH / cross-training ("renforcement musculaire") to runners — programming logic, plan integration, periodization, exercise library, demos, equipment, load/progression, scheduling, and the single biggest weakness of each. Followed by synthesis: best patterns to emulate, market gaps, and where a deterministic, periodization-synced, trail-aware renfo module can win.

> Research method: targeted web research (official sites, app-store listings, support docs, reviews from DC Rainmaker / the5krunner / TechRadar / Tom's Guide, French-language sources for Decathlon/Kiprun, Reddit, Google Play). Where a vendor's site blocked automated fetches (Uphill Athlete 503s, Final Surge JS-rendered, TrainingPeaks 403 on some pages), facts were corroborated from multiple independent extracts and are flagged inline.

---

## How to read the teardown

For each platform: **Delivery model** (canned vs personalized; synced to run plan; phase-aware) · **Exercise library** · **Demos/cues** · **Equipment** · **Load/progression** · **Weekly scheduling** · **Biggest weakness**.

---

## 1. Runna

- **Delivery:** Personalized strength add-on built *into* the run plan (not a static library). User sets experience, goal, equipment, frequency, session length; app builds a tailored program that "integrates directly with your running plan." Two focus modes: **Running Focus** (legs + core, minimal upper) and **All-Round Strength** (full body). Frequency 1–4 sessions/week, with the workout split changing by frequency.
- **Run-aware scheduling (real differentiator):** automatically avoids placing intense strength before key runs; guidance puts leg day 2–3 days before a long run / speed work.
- **Exercise library:** "dozens" of bodyweight + equipment movements across Legs/Core, Full Body, Upper Body, Mobility & Conditioning. No exact count published.
- **Demos/cues:** video demo for every movement + step-by-step text + in-app form cues. No audio coaching for strength.
- **Equipment (broadest of the consumer apps):** bodyweight, bands, dumbbells, kettlebells, barbells/benches, Swiss ball, box, pull-up bar, or full gym — "adapts to what you have."
- **Load/progression:** RPE-style autoregulation — pick a weight where you'd have 1–2 reps in reserve, ~85–95% of max for the prescribed reps; progress via load, reps, slower tempo, or harder variation. Structured warm-up → compound + isolation → cooldown.
- **Weekly scheduling:** 1–4 sessions auto-placed around key runs.
- **Biggest weakness:** **No explicit periodization synced to the run macrocycle** (base/build/peak/taper) and **no progressive-overload memory** — it's RPE-by-feel, not a logged load history. Strength is secondary in reviews. (Context: Strava agreed to acquire Runna in 2025.)
- Sources: https://www.runna.com/training/strength-training · https://support.runna.com/en/articles/6262149-everything-you-need-to-know-about-strength-training-for-runners · https://support.runna.com/en/articles/8216254-choosing-your-strength-goal-and-training-frequency · https://www.autonomous.ai/ourblog/runna-app-review-what-training-with-runna-is-really-like · https://www.techradar.com/health-fitness/fitness-apps/runna-review

---

## 2. adidas Running (Runtastic)

- **Delivery:** Split across two apps. Strength lives in the separate **adidas Training** app; **adidas Running** offers a "Running Strong" plan (flexibility, core/leg, recovery). Linked by shared account/ecosystem, **not** one integrated plan. adidas Training builds plans from bodyweight level/goals/availability (2–5 workouts/week).
- **Exercise library:** 180+ HD bodyweight workout videos across strength, cardio, yoga, flexibility.
- **Demos/cues:** HD trainer video demo for every exercise (its strongest dimension) + text.
- **Equipment:** bodyweight-first; some dumbbell/band options; not a barbell/gym platform.
- **Load/progression:** bodyweight progression (reps/time/difficulty). Premium unlocks "personalized strength plans," but reviewers note it lacks individualized progression. No RPE/load scheme.
- **Weekly scheduling:** 2–5 sessions/week in adidas Training; Running Strong slots supportive work in adidas Running — but the two apps don't co-periodize one calendar.
- **Biggest weakness:** **Strength and running are effectively two disjoint products**; strength is bodyweight-centric with no run-plan integration and no load periodization.
- Sources: https://www.treadmillreviews.net/adidas-runtastic-app/ · https://runtastic-results-training-app.en.softonic.com/android · https://www.adidas.com/us/stay_active_workout_creator · https://dr-muscle.com/adidas-training-app/

---

## 3. Nike Run Club (+ Nike Training Club)

- **Delivery:** Most loosely coupled. NRC run plans contain no real strength; on recovery days they *suggest* a Nike Training Club (NTC) routine or a rest day. Strength is fully offloaded to NTC, with only activity-history syncing.
- **Personalization:** Templated, not adaptive — NTC sorts you into beginner/intermediate/advanced and serves a fixed pre-recorded sequence. It does **not** recalibrate to skipped sessions or fatigue ("sequencing, not personalization").
- **Exercise/workout library:** 185–190+ free workouts (strength, HIIT, core, yoga/pilates, mobility), programs typically 4–6 weeks, 15–45 min.
- **Demos/cues:** Trainer-led full video sessions with audio coaching — the most "follow-along studio" feel; one reviewer mocked the dated production.
- **Equipment:** bodyweight-only and full-equipment options both available.
- **Load/progression:** follow-along, time/rep prescribed; no RPE, no auto-progression, no overload tracking.
- **Weekly scheduling:** strength days are *recommendations*, not prescribed sessions in the run calendar.
- **Biggest weakness:** **Strength is fully decoupled from the run plan and static/non-adaptive** — no integration, no progression, no periodization; strategically an afterthought to selling NRC running.
- Sources: https://www.nike.com/pdf/Nike-Run-Club-Marathon-Training-Plan-Audio-Guided-Runs.pdf · https://www.nike.com/running/marathon-training-plan · https://apps.apple.com/us/app/nike-training-club/id301521403 · https://dr-muscle.com/nike-training-club-app-review/

---

## 4. Garmin (Garmin Coach / Strength Coach / Connect strength)

- **Delivery:** Most technically sophisticated, uneven. Three pieces: (1) **Connect strength workouts** — huge free library, manual/scheduled; (2) **Garmin Run Coach** — adaptive run plan with a toggle to layer *supplemental* strength (bodyweight-only OR full gym); (3) **Strength Coach / Fitness Coach** (newer, Fenix 8 / FR 970 / recent Venu & Vivoactive) — dedicated periodized strength + hybrid cardio+strength.
- **Periodization (the only consumer app with explicit strength periodization):** Strength Coach uses **accumulation → intensification → deload** phases; run plans run base→build→peak→taper→race; adaptive Fitness Coach blends cardio+strength and adjusts via Body Battery/HRV, tapering strength near race day.
- **Exercise library — deepest:** reported ~1,500+ exercises ("one of the largest native databases in consumer wearables"), auto muscle-group attribution, post-session muscle map. Filter by type/difficulty/muscle/goal/duration.
- **Demos/cues:** animated exercise demos in Connect and on select watches; real-time rep/HR via Connect+ Live Activity. Animations attach to Garmin's pre-built workouts, **not** user-built customs. Auto-rep detection counts after ~4 consistent reps; unreliable on legs/compound/asymmetric moves.
- **Equipment:** bodyweight or full gym (toggle); watch can't measure load.
- **Load/progression:** EPOC-based load across modalities; plans recalibrate to missed/exceeded targets. **Major gap: no progressive-overload memory** (doesn't surface previous weights/reps when logging).
- **2026 roadmap:** Garmin is surveying eight neuromuscular features — Neuromuscular Readiness, Neuromuscular Training Effect, Acute Strength Load, Muscle Map for Recovery, Strength Balance Score, Strength Primary Benefit, Strength/Cardio Load Ratio, per-activity Muscle Map — likely behind Connect+ paywall.
- **Weekly scheduling:** strength auto-scheduled within the adaptive plan; rest inserted after poor sleep/heavy load; only one Coach plan at a time.
- **Biggest weakness:** **Hardware can't measure strength work** — unreliable auto rep-counting, no overload memory, training-load model undervalues strength vs cardio, no per-muscle recovery modeling, best features gated to newest devices.
- Sources: https://the5krunner.com/2026/04/02/garmin-strength-training-features-survey/ · https://garminrumors.com/overview-of-garmin-coach-plans-adaptive-training-plans-for-every-athlete/ · https://www.garmin.com/en-US/blog/general/pre-made-workouts-from-garmin-connect/ · https://support.garmin.com/en-US/?faq=IPD6X8JSLBAUQOXvz7zBO6

---

## 5. TrainingPeaks

- **Delivery:** Templated AND personalized but **coach-driven**. Launched a dedicated **Strength Workout Builder** (2024) — coaches/Premium athletes build structured strength (single exercises, supersets, warm-ups, cooldowns) on the web app. Self-coached athletes can buy canned plans from the marketplace. **Not phase-aware on its own** — periodization comes from the coach/purchased plan, not an algorithm.
- **Exercise library — richest:** **1,000+ exercises with 1,000+ form-cue videos**; custom exercises with own YouTube/Vimeo videos.
- **Demos/cues:** 1,000+ form-cue videos; custom exercises support text + video URL. No animation/audio.
- **Equipment:** not formally categorized; implied by exercise choice.
- **Load/progression:** structured reps + weight fields; RPE/rest/rep-range/tempo/RIR largely via **Coach Notes free-text** rather than fully structured per-set fields. **No auto-progression** — completed reps/weight logged for trend tracking, but progression is manual.
- **Weekly scheduling:** strength lives on the same unified calendar as runs; coaches drag from Workout Library onto days.
- **Biggest weakness:** **Strength workouts can't be exported/pushed to 3rd-party devices** (no on-watch guidance during a session); it's a programming tool, not an adaptive coach — no built-in periodization/auto-progression. Value depends entirely on a coach or purchased plan.
- Sources: https://www.trainingpeaks.com/strength-athlete/ · https://www.trainingpeaks.com/strength/ · https://help.trainingpeaks.com/hc/en-us/articles/21397126893581-Using-the-Strength-Workout-Builder · https://www.prnewswire.com/news-releases/trainingpeaks-muscles-up-with-new-strength-feature-302206105.html · https://help.trainingpeaks.com/hc/en-us/articles/204072434-Workout-Libraries

---

## 6. Final Surge

- **Delivery:** **No native strength engine.** Structured Workout Builder supports only endurance target types (HR, Power, Pace/Speed) — no strength type, no exercise DB, no sets/reps fields. Strength delivered as **attachments** (videos/images/PDFs embedded from YouTube/Vimeo/Dropbox/Drive) + written notes, or via purchased third-party plans (e.g. Luke Humphrey "Strength for Runners," NAZ Elite).
- **Exercise library:** none native; depends on whatever the plan author attaches.
- **Demos/cues:** whatever the coach embeds — typically full-session videos, not per-exercise structured demos.
- **Equipment / progression:** plan-dependent; **no structured load/rep/RPE tracking** for strength; logging via generic notes.
- **Weekly scheduling:** strength days sit on the shared calendar, any day — generic slot, not intelligent placement.
- **Biggest weakness:** **No native strength data model at all** — weakest for genuine strength programming.
- Sources: https://blog.finalsurge.com/coach-feature-building-using-structured-workouts-with-multiple-target-types/ · https://blog.finalsurge.com/introducing-videos-attachments-for-workouts/ · https://www.finalsurge.com/coach/lukehumphreyrunning/plan/4995

---

## 7. Stryd

- **Delivery:** Running-power platform; **no dedicated strength product.** Strength appears as optional "Supplementary Activities and Notes" on Palladino-designed plans. The run side is adaptive (power scales with Critical Power); the supplemental strength is **text notes + video links**, not structured/tracked workouts. Loosely phase-aware (notes at block starts; load sequenced vs run load).
- **Exercise library:** modest fixed set — Drills, Strength, Stretch/Mobility, Plyometrics, Cross-Training. No catalog/count.
- **Demos/cues:** video links within plan notes; no interactive in-app viewer.
- **Equipment:** essentially bodyweight / running-specific.
- **Load/progression:** none for strength (auto-progression applies only to running power via Critical Power).
- **Weekly scheduling:** supplemental work sequenced against run load (light on easy days, heavier on hard days; plyos avoided on recovery).
- **Biggest weakness:** **Strength is an optional afterthought** delivered as static text/video notes — no tracking, structure, progression, or real periodization; often consumed via TrainingPeaks/Final Surge export where notes don't even render as workouts.
- Sources: https://help.stryd.com/en/articles/7065214-stryd-training-plans-by-steve-palladino · https://blog.stryd.com/2020/10/08/closer-look-training-plans/ · https://help.stryd.com/en/articles/8928069-final-surge-and-stryd

---

## 8. Coopah

- **Delivery:** Best *consumer* integration — **Strength & Conditioning baked into every plan**, auto-scheduled alongside runs, targeting runner weak spots (knees, ankles, hips). Personalization is plan-level + human touchpoints (weekly Coach's Report, check-ins, 1:1 calls). Phase-awareness modest/implicit (woven through periodized run plan; marketed as consistent injury-prevention S&C, ~2 sessions/week ~30 min).
- **Exercise library:** runner-focused S&C + yoga, mobility, shakeout routines; exact count not public.
- **Demos/cues:** **GIF demonstrations** per exercise with prescribed reps/sets shown. No audio coaching.
- **Equipment:** bodyweight-first (gym-optional); coach recommends optional dumbbells/kettlebells/bands.
- **Load/progression:** sets/reps shown per exercise; **no RPE or auto-progression** — progression baked into plan structure.
- **Weekly scheduling:** ~2 strength sessions/week auto-placed; reschedulable; weekly Coach's Report reviews adherence.
- **Biggest weakness:** **Good-but-generic injury-prevention S&C**, not deep progressive-overload/periodized strength; GIF demos (no coaching cues), no load/RPE progression, shallow library vs TrainingPeaks.
- Sources: https://coopah.com/coopah-features/ · https://coopah.com/resources/strength-and-conditioning-for-marathon-runners/ · https://running.reviews/blogs/training/coopah-review · https://play.google.com/store/apps/details?id=com.coopah.app

---

## 9. Campus Coach (Kiprun / Decathlon)

**The strongest, most run-integrated native strength offering found — the bar to beat.**

- **Delivery:** Strength ("renforcement musculaire") is **built into the run/trail plan**, not a separate product. User picks one of **four modes**: **Découverte** (intro, no load/equipment), **Mix** (perf + prevention), **Prévention des blessures** (tendons/joints, adapts to past injuries), **Performance** (general strengthening for times).
- **Phase-aware:** strength is explicitly **disabled during recovery and taper ("affûtage") cycles** — only appears in base/build. Trail offering co-designed with elite ultrarunner Mathieu Blanchard; terrain/vert-aware (5–300 km).
- **Exercise library:** **240+ video exercises** in the trail module.
- **Demos/cues:** video demonstration per exercise.
- **Equipment:** **auto-detects available home equipment** and adapts; nothing mandatory.
- **Load/progression:** **four intensity levels** (léger/modéré/intense/maximal) with a **post-session RPE feedback loop** informing progression; unilateral/core auto-balances both sides.
- **Trail-specificity:** emphasizes **eccentric quad work for descents, ankle/proprioception** (BOSU, unstable surface, single-leg, eyes closed).
- **Weekly scheduling:** session lengths 20–30 / 30–45 / 45–60 min; frequency scales by mode (Découverte 1/wk → Performance 2/wk), scheduled around the run plan.
- **Biggest weakness:** plans cap at **27 weeks**, **can't insert intermediate B-races** into a trail plan; volume "perfectible" for advanced; strength somewhat all-or-nothing per cycle (off entirely in recovery/taper).
- Sources: https://faq.campus.coach/fr/article/comment-fonctionne-le-renforcement-musculaire-sur-campus-qwtxxs/ · https://athleexplique.fr/avis-campus-coach/ · https://www.campus.coach/blog/renforcement-musculaire-trail · https://www.campus.coach/blog/trail-running-bien-courir-descente

---

## 10. Kiprun Pacer (free Decathlon/Kiprun app)

- **Delivery:** Free sibling to Campus Coach; strength offered as a **complement scheduled on no-run days** rather than tightly periodized. Part of a holistic bundle (nutrition, hydration, strengthening, recovery, mental prep).
- **Exercise library / demos:** video demonstrations + stretching advice; smaller/less documented than Campus Coach's 240.
- **Equipment / progression / scheduling:** largely templated, slotted into rest days; little public detail on RPE/auto-progression. Free.
- **Biggest weakness:** **strength is bolt-on rather than periodized** — fills empty days; thinner library/personalization than paid Campus Coach.
- Sources: https://pacer.kiprun.com/en · https://athleexplique.fr/test-decathlon-pacer-lapp-de-coaching-la-plus-complete-du-marche/

---

## 11. Decathlon Coach (multisport fitness app)

- **Delivery:** General fitness app where running and strength coexist but are **not integrated**. Strength programs are standalone routines (e.g. "Renforcement musculaire" = 6 weeks, ~7 sessions/week, 42 workouts, beginner). Fixed template, **no sync to run periodization**.
- **Exercise library:** very broad — **500+ coached sessions, 350+ programs**, with/without equipment, 80+ sports.
- **Demos/cues:** strong — **voice coach + exercise videos**, form/safety emphasis.
- **Equipment:** tiered (mat/towel/bottle early → dumbbells later); many programs equipment-optional.
- **Load/progression:** time-based escalation (12–13 → ~19 min); fixed reps within template; beginner/intermediate/advanced levels.
- **Biggest weakness:** **strength and running are siloed** — templated fitness library, not a periodized runner's plan; no phase-awareness, trail-specificity, or run-load-tied progression.
- Sources: https://www.decathloncoach.com/fr/home/coaching/sport-program/fd0b713f06af7cb710477fe1e2624f0c · https://apps.apple.com/fr/app/decathlon-coach-sport-running/id495106186

---

## 12. Strava (strength / cross-training)

- **Delivery:** After a **May 2026 overhaul**, strength is a **first-class activity to LOG — not programming/coaching**. New tooling records sets/reps/weight, review/repeat past sessions, auto-populated **muscle maps**. **No personalization, plan, periodization, or run-plan sync.**
- **Exercise library / demos / progression:** **none** — no demos, form guidance, programming, or progression logic.
- **Equipment:** agnostic — logs whatever you did.
- **Partner ecosystem (its real strategy):** 14 integrations auto-sync strength from elsewhere — **Garmin, Amazfit, COROS, WHOOP, Runna, Fitbod, Hevy, JEFIT, Caliber, iFIT, Liftoff, Motra, REMAKER, 24 Hour Fitness**. Strava is the aggregation/social hub; coaching lives in partners. 500M+ strength activities logged in 2025.
- **Biggest weakness:** **It doesn't tell you what to do** — no prescriptive plan, no demos, no run-periodization integration; a journal/hub, not a coach.
- Sources: https://press.strava.com/articles/strava-overhauls-strength-experience-with-expanded-partner-ecosystem-new-workout-log-and-muscle-maps · https://9to5mac.com/2026/05/21/strava-adds-dedicated-strength-training-support-for-sets-reps-weight-and-muscle-groups/ · https://the5krunner.com/2026/05/21/strava-strength-training/

---

## 13. Vert.run (trail)

- **Delivery — two distinct tiers:**
  - **(a) In-app strength in Vert PRO (~$9.90/mo) — templated.** "Strength and injury prevention" built into the plan, framed as climbing/descending/durability. Plans flexible (swap workouts, add recovery weeks, custom workouts; smart adjustments to race schedule/life). **But marketing is opaque** on library size, demos, RPE/rep schemes, or strength frequency.
  - **(b) Separate 1:1 Strength Coaching add-on (~$39/mo) — fully personalized.** Human coach: 30-min onboarding call + questionnaire (history, weaknesses, pain, injuries); custom plan adjusted to running load and races; run & strength coaches coordinate; genuinely periodized/season-aware. ~$64/mo bundled with run coaching.
- **Trail-specificity:** markets strength "for climbing, descending, durability"; the public training guide details phase-aware blocks (Base 2–3×, Build 2×, Peak 1–2×, Race week 0–1), eccentric calf lowers / slow lowering for downhill braking, single-leg + posterior chain + calf/ankle + core categories, and "change one variable at a time" non-linear progression.
- **Reception:** 130k+ users, Trustpilot ~4.7; praised for responsive coaches/flexible plans.
- **Biggest weakness:** **two-tier confusion + cost/opacity** — real personalization needs the separate $39/mo human add-on; bundled-PRO strength is under-documented.
- Sources: https://vert.run/ · https://vert.run/strength-training/ · https://vert.run/strength-training-for-runners/ · https://vert.run/frequently-asked-questions/ · https://play.google.com/store/apps/details?id=run.vert.app

---

## 14. Uphill Athlete

- **Delivery:** Most rigorous *phased* strength model, but **program/course-based and manual**, not an adaptive app syncing to a live run plan. Phases worked backward from the A-race: **General Strength (4–12 wk) → Max Strength (8–12 wk) → Muscular Endurance (8–16 wk) → Maintenance**.
- **Exercise library / demos:** video-guided at-home (Chamonix Mountain Fit, 2×/week, taught by PT Neil Maclean-Martin) + gym ME workouts + weighted hill climbs.
- **Equipment:** at-home bodyweight up to gym barbell (Max Strength).
- **Load/progression:** classic mountain-athlete periodization (max strength → convert to muscular endurance); manual, coach-/book-driven.
- **Trail-specificity:** strongest conceptual model for vert/mountain (ME, weighted climbs, eccentric loading).
- **Biggest weakness:** **manual and course/program-based** — no app that auto-syncs the phased strength to your live, adapting run plan.
- Sources: https://uphillathlete.com/strength-training/general-strength-routine/ · https://uphillathlete.com/strength-training/strength-training-for-the-mountain-athlete/ · https://uphillathlete.com/strength-training/muscular-endurance-for-mountain-athletes/ · https://uphillathlete.com/product/at-home-strength-training-program/
- *(Caveat: site returned HTTP 503 to direct fetches; details from corroborated search extracts.)*

---

## 15. TrainAsONE

- **Delivery:** Running-only adaptive engine; **no real in-app strength product.** The AI inserts cross-training/strength/rest *days* to prevent overuse, but **does not prescribe exercises, sets, or reps** — actual strength guidance lives in FAQ/blog content, not the plan engine.
- **Periodization:** run plan continuously re-optimized to a load "Sweet Spot," but **strength is not periodized** — it's a recovery/injury-prevention insert.
- **Exercise library / demos:** none in-app; FAQ recommends categories only (compound lifts + plyometrics). No video/animation/audio.
- **Equipment / load / progression:** not configurable; no RPE/rep/auto-progression; generic "2–3 sessions/week" advice.
- **Biggest weakness:** **Strength is a content/scheduling afterthought, not a feature** — a "do some strength today" slot plus a blog article, nothing actionable in-app.
- Sources: https://trainasone.com/ · https://trainasone.com/ufaq/why-should-i-consider-adding-strength-training-to-my-running-plan/ · https://umit.net/trainasone-2025-review/
- *(Caveat: trainasone.com 403s automated fetches; triangulated from FAQ text + reviews.)*

---

## 16. Humango (AI coach "Hugo")

- **Delivery:** Strength is **scheduled into** the adaptive multi-sport plan and Hugo can "customize" it — a hybrid library + customization model producing sessions "not things I would have done on my own." Strongest *implied* integration of the AI trio: it adjusts cycling/running around the strength work.
- **Periodization:** woven into the multi-sport adaptive plan (off-season vs in-season distinction noted), but explicit base/build/peak/taper strength periodization not documented.
- **Exercise library:** exists and is customized against, but **depth/count undisclosed.**
- **Demos/cues:** **not confirmed** — no explicit strength video demos/audio cueing; Hugo gives text feedback.
- **Equipment:** bodyweight-friendly philosophy; no documented equipment-filter UI.
- **Load/progression:** rep-based examples ("10–12 reps, 3–4 sets," form over weight, 1–2×/week); **no explicit RPE or auto-progression.**
- **Weekly scheduling:** real adaptive integration — enter available time, Hugo builds/re-adjusts around schedule + synced wearables (Garmin/Apple/Suunto/Strava/Polar).
- **Biggest weakness:** **Execution/UX and opacity** — reviewers report adaptation "not THAT smart," buggy data integration, cut-off instructions; strength feels underdeveloped vs run/cycling modules; demos absent.
- Sources: https://apps.apple.com/us/app/humango-ai-training-planner/id1554430755 · https://humango.ai/strength-training-for-endurance-athletes/ · https://humango.ai/how-it-works/athletes · https://fueledbylolz.com/2024/08/28/humango-review/

---

## 17. Athletica.ai (Andrew Coggan / coach "MJ")

**Most structured/credible strength of the AI trio — but a curated templated library, not AI-generated bespoke strength.**

- **Delivery:** Curated **"Global Library"** of pre-built strength sessions the user search-filters and **drag-and-drops** into the adaptive plan (categories: Movement Intro, Strength & Plyo, Station Chains / Strength Progressions; HYROX set = 58+ exercises). The AI adapts the *surrounding* endurance plan and can cancel sessions on recovery signals, but **does not auto-author the strength session.**
- **Periodization:** Yes, explicit — "**one [session] in base, two in build, zero during race week**," 2×/week non-consecutive, for ≥6 months lifting history.
- **Exercise library:** curated full-body circuits (push/pull/hinge/squat/carry); 58+ HYROX, keyword-categorized.
- **Demos/cues — strongest of the trio:** every session has an inline **demo video with form cues, common faults, scaling options** (Coach MJ), watchable in-app.
- **Equipment:** pragmatic — most need only kettlebells/dumbbells/box; "Show Details" toggle to check equipment; bodyweight-first scaling.
- **Load/progression:** **RPE-anchored** (e.g. beginner "RPE ≤ 6"; "4 reps @ RPE 8 × 3 sets"). AI cross-checks RPE + comment sentiment vs nocturnal HRV/RHR to autoregulate the overall plan (can cancel sessions). **No strength-specific auto-progression** — progression is user-driven within RPE guidance.
- **Weekly scheduling:** "Plan Your Week" drag-and-drop; strength alongside run/bike/row. UX gap: users report generated plans sometimes contain no strength (must add it).
- **Biggest weakness:** **Strength is opt-in/templated, not adaptive** — you self-discover and drag sessions in, content skews HYROX/hybrid (not purpose-built run-economy strength), and there's no true strength auto-progression.
- Sources: https://athletica.ai/hyrox-strength-training-athletica-global-library/ · https://athletica.ai/ · https://www.trainerroad.com/forum/t/another-ai-training-app-athletica-ai/82882

---

## 18. Benchmark specialists (not run-coaches)

- **Pliability** — mobility/recovery, **not strength.** 1,700+ guided routines, PT-built, 12–20 min; official HYROX stretching partner; 3-min mobility assessment → custom recs; syncs WHOOP/Garmin/Apple Health; pairs plyometric progressions with recovery protocols *as content/guidance*, not loaded strength. **No resistance programming/progression** — a complement, not a strength solution.
  - Sources: https://pliability.com/stories/best-flexibility-apps · https://pliability.com/stories/best-plyometrics-for-runners · https://pliability.com/sports/running

---

## Cross-platform comparison

| Platform | Native strength engine | Synced to run plan | Phase-aware (periodized) | Library + demos | Load/progression | Trail-specific | Biggest weakness |
|---|---|---|---|---|---|---|---|
| **Runna** | Yes (personalized) | Yes (run-aware) | Weak/unclear | Dozens, video+text | RPE 85–95%, no history | No | No periodization / no load history |
| **adidas** | Yes (separate app) | Loose (2 apps) | No | 180+ HD videos | BW reps/difficulty | No | Two disjoint products |
| **Nike (NRC/NTC)** | Yes (separate app) | Loose (suggested) | No | 185–190+, video+audio | Time/reps, fixed | No | Decoupled, static templates |
| **Garmin** | Yes (toggle/adaptive) | Yes (adaptive) | **Yes** (accum/intens/deload) | ~1,500, animations | EPOC load, no overload memory | No | Hardware can't measure load |
| **TrainingPeaks** | Yes (builder) | Coach-driven | Manual (coach) | **1,000+ videos** | reps/weight + notes, manual | No | No device export; manual |
| **Final Surge** | No (attachments) | Plan-driven | No | None native | None | No | No strength data model |
| **Stryd** | No (notes) | Sequenced | Loosely | Small fixed set | None (runs only) | No | Afterthought text/video notes |
| **Coopah** | Yes (integrated) | Yes (auto-sched) | Modest/implicit | Runner S&C + yoga, GIFs | sets/reps, no auto | No | Generic, no overload progression |
| **Campus Coach** | **Yes (4 modes)** | **Yes** | **Yes** (off in recovery/taper) | 240+ videos | 4 levels + RPE loop | **Yes** (eccentric/ankle) | 27-wk cap, no B-races |
| **Kiprun Pacer** | Light | Loose (rest-day) | No | Videos, small | Templated | Some | Bolt-on, not periodized |
| **Decathlon Coach** | Yes (templated) | No (siloed) | No | 500+, voice+video | Time escalation | No | Strength ≠ run plan |
| **Strava** | No (log only) | No | No | None | None (logging) | No | Doesn't prescribe anything |
| **Vert.run** | Yes (PRO templated) | Yes (coached tier) | Yes (coached/guide) | Opaque (PRO) | Coach-set (human) | **Yes** (framing) | Real strength paywalled separately |
| **Uphill Athlete** | Yes (program) | Manual | **Yes** (strongest model) | Video at-home + gym | Max-strength → ME | **Yes** (mountain) | Manual, not app-synced |
| **TrainAsONE** | No (placeholder days) | Day-slot only | No | None | None | No | Strength is an afterthought |
| **Humango** | Yes (Hugo customizes) | Yes (adaptive) | Implied | Undisclosed, no demos | reps, no RPE/auto | No | Buggy/opaque, no demos |
| **Athletica.ai** | Templated library | Yes (drag-drop) | **Yes** (base/build/race-wk) | 58+ HYROX, inline video | **RPE + HRV autoreg** (plan-level) | No (HYROX skew) | Opt-in, no strength auto-progress |
| **Pliability** | No (mobility only) | No | No | 1,700+ mobility | n/a | No | Not a strength tool |

---

## Synthesis

### A. Best patterns to emulate (steal these)

1. **Native, run-aware scheduling (Runna, Campus Coach, Coopah):** strength auto-placed around key runs; never hard legs the day before a key session or in taper. Campus Coach's rule — **strength OFF during recovery/taper cycles** — is the cleanest expression of phase-awareness.
2. **Phase-periodized strength tied to the run macrocycle (Garmin, Uphill Athlete):** accumulation → intensification → deload, or General Strength → Max Strength → Muscular Endurance → Maintenance worked backward from the A-race. Garmin is the only consumer app doing accum/intens/deload; Uphill Athlete is the gold-standard conceptual model, especially for mountain/trail (ME, weighted climbs).
3. **Mode-based goals + equipment auto-adaptation (Campus Coach, Runna):** Discovery / Injury-Prevention / Performance / All-Round modes, with the engine auto-detecting available equipment and substituting movements. Lowers onboarding friction massively.
4. **RPE / autoregulated load (Runna 85–95% + RIR; Campus Coach 4 intensity levels + post-session RPE loop):** a deterministic, device-free way to prescribe and progress load without needing a power meter or smart weights.
5. **Deep, video-cued, filterable exercise library (TrainingPeaks 1,000+, Garmin ~1,500, Decathlon Coach voice+video):** demos with form cues are table stakes; filterable by muscle/equipment/goal/duration is the differentiator.
6. **Trail/vert specificity (Campus Coach, Vert.run, Uphill Athlete):** eccentric quad/calf for descents, ankle proprioception (BOSU, single-leg, eyes-closed), posterior chain for climbs, muscular endurance + weighted hill climbs.
7. **Aggregation/social proof (Strava):** logging + muscle maps + shareables drive engagement; being a Strava *partner* (auto-sync programmed strength) is now a distribution channel.

### B. Common market gaps (nobody does these well together)

- **G1 — No app unifies all three:** truly run-plan-periodized + personalized + with proper progressive-overload load tracking and high-quality demos. Garmin has periodization but bad load capture; Runna has personalization but no periodization/history; TrainingPeaks has the library but it's manual and won't push to a watch; Athletica.ai has RPE+HRV autoregulation and inline demos but only at the *endurance-plan* level — the strength session itself is a static drag-and-drop template you self-select, with no strength-specific auto-progression.
- **G2 — Progressive-overload memory is almost universally missing.** Garmin, Runna, Coopah, Nike — none surface "last session you did X kg × Y reps, today add Z." This is the #1 strength-coaching primitive and it's wide open.
- **G3 — Trail/eccentric specificity is shallow.** Only Campus Coach, Vert.run, Uphill Athlete even address downhill eccentric loading and ankle stability — and none deterministically dose it against the plan's vert/descent demands.
- **G4 — On-device guidance during strength is broken.** TrainingPeaks won't export strength to watches; Garmin animations only attach to its own pre-builts. A clean phone-led, set-by-set guided session with rest timers and demos is still rare outside Coopah/Nike.
- **G5 — Periodization is binary, not graded.** Campus Coach turns strength fully OFF in taper; smarter is a graded deload (maintenance dose) rather than all-or-nothing.
- **G6 — French/EU trail audience underserved by depth.** Campus Coach leads but caps at 27 weeks and blocks B-races; the localized, trail-native, deeply-periodized niche is contestable.

### C. Where a deterministic, periodization-synced, trail-aware renfo module can WIN (concrete opportunities)

1. **Deterministic phase engine that mirrors the run macrocycle.** Auto-map renfo blocks (General Strength → Max Strength → Muscular Endurance → graded Maintenance) onto the existing run periodization, with a *graded* taper (maintenance dose, not OFF) — beating Campus Coach's binary on/off and matching Uphill Athlete's rigor inside a live, adapting plan.
2. **Progressive-overload memory + autoregulation.** Log every set (kg × reps × RPE), then deterministically prescribe next session's load ("last: 3×8 @ RPE7 → today 3×8 +2.5 kg"). Combine Runna's 85–95%/RIR cueing with the load history that Garmin/Runna both lack — closing G2.
3. **Trail-/vert-aware dosing.** Read the plan's upcoming descent/vert load and deterministically inject eccentric quad/calf and ankle-proprioception work ahead of big-descent races; ramp eccentric volume in build, protect quads pre-race. No competitor doses eccentric work against actual course demands (G3).
4. **Run-aware micro-scheduling with conflict rules.** Hard codify "no heavy lower-body within N hours of key runs / long run next day → core+upper or easy calf/foot work only" (Vert.run's recovery-timing logic, made deterministic).
5. **Equipment auto-substitution graph.** Like Campus Coach: detect available equipment and swap movements along an equivalence graph (barbell ↔ dumbbell ↔ band ↔ bodyweight), so the same periodized stimulus is hit regardless of kit.
6. **Phone-led guided sessions with form-cued demos + rest timers** (close G4) — and offer optional **Strava partner auto-sync + muscle maps** for distribution/engagement (emulate Strava's hub play without ceding the coaching layer).
7. **Graded readiness/deload modulation — extended to the strength SESSION, not just the plan.** Athletica autoregulates the endurance plan from RPE + HRV but leaves the strength session static; close that gap by using the same deterministic inputs (recent run load, sleep/HRV if available, post-session RPE) to scale *today's renfo dose and load* up/down — a transparent, rules-based alternative to Garmin's opaque EPOC model and the missing half of Athletica's autoregulation.
8. **Injury-history-aware prevention track.** Like Campus Coach's Prevention mode, but deterministic: map a user's past injury sites to a prescribed prehab movement set woven through every block (Achilles/calf, ITB/glute, ankle, hamstring).

### D. One-line positioning for Vorcelab

> *The only renfo module that is **deterministically periodized to your run macrocycle**, **trail/eccentric-aware**, **progressive-overload-tracked**, and **equipment-adaptive** — combining Garmin's periodization, Uphill Athlete's mountain-strength rigor, Runna's autoregulation, and Campus Coach's run-integration, while fixing the load-memory and graded-taper gaps none of them solve.*
