import { createRng, fibonacciSphere } from "./pointCloud";

/**
 * Geometry for the diagnostic's one growing composition.
 *
 * Pure maths, no Three.js and no DOM, so the state mapping can be asserted
 * in tests rather than only looked at.
 *
 * ## What it is a picture of
 *
 * The composition is the picture of the business that the diagnostic is
 * assembling. It opens as a loose shell of points — nothing is known yet —
 * and every topic the visitor actually answers is drawn into a disc at the
 * centre. Each topic owns one RING of that disc, of equal area, drawn from
 * the middle outward in the order the questions are asked: the graphic's
 * subject is *how much of the picture exists so far*, which is precisely
 * why the questions are being asked.
 *
 * Rings rather than wedges, which is what this was first built with. A
 * single wedge is a sixth of a circle, and a sixth of a circle on its own
 * does not look like part of a circle — it looks like a clump off to one
 * side. A single ring is already a complete, centred form, so the first
 * answer produces something recognisable and each one after it visibly
 * grows the same object outward.
 *
 * At review the same points regroup into the three groups the review
 * screen itself uses, and only after the server acknowledges persistence
 * do they settle onto the MODUS mark.
 *
 * ## What it replaces
 *
 * Six separated horizontal planes, one per step, each with its own
 * projected label. That was six illustrations sharing a canvas: the planes
 * said nothing except "there are six steps", which the progress bar
 * already says better, and the labels lined up into what read as a
 * floating menu. Growth driven by real answers says something the rest of
 * the page does not.
 *
 * ## What is NOT in here
 *
 * Any claim about the business. The composition reacts only to *whether* a
 * topic was answered, never to what was answered — no score, no judgement,
 * and no path to the closing composition without a real acknowledged save.
 *
 * One cloud of points with PERSISTENT identities throughout: the same
 * point that sits in the opening cloud becomes a point in a topic's wedge
 * and then a point in the settled mark. Nothing is torn down and rebuilt
 * between stages, which is what makes the stages read as one object being
 * organised rather than several unrelated illustrations.
 */

export type DiagnosticStage =
  /** Before anything is answered: a loose, unordered cloud. */
  | { kind: "entry" }
  /**
   * Answering. `recorded[t]` is true once topic `t` holds a real answer,
   * which is what draws its wedge into the disc — so the composition
   * grows with the answers themselves, not with the step counter. Going
   * back therefore never un-draws a wedge that was genuinely filled in.
   */
  | { kind: "building"; activeTopic: number; recorded: readonly boolean[] }
  /** Review: regrouped into the review screen's own three groups. */
  | { kind: "grouped" }
  /** Compact closure around the MODUS mark. Only after real persistence. */
  | { kind: "settled" };

export const POINT_COUNT = 420;
/** One wedge per diagnostic step. Derived, never hardcoded ahead of the schema. */
export const DEFAULT_TOPICS = 6;

/**
 * Which review group each topic belongs to, in the review screen's own
 * order: "Your work" (business, customers, systems), "What gets in the
 * way" (friction), "What matters first" (priorities, contact).
 *
 * The geometry and the caption read this same array, so a regrouping
 * cannot drift between what is drawn and what is written.
 */
export const GROUP_OF_TOPIC: readonly number[] = [0, 0, 0, 1, 2, 2];
export const REVIEW_GROUP_COUNT = 3;

/**
 * Where not-yet-answered points wait: a shell OUTSIDE the completed disc,
 * in each point's own direction.
 *
 * A multiple of the opening cloud's own radius was tried first and is
 * wrong: that cloud is deliberately uneven, so its inner points landed
 * closer in than the disc's outer ring, and "answered is drawn in" stopped
 * being true for the last topics. An explicit shell makes it true by
 * construction — the minimum halo radius is above the maximum core radius.
 */
const HALO_MIN = 1.42;
const HALO_SPREAD = 0.26;
const HALO_FLATTEN = 0.85;
const CORE_RADIUS = 1.12;
/** How far an actively-being-answered wedge is pulled in before it is recorded. */
const GATHERING = 0.42;
const GOLDEN = 0.6180339887498949;

export interface DiagnosticCloud {
  count: number;
  topics: number;
  /** Which topic wedge each point belongs to. */
  topicOf: Uint8Array;
  /** xyz in the opening cloud — nothing answered. */
  entry: Float32Array;
  /** xyz in the completed disc: every topic's wedge drawn in. */
  core: Float32Array;
  /** xyz while a topic is still unanswered: held out around the disc. */
  halo: Float32Array;
  /** xyz in the review screen's three groups. */
  grouped: Float32Array;
  /** xyz in the settled closing composition. */
  settled: Float32Array;
}

export function buildDiagnosticCloud(
  topics = DEFAULT_TOPICS,
  count = POINT_COUNT,
  seed = 20261004
): DiagnosticCloud {
  const rng = createRng(seed);
  const topicOf = new Uint8Array(count);
  const entry = new Float32Array(count * 3);
  const core = new Float32Array(count * 3);
  const halo = new Float32Array(count * 3);
  const grouped = new Float32Array(count * 3);
  const settled = new Float32Array(count * 3);

  /*
   * Topics are INTERLEAVED along the point index, not taken in blocks.
   *
   * `fibonacciSphere` walks its spiral from one pole to the other, so a
   * block assignment gave topic 0 the top of the opening cloud and topic 5
   * the bottom. The visible result: with the first three topics answered,
   * every remaining point was in the lower hemisphere, and the waiting
   * points read as a skirt of dust under the picture instead of a shell
   * around it. Taking every sixth point gives each topic the whole sphere.
   */
  const topicFor = (i: number) => i % topics;
  const indexWithinTopic = (i: number) => Math.floor(i / topics);
  const pointsInTopic = (topic: number) => Math.ceil((count - topic) / topics);

  // Group sizes have to be known before a point can be placed within its
  // cluster, so they are counted first rather than guessed.
  const groupTotals = new Array(REVIEW_GROUP_COUNT).fill(0);
  for (let i = 0; i < count; i++) {
    groupTotals[GROUP_OF_TOPIC[topicFor(i)] ?? 0]++;
  }
  const groupSeen = new Array(REVIEW_GROUP_COUNT).fill(0);

  for (let i = 0; i < count; i++) {
    const topic = topicFor(i);
    topicOf[i] = topic;
    const withinTopic = indexWithinTopic(i);
    const topicTotal = pointsInTopic(topic);

    // --- opening: a loose, unordered cloud ---------------------------
    // Deliberately not a clean Fibonacci shell: "nothing is known yet"
    // should look unresolved, so each point is pushed off the shell by a
    // seeded amount.
    const [sx, sy, sz] = fibonacciSphere(i, count, 1.0);
    const wobble = 0.82 + rng() * 0.46;
    entry[i * 3] = sx * wobble;
    entry[i * 3 + 1] = sy * wobble;
    entry[i * 3 + 2] = sz * wobble;

    // Unanswered topics wait on a shell outside the disc, each in its own
    // direction, so being drawn in reads as a movement inward rather than
    // a jump across the frame.
    const len = Math.hypot(entry[i * 3], entry[i * 3 + 1], entry[i * 3 + 2]) || 1;
    const haloR = HALO_MIN + rng() * HALO_SPREAD;
    halo[i * 3] = (entry[i * 3] / len) * haloR;
    halo[i * 3 + 1] = (entry[i * 3 + 1] / len) * haloR;
    // Slightly oblate, so the waiting shell sits around the flat disc
    // rather than reaching toward the camera. Not flatter than this:
    // `HALO_MIN * HALO_FLATTEN` has to stay above `CORE_RADIUS`, or a
    // point whose direction is mostly depth ends up INSIDE the disc and
    // "answered is drawn in" stops being true for it.
    halo[i * 3 + 2] = (entry[i * 3 + 2] / len) * haloR * HALO_FLATTEN;

    // --- answered: this topic's ring of the one disc ------------------
    // Equal AREA per topic, not equal width: `sqrt` of the fraction of the
    // disc this topic covers puts ring t between sqrt(t/n) and
    // sqrt((t+1)/n) of the radius. Every topic is therefore the same share
    // of the picture, and no ring reads as denser than its neighbours.
    const frac = (topic + (withinTopic + 0.5) / topicTotal) / topics;
    const r = CORE_RADIUS * Math.sqrt(frac);
    const angle = Math.PI * 2 * ((withinTopic * GOLDEN) % 1);
    core[i * 3] = Math.cos(angle) * r + (rng() - 0.5) * 0.03;
    core[i * 3 + 1] = Math.sin(angle) * r + (rng() - 0.5) * 0.03;
    // A shallow dome, so the disc has body when the scene drifts.
    core[i * 3 + 2] = 0.32 * (1 - frac) + (rng() - 0.5) * 0.04;

    // --- review: the three groups the review screen itself uses -------
    const group = GROUP_OF_TOPIC[topic] ?? 0;
    const gFrac = (groupSeen[group] + 0.5) / groupTotals[group];
    groupSeen[group]++;
    const gr = 0.52 * Math.sqrt(gFrac);
    const gAngle = Math.PI * 2 * ((groupSeen[group] * GOLDEN) % 1);
    // Stacked top to bottom in the review groups' own order.
    const gy = (1 - group) * 0.82;
    grouped[i * 3] = Math.cos(gAngle) * gr + (rng() - 0.5) * 0.03;
    grouped[i * 3 + 1] = gy + Math.sin(gAngle) * gr * 0.62 + (rng() - 0.5) * 0.03;
    grouped[i * 3 + 2] = 0.16 * (1 - gFrac) + (rng() - 0.5) * 0.04;

    // --- success: compact closure around the mark --------------------
    settled.set(markPoint(i, rng), i * 3);
  }

  return { count, topics, topicOf, entry, core, halo, grouped, settled };
}

/**
 * Distributes points over the MODUS mark: a centre square plus four
 * detached orthogonal bars. Proportions match the SVG and the 3D panel, so
 * the closure is recognisably the mark rather than a generic cluster.
 */
function markPoint(i: number, rng: () => number): [number, number, number] {
  const S = 1.15; // overall scale
  const slot = i % 5;
  const j = (v: number) => (rng() - 0.5) * v;
  const z = j(0.06);
  switch (slot) {
    case 0: // centre square
      return [j(0.26) * S, j(0.26) * S, z];
    case 1: // top bar
      return [j(0.1) * S, (0.3 + rng() * 0.33) * S, z];
    case 2: // bottom bar
      return [j(0.1) * S, -(0.3 + rng() * 0.33) * S, z];
    case 3: // left bar
      return [-(0.3 + rng() * 0.33) * S, j(0.1) * S, z];
    default: // right bar
      return [(0.3 + rng() * 0.33) * S, j(0.1) * S, z];
  }
}

/**
 * Target positions for a stage.
 *
 * The three composed stages are precomputed and returned directly. The
 * growing stage depends on which topics are answered, so it is written
 * into `out` — the caller owns one scratch buffer for the lifetime of the
 * scene rather than allocating one per frame.
 */
export function targetsFor(
  cloud: DiagnosticCloud,
  stage: DiagnosticStage,
  out?: Float32Array
): Float32Array {
  switch (stage.kind) {
    case "entry":
      return cloud.entry;
    case "grouped":
      return cloud.grouped;
    case "settled":
      return cloud.settled;
    case "building": {
      const buf = out && out.length === cloud.count * 3 ? out : new Float32Array(cloud.count * 3);
      for (let i = 0; i < cloud.count; i++) {
        const topic = cloud.topicOf[i];
        const recorded = stage.recorded[topic] === true;
        const gathering = !recorded && topic === stage.activeTopic;
        for (let c = 0; c < 3; c++) {
          const k = i * 3 + c;
          if (recorded) buf[k] = cloud.core[k];
          else if (gathering) buf[k] = cloud.halo[k] + (cloud.core[k] - cloud.halo[k]) * GATHERING;
          else buf[k] = cloud.halo[k];
        }
      }
      return buf;
    }
  }
}

/**
 * Per-point emphasis in 0..1.
 *
 * The topic being answered is brought forward, topics already answered
 * stay quietly visible, and topics not yet reached are subdued — so the
 * composition says where the visitor is and how much is recorded, without
 * claiming anything about their business.
 */
export function emphasisFor(cloud: DiagnosticCloud, stage: DiagnosticStage, i: number): number {
  if (stage.kind !== "building") return 1;
  const topic = cloud.topicOf[i];
  if (topic === stage.activeTopic) return 1;
  return stage.recorded[topic] === true ? 0.62 : 0.16;
}

const NOTHING_RECORDED: readonly boolean[] = [];

/** Maps the diagnostic's own screen/step model onto a stage. */
export function stageFor(
  screen: string,
  step: number,
  recorded: readonly boolean[] = NOTHING_RECORDED,
  topics = DEFAULT_TOPICS
): DiagnosticStage {
  switch (screen) {
    case "form":
      return {
        kind: "building",
        activeTopic: Math.min(topics - 1, Math.max(0, step)),
        recorded,
      };
    case "review":
    // Submitting holds the review structure: nothing may anticipate
    // success before the server has confirmed persistence.
    case "submitting":
    // A failed submission stays in the review structure too.
    case "submit_error":
      return { kind: "grouped" };
    case "result":
    case "profile":
      return { kind: "settled" };
    default:
      return { kind: "entry" };
  }
}

/**
 * How complete the picture is, 0..1 — the one number the composition is
 * actually about. Shown as text beside it, so the same information reaches
 * a reader who cannot see the canvas.
 */
export function completeness(recorded: readonly boolean[], topics = DEFAULT_TOPICS): number {
  if (topics <= 0) return 0;
  let n = 0;
  for (let t = 0; t < topics; t++) if (recorded[t] === true) n++;
  return n / topics;
}
