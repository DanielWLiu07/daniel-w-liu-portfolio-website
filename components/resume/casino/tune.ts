'use client'

/**
 * Live layout knobs for the casino set. Values come from URL params (?chip=1.6&table=9.5...),
 * and with ?tune a slider panel edits them in place. A tiny external store so the scene
 * (inside the Canvas) and the panel (DOM) share one source without prop drilling.
 */
import { useSyncExternalStore } from 'react'
import { isJackEditor, jackEditorTime } from './jack-editor-clock'
import { isTitleEyeEditor } from './title-eye-layout'
import { DEALER_DEFAULTS, DEALER_RANGES, DEALER_MOTION_DEFAULTS, DEALER_MOTION_RANGES, type DealerControls, type DealerMotionControls } from './dealer-layout'
import { IMPACT_DURATION, IMPACT_PLACEMENT_AGE } from './impact-eye-motion'
import { JACK_COMPOSITION, JACK_SEED_LEAD } from './jack-composition'
import { BACKDROP_STYLES } from './intro-backdrop-art'

export interface Tune extends DealerControls, DealerMotionControls {
  bgStyle: number
  bgStrength: number
  bgDetail: number
  bgMotion: number
  bgGlow: number
  /** Camera-facing royal flush accompanying the chip on the right. */
  rfSize: number
  rfX: number
  rfY: number
  rfDepth: number
  rfTilt: number
  rfYaw: number
  rfBank: number
  rfScaleX: number
  rfScaleY: number
  rfScaleZ: number
  rfSpread: number
  rfArc: number
  rfDelay: number
  rfEnter: number
  rfExit: number
  rfDrift: number
  rfBob: number
  rfBobSpeed: number
  rfStagger: number
  rfEnergy: number
  rfFlow: number
  rfFlowSpeed: number
  rfSway: number
  rfSwaySpeed: number
  rfTextX: number
  rfTextY: number
  rfTextSize: number
  rfTextR: number
  rouTextX: number
  rouTextY: number
  rouTextSize: number
  rouTextR: number
  /** Roulette travelling beside the rising hero chip; offsets in frame half-extents. */
  rouSize: number
  rouX: number
  rouY: number
  rouTilt: number
  rouBank: number
  rouYaw: number
  rouDepth: number
  rouScaleX: number
  rouScaleY: number
  rouScaleZ: number
  rouSway: number
  rouSwaySpeed: number
  rouDelay: number
  rouEnter: number
  rouExit: number
  rouDrift: number
  rouWheel: number
  rouBall: number
  /** chip diameter multiplier */
  chip: number
  /** hero chip resting position on the felt; negative Z is away from the viewer */
  chipX: number
  chipZ: number
  /** table diameter (world units) */
  table: number
  /** rail width past the felt */
  rail: number
  /** dealer edge offset behind the arc centre (negative = away from camera) */
  chord: number
  /** camera height above the felt */
  camY: number
  /** camera distance toward the viewer */
  camZ: number
  /** height of the camera's aim point above the felt */
  lookY: number
  /** the one lamp: height above the felt and cone half-angle (degrees) */
  lampH: number
  lampCone: number
  /** reveal front noise (1 = pomme); higher = blotchier, more painterly */
  revealNoise: number
  /** reveal radial weight (1 = pomme); higher = one front travelling out (wet bloom) */
  revealRadial: number
  /** width of the wet front */
  revealSoft: number
  /** the title rainbow: outer radius, angular span (rad), letter size, centre height above the felt, gap to the inner arc */
  titleR: number
  titleSpan: number
  titleSize: number
  titleY: number
  titleGap: number
  /** world units per letter slot (arc length follows the text; radius sets the curve) */
  titleSpacing: number
  /** stroke thickness in canvas px */
  titleWeight: number

  /* The ALWAYS BET ON / DANIEL W LIU title, part by part. titleR and the rest set the ARC both lines are
     flowed onto; these move each line ON that arc, so a line can be nudged without redrawing the curve. */
  /** ALWAYS BET ON: across, up, size and roll */
  ttAX: number
  ttAY: number
  ttAS: number
  ttAR: number
  /** DANIEL W LIU: the same four */
  ttBX: number
  ttBY: number
  ttBS: number
  ttBR: number
  /* Chips and dice strewn around the title. Scattered from a seed rather than placed one by one: the point
     is a handful of them looking dropped, and twenty positions to dial is not an editor, it is a chore. */
  /** how many chips, and how big */
  ttChips: number
  ttChipS: number
  /** how many dice, and how big */
  ttDice: number
  ttDiceS: number
  /** where the handful sits, and how far it scatters */
  ttPropX: number
  ttPropZ: number
  ttSpread: number
  /** reroll the scatter */
  ttSeed: number

  /* Stop motion for the title. The ransom letters are paper cut-outs, so they are shot the way cut-outs
     are: on a low frame rate, trembling between exposures, and popping on rather than fading. */
  /** exposures per second; 12 is "on twos" from 24 */
  smFps: number
  /** seconds one letter takes to slide onto the page */
  smTravel: number
  /** how far it starts from home, against its own size */
  smFrom: number
  /** how far it shifts between exposures WHILE MOVING, against its own size */
  smBoil: number
  /** and how far it turns, radians */
  smTurn: number
  /** word mode: seconds between one word being set down and the next picked up */
  wdBeat: number
  /** word mode: exposures each authored pose is held (speed, without resampling the chart) */
  wdStep: number
  /** word mode: how far off its mark a word starts */
  wdFrom: number
  /** word mode: the angle it comes in turned by, radians */
  wdTurn: number
  /** word mode: how far the path bows off the straight line */
  wdSwing: number
  /** word mode: whole poses the turn is cued behind the slide */
  wdDrag: number
  /** word mode: a bias on every entry direction, radians (0 = straight outward) */
  wdDir: number
  /** word mode: how big the corrections are; 1 is as authored, which is one regular move */
  wdHand: number
  /* The presented folder, in the SCREEN's own axes rather than the world's. It builds its pose from the
     camera's basis and frames itself off the camera's fov and aspect, so every one of these is a plain
     up/down or left/right in the shot and a proportion rather than a position: they hold on any window
     shape and at any camera angle. */
  /** how much room to leave around the spread: 1 fills the frame exactly, higher pulls it back */
  fldFit: number
  /** move it UP the screen (negative: down), as a fraction of its own height */
  fldUp: number
  /** move it RIGHT across the screen (negative: left), as a fraction of its own width */
  fldSide: number
  /** tilt up/down: positive tips the TOP toward you, negative leans it back so you read up its face */
  fldLean: number
  /** turn left/right: positive turns it to the right, bringing its left edge toward you */
  fldSpin: number
  /** how far the cover swings, as a fraction of a half turn: below 1 leaves a visible crease */
  fldTurn: number
  /** how hard the pointer tips it (radians at the screen edge). Rotation only: the pointer never moves it */
  fldTilt: number
  /** the idle float: how far it rises and falls, as a fraction of its own height */
  fldFloat: number
  /** how far hovering lifts it, as a fraction of its own height */
  fldRise: number
  /** how far the pointer MOVES it in 3d, as a fraction of its own size (across, up, and back) */
  fldMove: number

  /**
   * JACK OF ALL TRADES, the opening title card (jack-intro.tsx).
   *
   * Positions and sizes are in the lockup's own units, which are the frame half-height at the distance it
   * hangs: 1 is about half the screen. Sizes are applied as a SCALE on the built mesh rather than by
   * rebuilding its canvas, so a slider move costs nothing and the type stays as crisp as it was drawn.
   * The times are seconds on the armed clock, which is the same clock the chip's flick runs on.
   */
  jkFit: number
  jkFanSpread: number
  jkFanAngle: number
  jkCardX: number
  jkCardY: number
  jkCardW: number
  jkCardTilt: number
  jkJackS: number
  jkOfX: number
  jkOfY: number
  jkOfS: number
  jkAllX: number
  jkAllY: number
  jkAllS: number
  jkTrX: number
  jkTrY: number
  jkTrS: number
  jkTCardIn: number
  jkTCardLand: number
  jkTJack: number
  jkTOf: number
  jkTAll: number
  jkTTrades: number
  /** JACK's offset on the card, in the card's reference units. */
  jkJackX: number
  jkJackY: number
  /** Word roll, radians. JACK adds this to its supporting card's tilt. */
  jkJackR: number
  jkOfR: number
  jkAllR: number
  jkTrR: number
  /**
   * Which face each word is set in: an index into JACK_FONTS.
   *
   * Per word, because they are four different trades and the joke survives them not matching. Stored as a
   * number so the whole store stays one flat table of numbers, and the panel renders a picker for any key
   * that has an entry in TUNE_CHOICES.
   */
  jkFontJack: number
  jkFontOf: number
  jkFontAll: number
  jkFontTrades: number
  /** rerolls the ransom note: which scrap each letter was cut from, its size, tilt and hop */
  jkSeed: number
  /**
   * The whole lockup's nudge, ON TOP of the centring.
   *
   * The card and the three words are laid out relative to each other and the GROUP is then centred on its
   * own measured bounds, so changing a size or a font cannot walk the line off to one side the way it used
   * to. This is the manual offset on top of that, for when centred is not where it should be.
   */
  jkLockX: number
  jkLockY: number
  /**
   * The second the coin is flicked, which is the second the title stops being the shot.
   *
   * On the panel because it is downstream of every other timing knob: speed the words up and the coin is
   * still waiting at whatever this was, so the lockup sits finished and motionless until it fires. Set it
   * about half a second after the last word lands.
   */
  jkFlick: number
  /**
   * How long the coin hangs at its apex before it falls.
   *
   * Nearly zero, and it should stay that way. The lens arrives exactly as the coin does (jkOver 0), so the
   * hang is not needed for the catch any more - it was, back when the lens got there late. What is left is
   * only the natural pause of a thrown thing running out of speed at the top, which is what makes it read
   * as real; anything more and the coin sits centred waiting, which reads as a lock rather than a beat.
   *
   * ZERO by default. The rise decelerates to nothing at the apex and the fall accelerates from nothing, so
   * with no hang the two are one continuous parabola and the turn at the top has no seam in it. Any hang at
   * all puts a flat stretch between them, which is exactly the pause it looks like.
   */
  jkHold: number
  /**
   * THE FLIGHT. Six numbers that were module constants until they needed tuning against each other.
   *
   * They are coupled in ways no one of them shows, which is exactly why they belong on one panel: raising
   * the apex without lengthening the rise only launches the coin faster; starting the camera EARLIER makes
   * the coin less likely to leave frame, because a climbing camera carries the top edge with it; raising
   * the lift without dropping the title's lag pushes the last word off the bottom. Turning one on its own
   * usually makes it worse.
   */
  /** how high the coin is flicked, over the camera's fall height. Past about 7 it leaves the frame. */
  jkApex: number
  /**
   * WHERE THE COIN SITS at the top of its arc, in half-frames. 0 is dead centre, 1 is the top edge.
   *
   * This replaced jkLift, which was how far the lens climbs, and which was never really a free number: it
   * had to equal the apex minus lookY or the coin finished off centre, so every time the apex moved the
   * climb had to be re-derived by hand, and getting it wrong is what "the rise and peak is bad" was - a
   * lift five units over its mark puts the coin two half-frames BELOW centre at the top.
   *
   * The climb is worked out from this instead (see camClimb), so raising the apex just works and this says
   * only the one thing it is for: where the coin ends up in frame. Positive leaves it high, having
   * out-climbed the lens; negative means the lens overshot it.
   */
  jkPeak: number
  /**
   * Seconds the coin is alone before the lens goes after it.
   *
   * ALSO THE LENS'S SPEED KNOB, and the only one that does not cost framing. The lens has from here to the
   * coin's apex to cover jkLift, so a longer wait is the SAME distance in less time - it starts later and
   * moves faster to arrive at the same place. Past the coin's whole rise there is no window left at all;
   * if it bottoms out, lengthen jkRise rather than pushing this further.
   *
   * It is also the knob for HOW FAR OFF SCREEN the coin gets, and it is violently sensitive there, because
   * the lens's climb is front-loaded - a fifth of a second of wait is a large fraction of the whole climb.
   * Measured at the coin's highest point in frame, against the current rise: 0.46 -> NDC 2.04, well past
   * the top edge; 0.44 -> 1.65; 0.42 -> 1.19, just clears it; 0.38 -> 0.38, never leaves the frame at all.
   * It falls off a cliff between 0.46 and 0.38 because the coin's own climb is front-loaded, so a few
   * hundredths of wait is a large part of how far it has already gone.
   *
   * It does NOT change whether the lens catches up - the coin measures within 0.02 of dead centre at its
   * own apex at every one of those - only how much of the climb happens where it can be seen.
   */
  jkDelay: number
  /**
   * Seconds after the coin reaches its apex that the LENS finishes climbing. May be NEGATIVE, and 0 by
   * default, which is deliberate and not laziness.
   *
   * Seconds after the coin LETS GO that the lens finishes climbing and turns over. This is the gap the
   * descent is built on: for this long the coin is falling while the lens is still rising, so the coin
   * gets away downward and the lens has to chase it.
   *
   * It was 0 for a while, so the lens would arrive before the coin's apex and the coin would be exactly
   * centred there - but that forces a hold, because the lens then has nothing to do until it falls. The
   * smoothstep makes the difference cheap: its last 0.08s covers under two percent of the climb, so the
   * coin sits about a fifth of a half-frame high at its apex and settles ONTO centre as it starts down.
   * Centred at the top and never stationary, instead of one or the other.
   *
   * Big values are the old failure: the lens climbing for a long time after the coin turns makes a rising
   * camera and a falling coin the same picture, and the top of the arc stops reading at all.
   *
   * This is the whole lag-and-catch on the way DOWN, and it is the most sensitive number in the flight.
   *
   * The coin turns first and falls while the lens is still climbing, so for this long the two move in
   * OPPOSITE directions and the coin drops hard through the frame; the lens then turns with less time left
   * to reach its mark, so its fall is steeper than the coin's and it hauls the coin back up toward centre.
   * At zero the two peak and fall together, which is a rigid pair rather than a chase.
   *
   * Too big and the catch happens OFF SCREEN, which is how it was found: at 0.34 the coin left the bottom
   * of the frame entirely (measured NDC -2.08, a full frame below the edge) and everything interesting
   * happened where nobody could see it. At 0.14 the coin bottoms out at -0.88, just inside the edge, and is
   * pulled back to -0.29 - the whole chase stays in shot. Measure it if it moves.
   */
  jkOver: number
  /**
   * Seconds the lens WAITS at the top after it has finished climbing, before it falls.
   *
   * 0, and it wants to stay there. Any value at all is a stretch where the lens is perfectly still, and
   * since the coin is barely moving at its own apex either, that is a frame where nothing moves - which
   * reads as the shot locking up rather than as a beat. The coin still leaves first without it: jkOver
   * does that by keeping the lens climbing a moment longer.
   */
  jkSink: number
  /** seconds from the hand to the coin's apex */
  jkRise: number
  /**
   * How far the camera FALLS, world units: its height over the table framing while the title is up.
   *
   * The whole drop, and the biggest single number in the beat. The coin's apex is measured on top of it
   * (jkApex) and so is the lens's climb (jkLift), so raising it lifts the entire flight without changing
   * any of the framing inside it.
   */
  jkFall: number
  /** seconds the drop takes, for the coin and the lens both. Shorter is a harder landing. */
  jkFallFor: number
  /**
   * How hard the lens DIVES after the coin, as an exponent. 2 is ballistic, and 2 is what it wants.
   *
   * This decides WHICH OF THE TWO LEADS on the way down, and the sign of it is the opposite of what it
   * looks like. Below 2 the lens descends faster than the coin and overtakes it, so the coin rides UP the
   * frame - measured at 1.5 the coin reaches +2.30 mid-fall, well above centre, which reads as the camera
   * dropping first and the coin trailing behind it. Above 2 the lens hangs back and the coin falls away
   * from it: at 2.4 the coin is at -2.21, a full frame below the bottom edge.
   *
   * At exactly 2 both fall like thrown things and the coin leads purely because it LET GO FIRST, which is
   * the honest version of "coin goes down, camera catches up". It is also the flattest: measured -0.29,
   * -0.50, -0.54, -0.38, -0.12 across the fall, a quarter of a half-frame of travel in total, because a
   * camera falling WITH a thing is the definition of no relative motion.
   *
   * Either side of 2 buys that travel back, and they are different STORIES, not different amounts:
   *
   *   over 2   the lens lags and the coin sinks away from it. 2.15 -> -0.40, -0.79, -1.03, -0.73, -0.30:
   *            down to the bottom edge mid-fall and hauled back. 2.3 goes to -1.32, out of frame.
   *   under 2  the lens outruns the coin and the coin rides HIGH, then the fall converges onto the landing
   *            framing. 1.78 -> -0.16, -0.02, +0.12, +0.10, -0.11. 1.72 -> +0.49 at its highest. Below
   *            about 1.6 the lens runs away with it and the coin ends up near the top edge.
   *
   * Under 2 is what is set, because the arrival is what it does best: the coin drifts up past centre and
   * then settles back down onto its mark as the two meet, which reads as landing rather than as catching.
   * The changing gap also changes the coin's SIZE through the fall, which exactly 2 does not do at all.
   */
  /**
   * How hard the lens LAUNCHES into its climb, as an exponent. 2 matches the coin's throw exactly.
   *
   * This is the knob for a trade with no way around it: the coin is THROWN, so all its speed is at the
   * bottom, and only a lens thrown the same way can stay with it. Measured, over the fraction of the climb
   * the coin is actually in frame for: 2 -> 69 percent, 1.55 -> 36, 1.25 -> 15, and a smoothstep (which
   * leaves at zero speed) -> 7. A gentler wind-up is a lens that is still getting going while the coin is
   * already gone.
   *
   * Neither the heights nor the wait move this much - both were tested and neither got past 8 percent
   * while the curve was soft. It is the shape.
   */
  /**
   * The SHAPE of the climb, as a named easing. jkWind is its strength where the shape has one.
   *
   * "throw" is the coin's own curve and the only one that tracks it perfectly. The others trade some of
   * that for a softer entry, which is the point: a lens that simply starts at full speed reads as abrupt,
   * because nothing in life reaches its top speed on the first frame.
   *
   *   throw       all the speed at the bottom, decelerating. Matches the coin exactly.
   *   anticipate  dips a little the WRONG way first, then throws. The classic fix for an abrupt start:
   *               the small counter-move is what makes the launch look intended rather than switched on.
   *   smooth      eases in and out. The gentlest, and the one that loses the coin (7 percent visible).
   *   overshoot   throws past the mark and settles back onto it.
   */
  jkEaseUp: number
  /**
   * The SHAPE of the descent and the landing. jkDive is its strength where the shape has one.
   *
   *   fall        v^jkDive: starts from nothing and accelerates all the way into the ground.
   *   smooth      eases in and out - arrives gently, which reads as being set down rather than dropped.
   *   heavy       hangs back longer, then arrives much harder. The most weight on the impact.
   *   settle      falls, arrives, and gives slightly under itself before coming to rest.
   */
  jkEaseDown: number
  /**
   * Whether the COIN uses these easings too, or keeps its own ballistic curves. 0 = coin stays ballistic.
   *
   * At 0 only the lens is shaped, so any easing that is not "throw" desyncs the two and the coin gets away
   * during the climb. At 1 both are shaped the same way, which keeps them together whatever is chosen -
   * the price is that the coin stops being strictly a thrown object.
   */
  jkEaseCoin: number
  jkWind: number
  jkDive: number
  /** the flip off the thumb, rad/s */
  jkSpinUp: number
  /** the flip's rate at the apex. Both halves are pinned to it, so the rate is continuous over the top. */
  jkSpinTop: number
  /** the flip's rate on impact. Above jkSpinTop, so the fall accelerates the flip. */
  jkSpinLand: number
  /**
   * WHERE EACH SUIT SITS in the flash, as an offset in the plane facing the lens: X across, Y up.
   *
   * Free positions rather than an arc, because "a pattern" is his to choose - the defaults are the
   * semicircle these started as, so nothing moves until something is dragged. The pair is a DIRECTION and
   * a DISTANCE at full spread: a suit travels out along its own vector as the wave expands, so placing one
   * further out makes it fly further, not just start further away.
   */
  suit0X: number
  suit0Y: number
  suit1X: number
  suit1Y: number
  suit2X: number
  suit2Y: number
  suit3X: number
  suit3Y: number
  /** how big the suits are drawn */
  suitSize: number
  /**
   * How much of the travel has already happened when the flash starts. 0 means EMITTED FROM THE CHIP.
   *
   * At 0 every suit and eye begins at the chip itself and flies out to its placed position, so the placed
   * values are the END of the throw rather than a fixed spot the thing sits at. The travel is on the
   * burst's cubic ease-out - almost all the distance covered in the first third, crawling into place at
   * the end - which is what a thing thrown off an impact does.
   */
  suitFrom: number
  /**
   * WHERE EACH EYE SITS in the flash, same scheme as the suits: a direction and a distance at full spread.
   *
   * Separate keys from the eye stage's (eyN, eySize and the rest) on purpose - those describe a field of
   * eyes that lives on its own page, and these are three specific eyes that exist for half a second inside
   * an impact frame. Sharing them would tie two unrelated things together.
   */
  /**
   * HOW MANY eyes are in the flash. Add and remove by turning it up and down.
   *
   * Where each one sits is NOT here. A count that can change means a variable number of placements, and
   * the panel renders one slider per key, so fixed keys would mean a fixed maximum and a screen of sliders
   * for eyes that may not exist. They go in the same sparse per-item store the ransom letters use, which
   * already carries a move, a scale and a roll each - which is also exactly what G, S and R need.
   */
  hitEyeN: number
  hitEyeSize: number
  /** Seconds after impact before the first eye starts opening; all eyes share this offset. */
  hitEyeDelay: number
  /** Time between successive eye openings, independent of each lid's opening speed. */
  hitEyeStagger: number
  hitRevealNoise: number
  hitBoil: number
  /**
   * How much of the lens's climb the title does NOT follow, 0 to 1.
   *
   * 1 means it does not follow it AT ALL: the title is left where it is in the world and the lens simply
   * rises past it, so it slides down the frame and out of the bottom. That is the honest version and it is
   * what it is set to - anything less is the title being dragged along by a camera it is supposed to be
   * left behind by, and at the heights this beat runs at, a title that keeps up is a title that never
   * leaves, which makes the climb look like it is not happening.
   *
   * It is also the ONLY on-screen evidence of the climb, now that the speed lines are down-only, so it
   * doubles as the cue that tells a rising camera apart from a falling coin.
   */
  jkLag: number
  /**
   * How much bigger the FIRST letter of each word is cut.
   *
   * A ransom note is assembled from headlines and body text, and the biggest scrap is almost always the
   * one at the front - it is the drop cap of the form. It also does the work the general size jitter
   * cannot: jitter alone gives fifteen letters that are all slightly different and none of them dominant,
   * which reads as untidy rather than as composed.
   */
  jkInitial: number
  /** how much the rest of the letters vary in size, either side of 1 */
  jkVary: number
  /**
   * How far a letter is allowed off its word's line: baseline hop, horizontal unevenness and roll.
   *
   * A hand-pasted word does not sit on a baseline at all, and this is the one number that decides whether
   * it looks pasted or typeset. At 0 the word is a straight line of scraps in mixed faces, which reads as
   * a font that cannot make up its mind rather than as a note.
   */
  jkScatter: number
  /**
   * THE EXPOSURES in a word's arrival: how many discrete poses it holds between off frame and home.
   *
   * ZERO, meaning smooth, no quantiser at all. The stepped version kept reading as the page struggling
   * rather than as a technique, and that is not really fixable here: stop motion works because EVERYTHING
   * in the shot is on the same cadence, and in this shot the card, the coin, the camera and the room are
   * all running at the display's rate. A stepped thing inside a smooth world is what a dropped frame looks
   * like, whatever the spacing. Set it to 6 or 8 to get the stepping back.
   *
   * The lettering's frame rate, and the ONLY quantiser on it. There used to be a second one, a clock
   * floored to a frames-a-second figure, and the two grids beat against each other - a pose came out one
   * frame long, the next two, the next one. Uneven holds are the actual signature of a dropped frame,
   * which is why the motion read as the page lagging rather than as an animation. One grid, every pose
   * held exactly as long as the last.
   *
   * Hold length is the travel time divided by this, so it moves with jkSpeed. It is quantised once per
   * word, not once per letter, so every letter in a word moves on the same exposure: that is what stop
   * motion actually is, the pieces are all moved and then one frame is shot.
   */
  jkSteps: number
  /** jack lockup: 1 shoots it on the authored chart, 0 brings back the old eased curve */
  jkShot: number
  /** jack lockup: exposures each authored pose is held */
  jkStep: number
  /** jack lockup: how far a scrap lands off, per pose */
  jkHand: number
  /** jack lockup: how big the corrections are; 1 is as authored, which is one regular move */
  jkNudge: number
  /**
   * How long a letter takes to get there, as a multiple of its own base time.
   *
   * The number that was actually wrong. With entrances of about a fifth of a second and seven steps, each
   * step was held for under thirty milliseconds - less than half a frame at the stop-motion rate - so the
   * steps existed in the maths and never made it to the screen. A step has to be HELD to read as a step;
   * at 3 or so each one sits for about a fifth of a second, which is what makes a letter look like it is
   * encroaching rather than arriving.
   */
  jkSpeed: number

  /* The eyes over the title card: a field of drawn eyes opens across the shot and every one of them
     watches the pointer from where it sits. These are all about the FIELD. One eye's own proportions are
     geometry and live in eye.ts, where check-eye can hold them. */
  /** how many eyes */
  eyN: number
  /** how big each one is, against what the spacing allows */
  eySize: number
  /** how far in front of the camera the field hangs, in world units */
  eyDist: number
  /** seconds into the beat when the first one starts to open */
  eyAt: number
  /** seconds between the first eye opening and the last */
  eyStagger: number
  /** seconds one eye takes to open */
  eyWake: number
  /** stroke weight, 1 = as drawn */
  eyWeight: number
  /** how hard the paper pushes the strokes about, 1 = as drawn */
  eyPaper: number
  /** how far the iris travels toward the pointer, 1 = as drawn */
  eyGaze: number
  /** average seconds between blinks */
  eyEvery: number
  /** how much of the frame the field covers */
  eyCover: number
  /** overall opacity of the field */
  eyFade: number
}

/**
 * The faces on offer, in panel order.
 *
 * KatieRoze is first because it is the table's own hand: ALWAYS BET ON and DANIEL W LIU are set in it, so
 * the title card and the table are one voice. It only became usable here after the shipped woff2 was
 * re-subsetted - the deployed file is a SUBSET of a 24MB original, cut down to the characters the about
 * page and the marquee needed, and J, C, K, T and R were not among them. That is the whole reason TRADES
 * came out as "TR" in Georgia and "ADES" in KatieRoze: five of the fifteen letters were silently falling
 * back. See fonts-original/README.txt before adding a word with a new letter in it.
 */
export const JACK_FONTS: { key: string; label: string; url: string }[] = [
  { key: 'KatieRoze', label: "KatieRoze (the table's own hand)", url: '/fonts/KatieRoze-display-512.woff2' },
  { key: 'JkFredericka', label: 'Fredericka (inked wood type)', url: '/fonts/FrederickatheGreat-Regular.woff2' },
  { key: 'JkFastBlaze', label: 'Fast Blaze (brush)', url: '/fonts/FAST%20BLAZE.woff2' },
  { key: 'JkAtop', label: 'Atop (heavy round)', url: '/fonts/Atop.ttf' },
  { key: 'JkMochibop', label: 'Mochibop (bubble)', url: '/fonts/MochibopBold-Demo.woff2' },
  { key: 'JkAncient', label: 'Ancient Wedding (script)', url: '/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.woff2' },
  { key: 'JkWedding', label: 'Wedding (script)', url: '/shared/fonts/weddingday-font/WeddingdayPersonalUseRegular-1Gvo0.ttf' },
  { key: 'JkArcade', label: 'Arcade (pixel)', url: '/fonts/ARCADECLASSIC.TTF' },
]

/** keys the panel shows as a picker rather than a slider */
/**
 * The font picker's first entry is MIXED, which is the ransom note's own answer: every letter cut from a
 * different face. Picking a named one instead pins the whole word to it, for when a word should be the one
 * steady thing in the line.
 */
const FONT_CHOICES = ['mixed (cut from anywhere)', ...JACK_FONTS.map((f) => f.label)]

export const EASE_UP_CHOICES = ['throw (tracks the coin)', 'anticipate (dip, then throw)', 'smooth (soft both ends)', 'overshoot (past, then settle)', 'wind in (soft start, no dip)']
export const EASE_DOWN_CHOICES = ['fall (accelerates in)', 'smooth (arrives gently)', 'heavy (hangs, then slams)', 'settle (gives under itself)']
export const EASE_COIN_CHOICES = ['coin stays ballistic', 'coin uses the same easing']

export const TUNE_CHOICES: Partial<Record<keyof Tune, string[]>> = {
  bgStyle: BACKDROP_STYLES,
  jkEaseUp: EASE_UP_CHOICES,
  jkEaseDown: EASE_DOWN_CHOICES,
  jkEaseCoin: EASE_COIN_CHOICES,
  jkFontJack: FONT_CHOICES,
  jkFontOf: FONT_CHOICES,
  jkFontAll: FONT_CHOICES,
  jkFontTrades: FONT_CHOICES,
}

export const TUNE_DEFAULTS: Tune = { ...JACK_COMPOSITION, ...DEALER_DEFAULTS, ...DEALER_MOTION_DEFAULTS, bgStyle: 11, bgStrength: 1, bgDetail: 0.34, bgMotion: 1.1, bgGlow: 1.08, rouTextX: 0.42, rouTextY: -0.4, rouTextSize: 1.55, rouTextR: 0.4, rfTextX: -0.42, rfTextY: 0.45, rfTextSize: 1.55, rfTextR: 0.15, rfSize: 1.15, rfX: 0.8, rfY: -0.08, rfDepth: 0, rfTilt: -0.12, rfYaw: -0.18, rfBank: 1.35, rfScaleX: 1, rfScaleY: 1, rfScaleZ: 1, rfSpread: 0.48, rfArc: 0.26, rfDelay: 0.2, rfEnter: 0.72, rfExit: 0.55, rfDrift: 0.08, rfBob: 0.12, rfBobSpeed: 3.2, rfStagger: 0.14, rfEnergy: 1.25, rfFlow: 1.5, rfFlowSpeed: 3, rfSway: 0.46, rfSwaySpeed: 3.4, rouYaw: 0, rouDepth: 0, rouScaleX: 1, rouScaleY: 1, rouScaleZ: 1, rouSway: 0.34, rouSwaySpeed: 2.8, rouSize: 2.140458984375, rouX: -0.14923209798994974, rouY: -0.1544016912320484, rouTilt: 1.02, rouBank: -0.538390625, rouDelay: 0.12, rouEnter: 0.62, rouExit: 0.55, rouDrift: 0.25, rouWheel: 2.6, rouBall: 9, chipX: 0, chipZ: -1.6, chip: 1.6, table: 24, rail: 0.7, chord: -2.5, camY: 4.6, camZ: 12.5, lookY: 1.4, lampH: 7.5, lampCone: 33, revealNoise: 0.3, revealRadial: 2.2, revealSoft: 0.3, titleR: 16, titleSpan: 2.1, titleSize: 1.45, titleY: 3.45, titleGap: 0.78, titleSpacing: 0.5, titleWeight: 6, fldFit: 1.18, fldUp: -0.025, fldSide: 0, fldLean: -0.28, fldSpin: 0, fldTurn: 0.945, fldTilt: 0.09, fldFloat: 0.014, fldRise: 0.055, fldMove: 0.035, jkFit: 1.95, jkCardX: -1.407, jkCardY: 0.252, jkCardW: 1.35, jkCardTilt: 0.155, jkJackS: 0.7, jkOfX: 0.102, jkOfY: 0.882, jkOfS: 0.66, jkAllX: 0.665, jkAllY: 0.359, jkAllS: 0.598, jkTrX: -0.442, jkTrY: -0.414, jkTrS: 0.555, jkTCardIn: 0.55, jkTCardLand: 1.35, jkTJack: 1.65, jkTOf: 1.65, jkTAll: 1.65, jkTTrades: 1.65, jkJackX: -0.107, jkJackY: 0.173, jkJackR: 0, jkOfR: 0.05, jkAllR: -0.02, jkTrR: 0, jkFontJack: 0, jkFontOf: 0, jkFontAll: 0, jkFontTrades: 0, jkSeed: 7, jkLockX: 0, jkLockY: 0, jkFlick: 3.7, jkHold: 0.06, jkApex: 40, jkPeak: 0, jkDelay: 0.18, jkOver: 0.08, jkSink: 0, jkRise: 1.5, jkLag: 1, jkFall: 20, jkFallFor: 1.1, jkEaseUp: 4, jkEaseDown: 0, jkEaseCoin: 0, jkWind: 2, jkDive: 1.78, jkSpinUp: 30, jkSpinTop: 4, jkSpinLand: 18, suit0X: 3.62, suit0Y: 1.8, suit1X: 1.42, suit1Y: 2.56, suit2X: -1.42, suit2Y: 2.56, suit3X: -3.62, suit3Y: 1.8, suitSize: 1.35, suitFrom: 0, hitEyeN: 12, hitEyeSize: 0.85, hitEyeDelay: 0.18, hitEyeStagger: 0.018, hitRevealNoise: 3, hitBoil: 0.06, jkInitial: 1.5, jkVary: 0.19, jkScatter: 0.35, jkSteps: 0, jkShot: 1, jkStep: 1, jkHand: 0.022, jkNudge: 1, jkSpeed: 0.95, eyN: 14, eySize: 1, eyDist: 4.2, eyAt: 0.35, eyStagger: 0.75, eyWake: 0.5, eyWeight: 1, eyPaper: 1, eyGaze: 1, eyEvery: 3.6, eyCover: 1, eyFade: 1, ttAX: 0, ttAY: 1.1, ttAS: 0.82, ttAR: 0, ttBX: 0, ttBY: 0, ttBS: 1.14, ttBR: 0, ttChips: 7, ttChipS: 1, ttDice: 2, ttDiceS: 1, ttPropX: 0, ttPropZ: 0, ttSpread: 3.4, ttSeed: 3, smFps: 12, smTravel: 0.5, smFrom: 1.6, smBoil: 0.022, smTurn: 0.028, wdBeat: 0.12, wdStep: 1, wdFrom: 1.6, wdTurn: 0.3, wdSwing: 0.22, wdDrag: 2, wdDir: 0, wdHand: 1 }

// Keep this authored lockup together rather than burying composition in the
// unrelated scene controls above. Explicit saved overrides still win.
Object.assign(TUNE_DEFAULTS, JACK_COMPOSITION)
// Bring the hero chip toward the resume; the live folder collider still clamps
// this requested home to a safe edge, including its full hover radius.
TUNE_DEFAULTS.chipZ = -0.65

export const TUNE_RANGES: Record<keyof Tune, [number, number, number]> = {
  jkFanSpread: [0.3, 1.7, 0.01], jkFanAngle: [0, 1.6, 0.01],
  bgStyle: [0, BACKDROP_STYLES.length - 1, 1], bgStrength: [0, 1, 0.05],
  bgDetail: [0, 1, 0.01], bgMotion: [0, 2, 0.05], bgGlow: [0.3, 2, 0.01],
  ...DEALER_RANGES, ...DEALER_MOTION_RANGES,
  rfSize: [0.3, 3, 0.02],
  rfX: [-1.5, 1.5, 0.01], rfY: [-1.5, 1.5, 0.01],
  rfDepth: [-4, 4, 0.05],
  rfTilt: [-Math.PI, Math.PI, 0.01], rfYaw: [-Math.PI, Math.PI, 0.01], rfBank: [-Math.PI, Math.PI, 0.01],
  rfScaleX: [-4, 4, 0.05], rfScaleY: [-4, 4, 0.05], rfScaleZ: [-4, 4, 0.05],
  rfSpread: [0.15, 1, 0.01], rfArc: [0, 0.4, 0.01],
  rfDelay: [0, 0.8, 0.02], rfEnter: [0.15, 1.2, 0.02], rfExit: [0.15, 0.8, 0.02], rfDrift: [0, 0.5, 0.01],
  rfBob: [0, 0.35, 0.01], rfBobSpeed: [0.5, 6, 0.1],
  rfStagger: [0, 0.28, 0.01], rfEnergy: [0, 2, 0.05],
  rfFlow: [0, 2, 0.05], rfFlowSpeed: [0.5, 5, 0.1],
  rfSway: [0, 0.7, 0.01], rfSwaySpeed: [0.2, 6, 0.1],
  rfTextX: [-2, 2, 0.01], rfTextY: [-2, 2, 0.01], rfTextSize: [0, 3, 0.05],
  rfTextR: [-1.2, 1.2, 0.01], rouTextR: [-1.2, 1.2, 0.01],
  rouTextX: [-2, 2, 0.01], rouTextY: [-2, 2, 0.01], rouTextSize: [0, 3, 0.05],
  rouSize: [0.4, 3, 0.05],
  rouX: [-1, 1.5, 0.02],
  rouY: [-1, 1, 0.02],
  rouTilt: [-Math.PI, Math.PI, 0.01],
  rouBank: [-Math.PI, Math.PI, 0.01],
  rouYaw: [-Math.PI, Math.PI, 0.01],
  rouDepth: [-4, 4, 0.05],
  rouScaleX: [-4, 4, 0.05],
  rouScaleY: [-4, 4, 0.05],
  rouScaleZ: [-4, 4, 0.05],
  rouSway: [0, 0.6, 0.01],
  rouSwaySpeed: [0.2, 6, 0.1],
  rouDelay: [0, 0.8, 0.02],
  rouEnter: [0.15, 1.2, 0.02],
  rouExit: [0.15, 0.8, 0.02],
  rouDrift: [0, 0.8, 0.02],
  rouWheel: [0.2, 6, 0.1],
  rouBall: [7, 18, 0.1],
  chip: [0.5, 4, 0.05],
  chipX: [-4, 4, 0.05],
  chipZ: [-4, 2, 0.05],
  table: [4, 60, 0.1],
  rail: [0.1, 2, 0.05],
  chord: [-20, 2, 0.05],
  camY: [1, 40, 0.1],
  camZ: [3, 60, 0.1],
  lookY: [-2, 8, 0.1],
  lampH: [2, 20, 0.1],
  lampCone: [8, 80, 0.5],
  revealNoise: [0, 3, 0.05],
  revealRadial: [0, 5, 0.05],
  revealSoft: [0.02, 0.6, 0.01],
  /**
   * The arc's radius, and it is the CURVE control.
   *
   * A bigger radius is a flatter line: the letters are flowed along a circle of
   * this radius, so at 6.5 the title is a strong banner curve and it takes a
   * much larger figure to straighten it out. The range used to stop at 8, which
   * is barely past the default, so there was no way to make the title flatter
   * however long you dragged. 40 reads as very nearly a straight line.
   */
  titleR: [1, 90, 0.1],
  titleSpan: [0.5, 3.1, 0.02],
  titleSize: [0.1, 6, 0.02],
  // the default is -2.6, so a range starting at -2 could not reach it: dragging
  // the slider at all snapped the title upward and there was no way back to
  // where it started
  // now the height the title's top line SITS at, not the arc centre's height
  titleY: [-6, 18, 0.05],
  // now a drop in world units between the two lines, not a radius difference
  titleGap: [0, 9, 0.02],
  titleSpacing: [0.1, 4, 0.01],
  titleWeight: [1, 14, 0.5],
  ttAX: [-14, 14, 0.02],
  ttAY: [-8, 8, 0.02],
  ttAS: [0.15, 4, 0.01],
  ttAR: [-0.6, 0.6, 0.005],
  ttBX: [-14, 14, 0.02],
  ttBY: [-8, 8, 0.02],
  ttBS: [0.15, 4, 0.01],
  ttBR: [-0.6, 0.6, 0.005],
  ttChips: [0, 24, 1],
  ttChipS: [0.4, 2.5, 0.02],
  ttDice: [0, 10, 1],
  ttDiceS: [0.4, 2.5, 0.02],
  ttPropX: [-8, 8, 0.05],
  ttPropZ: [-8, 8, 0.05],
  ttSpread: [0.5, 9, 0.05],
  ttSeed: [0, 40, 1],
  smFps: [2, 60, 1],
  smTravel: [0.08, 2, 0.02],
  smFrom: [0, 6, 0.05],
  smBoil: [0, 0.3, 0.005],
  smTurn: [0, 0.4, 0.005],
  wdBeat: [0, 1.2, 0.01],
  wdStep: [1, 4, 1],
  wdFrom: [0, 12, 0.1],
  wdTurn: [0, 1.4, 0.01],
  wdSwing: [0, 1.2, 0.01],
  wdDrag: [0, 5, 1],
  wdDir: [-3.14, 3.14, 0.02],
  wdHand: [0, 2.5, 0.05],
  fldFit: [0.9, 2.2, 0.01],
  fldUp: [-0.5, 0.5, 0.005],
  fldSide: [-0.5, 0.5, 0.005],
  fldLean: [-0.9, 0.9, 0.01],
  fldSpin: [-0.9, 0.9, 0.01],
  fldTurn: [0.7, 1, 0.005],
  fldTilt: [0, 0.4, 0.005],
  fldFloat: [0, 0.08, 0.002],
  fldRise: [0, 0.2, 0.005],
  fldMove: [0, 0.2, 0.005],
  jkFit: [1.2, 3.2, 0.01],
  jkCardX: [-3.5, 1, 0.01],
  jkCardY: [-1.5, 2, 0.01],
  jkCardW: [0.6, 2.6, 0.01],
  jkCardTilt: [-0.6, 0.6, 0.005],
  jkJackS: [0.08, 1.4, 0.01],
  jkOfX: [-3, 3, 0.01],
  jkOfY: [-1.5, 2, 0.01],
  jkOfS: [0.08, 1.6, 0.01],
  jkAllX: [-2, 3.5, 0.01],
  jkAllY: [-1.5, 2, 0.01],
  jkAllS: [0.1, 1.8, 0.01],
  jkTrX: [-2, 3.5, 0.01],
  jkTrY: [-2, 1.5, 0.01],
  jkTrS: [0.08, 1.4, 0.01],
  jkTCardIn: [0, 2, 0.01],
  jkTCardLand: [0.3, 3, 0.01],
  jkTJack: [0.3, 3.5, 0.01],
  jkTOf: [0.3, 4, 0.01],
  jkTAll: [0.3, 4.5, 0.01],
  jkTTrades: [0.3, 5, 0.01],
  jkJackX: [-1.5, 1.5, 0.01],
  jkJackY: [-1.5, 1.5, 0.01],
  jkJackR: [-1.2, 1.2, 0.005],
  jkOfR: [-1.2, 1.2, 0.005],
  jkAllR: [-1.2, 1.2, 0.005],
  jkTrR: [-1.2, 1.2, 0.005],
  jkFontJack: [0, 8, 1],
  jkFontOf: [0, 8, 1],
  jkFontAll: [0, 8, 1],
  jkFontTrades: [0, 8, 1],
  jkSeed: [0, 40, 1],
  jkLockX: [-2, 2, 0.01],
  jkLockY: [-2, 2, 0.01],
  jkFlick: [1.5, 10, 0.05],
  jkHold: [0, 3, 0.05],
  jkApex: [2, 130, 0.5],
  jkPeak: [-2, 2, 0.02],
  jkDelay: [0, 1.5, 0.01],
  jkOver: [-0.8, 1.2, 0.01],
  jkSink: [0, 0.8, 0.01],
  jkRise: [0.4, 3.5, 0.05],
  jkFall: [6, 140, 0.5],
  jkFallFor: [0.5, 2.5, 0.05],
  jkEaseUp: [0, 4, 1],
  jkEaseDown: [0, 3, 1],
  jkEaseCoin: [0, 1, 1],
  jkWind: [1, 3, 0.05],
  jkDive: [1.3, 3, 0.05],
  jkSpinUp: [0, 80, 1],
  jkSpinTop: [0, 30, 0.5],
  jkSpinLand: [0, 60, 1],
  suit0X: [-9, 9, 0.05], suit0Y: [-4, 9, 0.05],
  suit1X: [-9, 9, 0.05], suit1Y: [-4, 9, 0.05],
  suit2X: [-9, 9, 0.05], suit2Y: [-4, 9, 0.05],
  suit3X: [-9, 9, 0.05], suit3Y: [-4, 9, 0.05],
  suitSize: [0.2, 4, 0.05],
  suitFrom: [0, 1, 0.02],
  hitEyeN: [0, 12, 1],
  hitEyeSize: [0.1, 3, 0.05],
  hitEyeDelay: [0, 0.35, 0.01],
  hitEyeStagger: [0, 0.04, 0.001],
  hitRevealNoise: [0, 5, 0.05],
  hitBoil: [0, 0.4, 0.01],
  jkLag: [0, 1, 0.01],
  jkInitial: [1, 2.6, 0.01],
  jkVary: [0, 0.5, 0.01],
  jkScatter: [0, 1.2, 0.01],
  jkSteps: [0, 20, 1],
  jkShot: [0, 1, 1],
  jkStep: [1, 4, 1],
  jkHand: [0, 0.12, 0.002],
  jkNudge: [0, 2.5, 0.05],
  jkSpeed: [0.2, 6, 0.05],
  eyN: [0, 40, 1],
  eySize: [0.4, 1.6, 0.02],
  eyDist: [1.5, 12, 0.1],
  eyAt: [0, 4, 0.05],
  eyStagger: [0, 3, 0.05],
  eyWake: [0.15, 2, 0.05],
  eyWeight: [0.4, 2.5, 0.05],
  eyPaper: [0, 3, 0.05],
  eyGaze: [0, 2, 0.05],
  eyEvery: [1.2, 8, 0.1],
  eyCover: [0.5, 1.6, 0.02],
  eyFade: [0, 1, 0.02],
}

/** just the presented folder, for the slim panel on the site itself (?fld) */
export const FOLDER_KEYS: (keyof Tune)[] = ['fldFit', 'fldUp', 'fldSide', 'fldLean', 'fldSpin', 'fldTurn', 'fldTilt', 'fldMove', 'fldFloat', 'fldRise']

/**
 * The COIN AND CAMERA FLIGHT alone, for ?flight: the throw, the chase, the turn and the drop.
 *
 * Separate from JACK_KEYS on purpose. Every one of these is coupled to the others and the whole set fits on
 * a screen without scrolling, which matters when the way you tune it is to change one, watch the loop, and
 * change another. The title's own forty knobs are noise while doing that.
 */
/**
 * The flight as it stood when he said he liked it, 31 Aug. A known-good point to fall back to.
 *
 * Not wired to anything - it is a record, not a preset system. To restore: paste these onto the URL, or
 * copy them over the matching entries in TUNE_DEFAULTS.
 *
 * jkFlick=3.2&jkRise=1.5&jkApex=40&jkPeak=0&jkDelay=0.18&jkOver=0.08&jkHold=0.06&jkSink=0
 * &jkFall=20&jkFallFor=1.1&jkEaseUp=4&jkWind=2&jkEaseDown=0&jkDive=1.78&jkEaseCoin=0&jkLag=1
 * &jkSpinUp=30&jkSpinTop=4&jkSpinLand=18
 *
 * What it measures: coin in frame for 83 percent of the climb, peak +0.72 so it never leaves the frame,
 * +0.027 when it lets go, drifting up through centre on the way down and settling to -0.481 at the
 * landing. Signed off 31 Aug as the version he is content with.
 */
/** the impact burst, for ?suits: four suits and three eyes, each freely placed, plus sizes and the spread */
export const SUIT_KEYS: (keyof Tune)[] = [
  'suit0X', 'suit0Y', 'suit1X', 'suit1Y', 'suit2X', 'suit2Y', 'suit3X', 'suit3Y', 'suitSize',
  'hitEyeN', 'hitEyeSize', 'hitEyeDelay', 'hitEyeStagger',
  'suitFrom', 'hitBoil',
]

export const FLIGHT_KEYS: (keyof Tune)[] = [
  'jkFlick', 'jkRise', 'jkApex', 'jkPeak', 'jkDelay', 'jkOver', 'jkHold', 'jkSink', 'jkFall', 'jkFallFor', 'jkEaseUp', 'jkWind', 'jkEaseDown', 'jkDive', 'jkEaseCoin', 'jkLag',
  'jkSpinUp', 'jkSpinTop', 'jkSpinLand',
]

export const BACKDROP_KEYS: (keyof Tune)[] = ['bgStyle', 'bgStrength', 'bgDetail', 'bgMotion', 'bgGlow']

export const ROULETTE_KEYS: (keyof Tune)[] = [
  'rouTextX', 'rouTextY', 'rouTextSize', 'rouTextR',
  'rouSize', 'rouX', 'rouY', 'rouTilt', 'rouBank', 'rouDelay',
  'rouYaw', 'rouDepth', 'rouScaleX', 'rouScaleY', 'rouScaleZ', 'rouSway', 'rouSwaySpeed',
  'rouEnter', 'rouExit', 'rouDrift', 'rouWheel', 'rouBall',
]

export const ROYAL_FLUSH_KEYS: (keyof Tune)[] = [
  'rfTextX', 'rfTextY', 'rfTextSize', 'rfTextR',
  'rfSize', 'rfX', 'rfY', 'rfTilt', 'rfYaw', 'rfBank', 'rfDepth',
  'rfScaleX', 'rfScaleY', 'rfScaleZ', 'rfSpread', 'rfArc', 'rfSway', 'rfSwaySpeed',
  'rfDelay', 'rfEnter', 'rfStagger', 'rfEnergy', 'rfFlow', 'rfFlowSpeed', 'rfExit', 'rfDrift', 'rfBob', 'rfBobSpeed',
]

/** the red hero chip, independently of the surrounding piles */
export const CHIP_KEYS: (keyof Tune)[] = ['chipX', 'chipZ']

/** the opening title card, for ?jack */
/** the title and everything strewn around it, for ?title */
export const TITLE_KEYS: (keyof Tune)[] = [
  'titleR', 'titleGap', 'titleSize', 'titleSpacing', 'titleWeight', 'titleY',
  'ttAX', 'ttAY', 'ttAS', 'ttAR',
  'ttBX', 'ttBY', 'ttBS', 'ttBR',
  'ttChips', 'ttChipS', 'ttDice', 'ttDiceS', 'ttPropX', 'ttPropZ', 'ttSpread', 'ttSeed',
  'smFps', 'smTravel', 'smFrom', 'smBoil', 'smTurn',
  'wdBeat', 'wdStep', 'wdFrom', 'wdTurn', 'wdSwing', 'wdDrag', 'wdDir', 'wdHand',
  // the eyes live over this part of the shot too, so they are tunable from here
  'eyN', 'eySize', 'eyCover', 'eyDist', 'eyFade', 'eyWeight', 'eyPaper', 'eyGaze',
]

/** the eyes on their own, for ?eyes */
export const EYE_KEYS: (keyof Tune)[] = [
  'eyN', 'eySize', 'eyCover', 'eyDist', 'eyFade',
  'eyAt', 'eyStagger', 'eyWake', 'eyEvery',
  'eyWeight', 'eyPaper', 'eyGaze',
]

export const JACK_KEYS: (keyof Tune)[] = [
  'bgStyle', 'bgStrength', 'bgDetail', 'bgMotion', 'bgGlow',
  'jkSeed', 'jkFlick', 'jkHold', 'jkApex', 'jkPeak', 'jkDelay', 'jkOver', 'jkSink', 'jkRise', 'jkLag', 'jkFall', 'jkFallFor', 'jkEaseUp', 'jkWind', 'jkEaseDown', 'jkDive', 'jkEaseCoin', 'jkSpinUp', 'jkSpinTop', 'jkSpinLand', 'smFps', 'smBoil', 'smTurn', 'wdBeat', 'wdStep', 'wdFrom', 'wdTurn', 'wdSwing', 'wdDrag', 'wdDir', 'wdHand', 'jkInitial', 'jkVary', 'jkScatter', 'jkFit', 'jkLockX', 'jkLockY',
  'jkCardX', 'jkCardY', 'jkCardW', 'jkCardTilt',
  'jkJackX', 'jkJackY', 'jkJackR', 'jkJackS', 'jkFontJack',
  'jkOfX', 'jkOfY', 'jkOfR', 'jkOfS', 'jkFontOf',
  'jkAllX', 'jkAllY', 'jkAllR', 'jkAllS', 'jkFontAll',
  'jkTrX', 'jkTrY', 'jkTrR', 'jkTrS', 'jkFontTrades',
  'jkTCardIn', 'jkTCardLand', 'jkTJack', 'jkTOf', 'jkTAll', 'jkTTrades',
  // the eyes over the card, so the whole beat is tunable from the one panel
  'eyN', 'eySize', 'eyCover', 'eyDist', 'eyFade', 'eyAt', 'eyStagger', 'eyWake', 'eyEvery', 'eyWeight', 'eyPaper', 'eyGaze',
]

/**
 * Values kept across reloads.
 *
 * Only the ones that have MOVED are stored, so a default that changes in the source later is picked up
 * rather than pinned to whatever it happened to be the day something was saved. The URL still wins over
 * the save, since typing a value is a more deliberate act than having saved one once.
 */
/**
 * PER-LETTER tweaks, keyed "word:index".
 *
 * Deliberately NOT fifteen more entries in Tune. The store is a flat table of named numbers that the panel
 * renders one slider per, and a ransom note has as many letters as it has letters - putting them in there
 * would mean sixty sliders for a thing whose whole interface is dragging the letter itself. This is a
 * sparse map instead: a letter that has never been touched has no entry at all, so a default that changes
 * later still reaches every letter nobody has overridden.
 */
export interface LetterTweak {
  s: number
  dx: number
  dy: number
  r: number
}
const NO_TWEAK: LetterTweak = { s: 1, dx: 0, dy: 0, r: 0 }
let letters: Record<string, LetterTweak> = {}
export function getLetter(key: string, fallback?: LetterTweak): LetterTweak {
  return letters[key] ?? fallback ?? NO_TWEAK
}
export function setLetter(key: string, patch: Partial<LetterTweak>) {
  letters[key] = { ...getLetter(key), ...patch }
  bump()
}
/** how many letters have been moved off their word's own numbers */
export function letterCount(): number {
  return Object.keys(letters).length
}

/**
 * The same store, read back for the clipboard.
 *
 * The tune's copy buttons only serialise tune KEYS, and a placement that lives in the sparse map would be
 * silently missing from anything copied - the one thing worse than no copy button is one that quietly
 * drops half the work. `prefix` selects a family, so the burst can be copied without the ransom letters.
 */
export function tweakEntries(prefix: string): [string, LetterTweak][] {
  return Object.entries(letters)
    .filter(([k]) => k.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
}
/** drop every override in one family, leaving the others alone */
export function resetTweaks(prefix: string) {
  for (const k of Object.keys(letters)) if (k.startsWith(prefix)) delete letters[k]
  bump()
}
/**
 * The lockup's centring, LATCHED rather than live.
 *
 * It used to be recomputed every frame from the union of the card and the words, which is right for a
 * layout nobody is touching and wrong the moment somebody is: moving one word changes the union, so the
 * whole line shifts to stay centred and every OTHER word appears to move too. From the chair that reads as
 * the camera drifting whenever you drag anything, which is exactly what it was reported as.
 *
 * So it is computed once, when the lockup is built, and held. Dragging a word then moves that word and
 * nothing else. `recentre()` asks for it again, which is what the panel's button does.
 */
let centreWanted = true
export function recentre() {
  centreWanted = true
  for (const s2 of subs) s2()
}
export function takeRecentre(): boolean {
  if (!centreWanted) return false
  centreWanted = false
  return true
}

export function resetLetters() {
  letters = {}
  bump()
}

/**
 * PER PROP tweaks, keyed "chip:3" or "die:1".
 *
 * The same sparse map the letters use, and for the same reason: the scatter
 * deals a handful from a seed, and dragging one of them is not a reason to turn
 * the other eight into sliders. A prop nobody has touched has no entry, so it
 * still follows the seed; one that has been dragged carries its own place and
 * KEEPS it when the seed is rerolled, which is what "put that one there" has to
 * mean or the reroll button undoes the work.
 *
 * Positions are ABSOLUTE in the cluster's own space rather than offsets from
 * where the seed put it, which is what makes that hold.
 */
export interface PropTweak {
  x: number
  z: number
  s: number
  r: number
}
let props: Record<string, PropTweak> = {}
export function getProp(key: string): PropTweak | undefined {
  return props[key]
}
export function setProp(key: string, patch: Partial<PropTweak>, base: PropTweak) {
  props[key] = { ...(props[key] ?? base), ...patch }
  bump()
}
/** how many props have been moved off the scatter */
export function propCount(): number {
  return Object.keys(props).length
}
export function resetProps() {
  props = {}
  bump()
}
/** the placed props, as something to paste into the source */
export function propsJson(): string {
  return JSON.stringify(props, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v), 1).replace(/\n\s*/g, ' ')
}

const SAVE_KEY = 'casino-tune-v1'
const LETTER_KEY = 'casino-letters-v1'
const PROP_KEY = 'casino-props-v1'
function fromSave(): Partial<Tune> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SAVE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Tune> = {}
    for (const k of Object.keys(TUNE_DEFAULTS) as (keyof Tune)[]) {
      if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k] as number
    }
    return out
  } catch {
    return {}
  }
}
/** stores the keys that differ from the defaults; returns how many */
export function saveTune(keys?: (keyof Tune)[], scope?: { letterPrefixes: string[]; props: boolean }): number {
  const t = ensure()
  const ks = (keys ?? (Object.keys(TUNE_DEFAULTS) as (keyof Tune)[])).filter((k) => t[k] !== TUNE_DEFAULTS[k])
  const prev = fromSave()
  const next: Record<string, number> = { ...prev } as Record<string, number>
  // a key that has been put back to its default is REMOVED, not written as the default, or resetting a
  // slider and saving would silently pin it forever
  for (const k of keys ?? (Object.keys(TUNE_DEFAULTS) as (keyof Tune)[])) delete next[k]
  for (const k of ks) next[k] = t[k]
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(next))
    if (scope) {
      const previous = JSON.parse(window.localStorage.getItem(LETTER_KEY) ?? '{}') as Record<string, LetterTweak>
      const scoped = (key: string) => scope.letterPrefixes.some(prefix => key.startsWith(prefix))
      const nextLetters = Object.fromEntries(Object.entries(previous ?? {}).filter(([key]) => !scoped(key)))
      for (const [key, value] of Object.entries(letters)) if (scoped(key)) nextLetters[key] = value
      window.localStorage.setItem(LETTER_KEY, JSON.stringify(nextLetters))
    } else window.localStorage.setItem(LETTER_KEY, JSON.stringify(letters))
    if (!scope || scope.props) window.localStorage.setItem(PROP_KEY, JSON.stringify(props))
  } catch {
    return -1
  }
  return ks.length + Object.keys(letters).length + Object.keys(props).length
}
/**
 * Undo, one entry per gesture.
 *
 * The store is a flat table of numbers, so an entry is just the keys a gesture touched and what they were
 * before it. Pushed on BEGIN rather than on commit, because a cancelled gesture restores itself and a
 * committed one is exactly the thing you want back - and pushing at the end would mean reading the values
 * after they had already changed.
 */
const undoStack: Partial<Tune>[] = []
export function pushUndo(keys: (keyof Tune)[]) {
  const t = ensure()
  const e: Partial<Tune> = {}
  for (const k of keys) e[k] = t[k]
  undoStack.push(e)
  // a live editor does not need a hundred steps and a runaway stack is a leak
  if (undoStack.length > 60) undoStack.shift()
}
/**
 * Drop the newest entry.
 *
 * For a gesture that was CANCELLED: it pushed on begin, it has already put everything back itself, and
 * leaving the entry there means the next undo is a no-op the user has to press twice to get past.
 */
export function popUndo() {
  undoStack.pop()
}
export function undoTune(): boolean {
  const e = undoStack.pop()
  if (!e) return false
  setTune(e)
  return true
}
export function undoDepth(): number {
  return undoStack.length
}

export function clearSavedTune() {
  try {
    window.localStorage.removeItem(LETTER_KEY)
    window.localStorage.removeItem(PROP_KEY)
  } catch {
    /* private mode */
  }
  resetLetters()
  resetProps()
  return clearSavedTune0()
}
function clearSavedTune0() {
  try {
    window.localStorage.removeItem(SAVE_KEY)
  } catch {
    /* private mode */
  }
}

function loadLetters() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(LETTER_KEY)
    if (raw) letters = JSON.parse(raw) as Record<string, LetterTweak>
    const rawP = window.localStorage.getItem(PROP_KEY)
    if (rawP) props = JSON.parse(rawP) as Record<string, PropTweak>
  } catch {
    letters = {}
    props = {}
  }
}

function fromUrl(): Tune {
  const t = { ...TUNE_DEFAULTS, ...fromSave() }
  if (typeof window === 'undefined') return t
  const q = new URLSearchParams(window.location.search)
  for (const k of Object.keys(t) as (keyof Tune)[]) {
    const v = q.get(k)
    if (v !== null && !Number.isNaN(Number(v))) t[k] = Number(v)
  }
  return t
}

let state: Tune = TUNE_DEFAULTS
let loaded = false
const subs = new Set<() => void>()

/**
 * Tell the store something changed that is NOT in Tune.
 *
 * useSyncExternalStore's snapshot here IS the Tune object, so anything kept
 * beside it, the letters and the props, can be edited without the snapshot ever
 * changing reference: React then bails out of the render and nothing that reads
 * those maps updates. The panel's "copy props (n)" sat at zero through a drag
 * that had already moved the chip, which is what turned this up.
 *
 * A fresh object with identical values is enough. It changes once per edit and
 * is stable in between, so there is no loop.
 */
function bump() {
  if (state) state = { ...state }
  for (const s2 of subs) s2()
}

function ensure() {
  if (!loaded && typeof window !== 'undefined') {
    state = fromUrl()
    loadLetters()
    loaded = true
  }
  return state
}

export function getTune(): Tune {
  return ensure()
}

export function setTune(patch: Partial<Tune>) {
  state = { ...ensure(), ...patch }
  for (const s of subs) s()
}

export function useTune(): Tune {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => ensure(),
    () => TUNE_DEFAULTS,
  )
}

/** the current values as a query string, to paste back into the URL */
export function tuneQuery(): string {
  const t = ensure()
  return (Object.keys(t) as (keyof Tune)[]).map((k) => `${k}=${t[k]}`).join('&')
}


/**
 * ?jack FREEZES the beat, so the title can be dialled while looking at it.
 *
 * A slider is useless against something that is on screen for two seconds and then thrown off the top of
 * the frame: every drag would mean a reload and an eight second wait to see it. With the panel up, the
 * armed clock stops at the held title and everything reads the same stopped value - the lockup, the chip,
 * the camera's height and the lamp that rides it - so the frame is exactly the one the beat passes
 * through, not an approximation of it posed for editing.
 *
 * ?jack on its own holds just after the last word and after the coin has reached its apex, and it FOLLOWS
 * the timing sliders, so pushing TRADES later moves the held frame with it. ?jack=6.2 holds at a chosen
 * second instead, for looking at the fall.
 */
let holdParam: number | null | undefined
let looping = false
let impactLooping = false
/** ?suits: the suit burst's placer is up, so the sprites are draggable */
export function placingSuits(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('suits')
}

export function beatHold(): number | null {
  if (isJackEditor()) return jackEditorTime()
  if (isTitleEyeEditor()) { const t = ensure(); return t.jkFlick + t.jkRise + t.jkHold + t.jkFallFor + 6 }
  if (holdParam === undefined) {
    if (typeof window === 'undefined') return null
    const q = new URLSearchParams(window.location.search)
    if (q.has('impact')) {
      const raw = q.get('impact')
      impactLooping = raw === 'loop'
      looping = impactLooping
      const t = ensure()
      const age = Number(raw)
      holdParam = impactLooping ? null : t.jkFlick + t.jkRise + t.jkHold + t.jkFallFor + (Number.isFinite(age) ? Math.max(0, age) : 0)
      return holdParam
    }
    if (q.has('suits')) {
      // the suit burst only exists inside the flash, so the placer FREEZES there - anywhere else on the
      // beat there is nothing on screen to drag. Mid-flash, not at the hit, so the wave has spread.
      const t = ensure()
      holdParam = t.jkFlick + t.jkRise + t.jkHold + t.jkFallFor + IMPACT_PLACEMENT_AGE
      return holdParam
    }
    if (q.has('flight')) {
      // Keep the detached editors connected while holding a readable roulette
      // pose. Bare ?flight still replays the full shot.
      const raw = q.get('flight')
      const t = ensure()
      const seconds = Number(raw)
      holdParam = raw === 'hold' ? t.jkFlick + t.jkRise * 0.75
        : raw !== '' && Number.isFinite(seconds) && seconds > 0 ? seconds : null
      looping = holdParam === null
      return holdParam
    }
    const raw = q.get('jack')
    if (!q.has('jack')) holdParam = null
    else if (raw === 'loop' || raw === 'play') {
      // ?jack=loop REPLAYS instead of freezing: the panel is up and the beat runs on a cycle
      looping = true
      holdParam = null
    } else {
      const v = Number(raw)
      holdParam = Number.isFinite(v) && v > 0 ? v : NaN
    }
  }
  if (holdParam === null) return null
  if (!Number.isNaN(holdParam)) return holdParam
  /**
   * The auto case, DERIVED from the beat rather than guessed at.
   *
   * It used to be max(4.6, jkTTrades + 0.6), and the 4.6 was the apex back when the coin flicked at 6.1.
   * The moment jkFlick moved, the tuner was holding a frame in the middle of the fall - the title already
   * thrown off the top - which is exactly the frame you cannot tune the title in.
   *
   * What it wants is the last frame where the title is FINISHED and nothing is in front of it, which is
   * the instant before the coin is flicked. Account for the shared word stagger,
   * authored approach, individual landing corrections, and delayed rotation.
   *
   * If the title is not finished by then - the coin set to flick early - it falls back to the apex, which
   * is the next moment everything is up and still. The coin is in the frame there, but a scrap frozen
   * mid-air is no use to a slider at all.
   */
  const t = ensure()
  const settled = Math.max(...[t.jkTJack, t.jkTOf, t.jkTAll, t.jkTTrades].map((cue, i) =>
    (cue + (1.2 - i * .08) / 1.35 + JACK_SEED_LEAD) / 1.3))
  const clean = t.jkFlick - 0.05
  return settled <= clean ? clean : Math.max(settled, t.jkFlick + t.jkRise + t.jkHold)
}

/**
 * The coin's fall, end to end. Not on the panel: the landing and its settle are keyed to it.
 *
 * It is also the DESCENT'S speed for both the coin and the lens, since both cover a fixed distance in it -
 * the lens covers CAM_FALL + jkLift, so shortening this makes the whole drop faster and the impact harder.
 * The settle windows after it are relative, so they follow.
 */
export const FALL_FOR = 1.1

/**
 * How far the lens climbs, worked out from where the coin is wanted in frame rather than set by hand.
 *
 * The first term is the arithmetic: the aim sits lookY over the camera, so a climb of apex - lookY puts
 * the coin on the aim line. That is not quite enough, because the coin is about 12.2 from the lens and the
 * aim point about 12.8 - equal HEIGHTS are not equal ANGLES - and it leaves the coin a tenth of a frame
 * high, so AIM_SKEW is the measured correction. HALF_FRAME is a half-frame at the coin's distance, which
 * is what turns jkPeak from a fraction of the frame into world units.
 *
 * Both are measured, not derived, so they are only right for this lens and this camera distance. If camZ
 * or the fov move, re-measure: set jkPeak to 0, probe the coin's NDC at the moment it LETS GO - not at its
 * apex, which is earlier now that it hangs and is taken while the lens is still climbing - and adjust
 * AIM_SKEW until it reads 0. MORE skew is MORE climb is a LOWER coin, which is the opposite of what the
 * sign of the error suggests, and is worth reading twice.
 */
const AIM_SKEW = -0.15
const HALF_FRAME = 2.92
/**
 * The climb's shape: 0 at the start, 1 at the top. `p` is jkWind where the shape uses it.
 *
 * Exported because the COIN can be put on the same curve (jkEaseCoin). Anything other than "throw" makes
 * the lens a different shape from the coin, and the two then only stay together if the coin is shaped too.
 */
export function easeRise(u: number, kind: number, p: number): number {
  const x = Math.min(1, Math.max(0, u))
  switch (Math.round(kind)) {
    case 1: {
      /**
       * ANTICIPATE: a small crouch the wrong way, then the throw. The counter-move is what stops a launch
       * from looking switched on - it reads as the lens gathering itself rather than being turned on.
       *
       * The dip's LENGTH is the whole thing. It delays the throw by its own width, and at 0.16 that cost
       * two thirds of the coin's visibility during the climb (64 percent -> 26). At 0.09 it costs nothing
       * and gains: 85 percent, better than the plain throw, because the small delay happens to phase the
       * lens onto the coin more closely. Measured, not guessed - do not widen it without re-measuring.
       */
      const a = 0.09
      if (x < a) {
        const c = x / a
        return -0.018 * Math.sin(c * Math.PI)
      }
      const y = (x - a) / (1 - a)
      return 1 - Math.pow(1 - y, p)
    }
    case 2:
      return x * x * (3 - 2 * x)
    case 3: {
      // OVERSHOOT: past the mark and back, on a decaying return rather than a spring, so it settles once
      const y = 1 - Math.pow(1 - x, p)
      return y + 0.055 * Math.sin(Math.PI * x * x) * (1 - x)
    }
    case 4: {
      /**
       * WIND IN: the throw, but the first moment of it is a velocity ramp instead of a step.
       *
       * The throw is at full speed on frame one - that is exactly what lets it stay with the coin, and it
       * is also what makes the start feel harsh. Anticipate fixes the harshness by moving the wrong way
       * first, which is a counter-move you can see. This does neither: the input is warped so the speed
       * climbs from nothing to the throw's own over the first `r` of the climb, and after that it IS the
       * throw. No backwards move, and it costs r/2 of the climb - about the same as the dip.
       *
       * w is C1 at the join by construction: w(0)=0, w'(0)=0, w(r)=r/2, w'(r)=1, then linear.
       */
      const r = 0.16
      const w = x < r ? (x * x) / (2 * r) : x - r / 2
      return 1 - Math.pow(1 - w / (1 - r / 2), p)
    }
    default:
      return 1 - Math.pow(1 - x, p)
  }
}

/** the descent's shape: 0 at the top, 1 on the ground. `p` is jkDive where the shape uses it. */
export function easeFall(v: number, kind: number, p: number): number {
  const x = Math.min(1, Math.max(0, v))
  switch (Math.round(kind)) {
    case 1:
      return x * x * (3 - 2 * x)
    case 2:
      // HEAVY: hangs back and then arrives much harder. Same distance, all of it late.
      return Math.pow(x, p + 1.1)
    case 3: {
      // SETTLE: lands, gives under itself, and comes back up onto the mark. Past 1 is BELOW the mark.
      const y = Math.pow(x, p)
      return y + 0.045 * Math.sin(Math.PI * Math.pow(x, 3)) * x
    }
    default:
      return Math.pow(x, p)
  }
}

export function camClimb(): number {
  const t = ensure()
  return t.jkApex - t.lookY + AIM_SKEW - t.jkPeak * HALF_FRAME
}

/**
 * The camera's height above its table framing at `ft` seconds into the beat: one ballistic arc, up and down.
 *
 * BOTH halves are launched, not eased. It used to climb on a smoothstep, which leaves the mark at zero
 * speed and arrives at zero speed - the softest possible version of a move whose whole job is to feel
 * yanked. `1-(1-u)^2` puts all the speed at the launch and bleeds it off into the apex, which is what a
 * thrown thing does and what the coin itself is already doing.
 */
export function camLift(ft: number, flickAt: number, dropAt: number, fallFor: number, height: number): { y: number; rush: number } {
  const tn = ensure()
  /**
   * FOUR moments at the top, not one, because the coin and the lens do not arrive or leave together.
   *
   *   coinTop   the coin reaches its apex and hangs there (jkRise after the flick)
   *   camTop    the lens finishes climbing, jkOver LATER - the coin is waiting for it, and this is the
   *             frame where the coin is centred
   *   dropAt    the coin lets go and falls, jkHold after its apex. It leaves first, on its own.
   *   fallFrom  the lens follows it down, jkSink later, so it starts the descent already behind
   *
   * The order is the whole beat: the coin gets there, waits to be caught, leaves first, is chased down.
   * jkOver has to be under jkHold or the lens is still climbing when the coin lets go, and jkSink under
   * fallFor or the lens has no time to land.
   */
  // measured from the coin LETTING GO, not from its apex. Those are jkHold apart, and anchoring to the
  // apex meant the real gap was jkOver - jkHold: at 0.08 and 0.06 the lens turned 0.02s after the coin,
  // which is simultaneous as far as the eye is concerned.
  const camTop = dropAt + tn.jkOver
  // NEVER BEFORE THE CLIMB ENDS. At jkSink 0 the lens turns the instant it tops out, so there is no flat
  // stretch anywhere in the arc: it accelerates up, decelerates, reverses, accelerates down. A hold here
  // is the one thing that makes the beat feel locked, because for its whole length nothing in frame moves.
  const fallFrom = Math.max(camTop, dropAt + tn.jkSink)
  const land = dropAt + fallFor
  const climb = camClimb()

  /**
   * The wait eats into the climb, so it cannot have all of it.
   *
   * The lens has from here to camTop to cover the climb. Turning the wait up past that leaves a window of
   * zero or less and the arc divides by it; clamped, the last of the slider simply stops making the wait
   * longer instead of breaking. If it bottoms out, jkRise buys more room - a longer climb is more wait AND
   * more time to cover the distance.
   */
  const up0 = Math.min(flickAt + tn.jkDelay, camTop - 0.15)
  if (ft < up0) return { y: height, rush: 0 }
  if (ft < camTop) {
    /**
     * ACCELERATES INTO IT, rather than launching at full speed: a smoothstep, not the coin's parabola.
     *
     * The coin is thrown, so a parabola is right for it - all its speed at the bottom, decelerating the
     * whole way. The lens is not thrown, it is DRIVEN, and a driven thing starts from nothing and winds up.
     * On the parabola it left at twice its average speed on the first frame, which is a whip pan, and at
     * these heights that is 90 units a second out of a standing start.
     *
     * A smoothstep tops out at 1.5x average through the middle instead, and reaches it gradually. It also
     * arrives with nothing left, which used to be the objection to it and is now exactly what is wanted:
     * the lens arrives as the coin does and HOLDS through the hang, so any speed left at the top would
     * have to be thrown away in a kink.
     */
    const u = (ft - up0) / (camTop - up0)
    return { y: height + climb * easeRise(u, tn.jkEaseUp, tn.jkWind), rush: 0 }
  }
  // ARRIVED. Both are at the top and the coin is centred; it holds here until the coin drops and jkSink
  // more after that, which is what makes the coin leave first.
  if (ft < fallFrom) return { y: height + climb, rush: 0 }
  /**
   * And down, CHASING: jkDive, below 2.
   *
   * The lens has to overtake the coin on the way down, not merely follow it. It starts behind by jkSink
   * and has that much less time, so it must descend FASTER than the coin early and ease as it arrives.
   *
   * The instinct - hold the lens high so it can dive at the end - is backwards, and only measuring shows
   * it: a lens that hangs back lets the coin fall AWAY from it, and an exponent of 3 put the coin a full
   * frame below the bottom edge mid-fall. Below about 1.65 it overtakes so hard the coin pops out of the
   * TOP instead.
   */
  const v = (ft - fallFrom) / Math.max(0.01, land - fallFrom)
  if (v >= 1) return { y: 0, rush: 0 }
  return { y: (height + climb) * (1 - easeFall(v, tn.jkEaseDown, tn.jkDive)), rush: Math.sin(Math.PI * v) }
}

/**
 * ?jack=loop REPLAYS the flight on a cycle, which is the only way to tune a move that happens once.
 *
 * The window starts a little before the coin is flicked - long enough to see the finished title sitting
 * there, which is the state the move has to leave - and ends after the landing has settled. Everything is
 * derived from the same sliders it is showing, so moving the flick or the rise moves the loop with it.
 */
export function beatLoop(): { from: number; to: number } | null {
  beatHold()
  if (!looping) return null
  const t = ensure()
  const hit = t.jkFlick + t.jkRise + t.jkHold + t.jkFallFor
  // The focused loop restarts before the title's 1.1s entrance can latch its letter animation.
  return { from: Math.max(0, impactLooping ? hit - 0.16 : t.jkFlick - 0.8), to: hit + IMPACT_DURATION + (impactLooping ? 0.05 : 0.35) }
}

/**
 * The beat's clock, for everything keyed to it: raw seconds in, playable seconds out.
 *
 * One function so the coin, the title, the camera and the streaks can never disagree about what time it
 * is. Freezing and looping are the same question - what second should this frame draw - and answering it
 * in one place is what keeps a replay from tearing the beat into parts that restart at different moments.
 */
export function beatTime(raw: number): number {
  if (isJackEditor()) return jackEditorTime()
  const hold = beatHold()
  if (hold !== null) return Math.min(raw, hold)
  const lp = beatLoop()
  if (!lp || raw <= lp.to) return raw
  const span = Math.max(0.1, lp.to - lp.from)
  return lp.from + ((raw - lp.from) % span)
}

/** the table reveal runs on pomme's soak curve slowed by this factor (0.6 = the bloom takes ~7 s to the far corners) */
export const REVEAL_TIME_SCALE = 2.0
