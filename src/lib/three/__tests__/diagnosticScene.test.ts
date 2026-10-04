import { describe, expect, it } from "vitest";
import {
  buildDiagnosticCloud,
  completeness,
  DEFAULT_TOPICS,
  emphasisFor,
  GROUP_OF_TOPIC,
  REVIEW_GROUP_COUNT,
  stageFor,
  targetsFor,
} from "../diagnosticScene";

const ALL = Array(DEFAULT_TOPICS).fill(true);
const NONE = Array(DEFAULT_TOPICS).fill(false);

describe("stage mapping", () => {
  it("opens on the unresolved cloud", () => {
    expect(stageFor("intro", 0)).toEqual({ kind: "entry" });
  });

  it("builds, carrying the current topic and what has been recorded", () => {
    const recorded = [true, false, false, false, false, false];
    expect(stageFor("form", 1, recorded)).toEqual({
      kind: "building",
      activeTopic: 1,
      recorded,
    });
  });

  it("clamps an out-of-range step instead of producing a missing topic", () => {
    expect(stageFor("form", 99, NONE)).toMatchObject({ activeTopic: 5 });
    expect(stageFor("form", -4, NONE)).toMatchObject({ activeTopic: 0 });
  });

  it("HOLDS the review structure while submitting and on failure", () => {
    // Nothing may anticipate success: a pending or failed submission must
    // look identical to review, never like the closing composition.
    expect(stageFor("review", 5, ALL)).toEqual({ kind: "grouped" });
    expect(stageFor("submitting", 5, ALL)).toEqual({ kind: "grouped" });
    expect(stageFor("submit_error", 5, ALL)).toEqual({ kind: "grouped" });
  });

  it("reaches the closing composition ONLY after acknowledged persistence", () => {
    expect(stageFor("result", 5, ALL)).toEqual({ kind: "settled" });
    // A returning visitor with an already-submitted record renders the
    // settled state directly, without replaying the first-submission motion.
    expect(stageFor("profile", 0)).toEqual({ kind: "settled" });

    for (const screen of ["intro", "form", "review", "submitting", "submit_error"]) {
      expect(stageFor(screen, 2, ALL).kind).not.toBe("settled");
    }
  });
});

describe("the composition grows with the answers", () => {
  const cloud = buildDiagnosticCloud();
  const radius = (buf: Float32Array, i: number) =>
    Math.hypot(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
  /** A point belonging to the given topic. */
  const pointOf = (topic: number) => cloud.topicOf.indexOf(topic);

  it("is deterministic for a given seed", () => {
    const again = buildDiagnosticCloud();
    expect(Array.from(again.entry.slice(0, 30))).toEqual(Array.from(cloud.entry.slice(0, 30)));
  });

  it("keeps point identities across every stage", () => {
    const scratch = new Float32Array(cloud.count * 3);
    for (const stage of [
      { kind: "entry" } as const,
      { kind: "building", activeTopic: 1, recorded: NONE } as const,
      { kind: "grouped" } as const,
      { kind: "settled" } as const,
    ]) {
      expect(targetsFor(cloud, stage, scratch).length).toBe(cloud.count * 3);
    }
  });

  it("draws a recorded topic IN and leaves an unanswered one OUT", () => {
    // The claim the whole graphic rests on: answering is what moves points
    // toward the centre, so the picture visibly fills in.
    const recorded = [true, false, false, false, false, false];
    const built = targetsFor(cloud, { kind: "building", activeTopic: 1, recorded });
    const answered = pointOf(0);
    const unanswered = pointOf(4);
    expect(radius(built, answered)).toBeLessThan(radius(built, unanswered));
  });

  it("puts every answered point inside every waiting one, with no overlap", () => {
    // The invariant the "drawn in" reading depends on. An earlier version
    // placed the waiting points at a multiple of the opening cloud's own
    // uneven radius, and its inner points landed closer in than the disc's
    // outer ring — so answering the last topic moved points OUTWARD.
    let maxCore = 0;
    let minHalo = Infinity;
    for (let i = 0; i < cloud.count; i++) {
      maxCore = Math.max(maxCore, Math.hypot(cloud.core[i * 3], cloud.core[i * 3 + 1]));
      minHalo = Math.min(minHalo, radius(cloud.halo, i));
    }
    expect(maxCore).toBeLessThan(minHalo);
  });

  it("spreads each topic over the WHOLE opening cloud, not one band of it", () => {
    /*
     * Topics were first assigned in blocks of consecutive indices, and
     * `fibonacciSphere` walks pole to pole — so topic 0 was the top of the
     * cloud and topic 5 the bottom. With the first three answered, every
     * waiting point sat in the lower hemisphere and read as a skirt of
     * dust beneath the picture rather than a shell around it.
     */
    for (let t = 0; t < 6; t++) {
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < cloud.count; i++) {
        if (cloud.topicOf[i] !== t) continue;
        minY = Math.min(minY, cloud.entry[i * 3 + 1]);
        maxY = Math.max(maxY, cloud.entry[i * 3 + 1]);
      }
      // Each topic reaches both poles of the opening cloud.
      expect(minY).toBeLessThan(-0.7);
      expect(maxY).toBeGreaterThan(0.7);
    }
  });

  it("gives every topic the same number of points", () => {
    const counts = Array(6).fill(0);
    for (let i = 0; i < cloud.count; i++) counts[cloud.topicOf[i]]++;
    expect(new Set(counts).size).toBe(1);
  });

  it("gives each topic its own ring, ordered outward from the centre", () => {
    // Rings, not wedges: one wedge of a circle does not read as part of a
    // circle, and the first answer has to produce something recognisable.
    const bounds = Array.from({ length: 6 }, () => ({ min: Infinity, max: 0 }));
    for (let i = 0; i < cloud.count; i++) {
      const r = Math.hypot(cloud.core[i * 3], cloud.core[i * 3 + 1]);
      const b = bounds[cloud.topicOf[i]];
      b.min = Math.min(b.min, r);
      b.max = Math.max(b.max, r);
    }
    for (let t = 1; t < 6; t++) {
      expect(bounds[t].min).toBeGreaterThan(bounds[t - 1].min);
      expect(bounds[t].max).toBeGreaterThan(bounds[t - 1].max);
    }
    // Equal area per topic: each ring's width shrinks as it moves out, so
    // no topic reads as a bigger share of the picture than another.
    const widths = bounds.map((b) => b.max - b.min);
    expect(widths[5]).toBeLessThan(widths[0]);
  });

  it("pulls the topic being answered part of the way in, but not all the way", () => {
    const recorded = [...NONE];
    const active = pointOf(2);
    const untouched = pointOf(4);
    const built = targetsFor(cloud, { kind: "building", activeTopic: 2, recorded });
    const gathering = radius(built, active);
    expect(gathering).toBeLessThan(radius(built, untouched));
    // Still further out than if it had actually been answered.
    const answered = targetsFor(cloud, {
      kind: "building",
      activeTopic: 2,
      recorded: ALL,
    });
    expect(gathering).toBeGreaterThan(radius(answered, active));
  });

  it("does not move a recorded topic when the step changes", () => {
    // Back-navigation and editing must not un-draw a topic that genuinely
    // holds an answer; only the emphasis follows the step.
    const recorded = [true, true, false, false, false, false];
    const atStep1 = targetsFor(cloud, { kind: "building", activeTopic: 1, recorded });
    const atStep4 = targetsFor(
      cloud,
      { kind: "building", activeTopic: 4, recorded },
      new Float32Array(cloud.count * 3)
    );
    const i = pointOf(0);
    expect(atStep1[i * 3]).toBeCloseTo(atStep4[i * 3], 6);
    expect(atStep1[i * 3 + 1]).toBeCloseTo(atStep4[i * 3 + 1], 6);
  });

  it("writes into the caller's scratch buffer rather than allocating", () => {
    const scratch = new Float32Array(cloud.count * 3);
    const out = targetsFor(cloud, { kind: "building", activeTopic: 0, recorded: ALL }, scratch);
    expect(out).toBe(scratch);
  });

  it("collects the topics into exactly the review screen's three groups", () => {
    const grouped = cloud.grouped;
    const ys = new Map<number, number[]>();
    for (let i = 0; i < cloud.count; i++) {
      const g = GROUP_OF_TOPIC[cloud.topicOf[i]];
      (ys.get(g) ?? ys.set(g, []).get(g)!).push(grouped[i * 3 + 1]);
    }
    expect(ys.size).toBe(REVIEW_GROUP_COUNT);
    // Three distinct clusters, in the groups' own top-to-bottom order.
    const centres = [...ys.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v.reduce((s, y) => s + y, 0) / v.length);
    expect(centres[0]).toBeGreaterThan(centres[1]);
    expect(centres[1]).toBeGreaterThan(centres[2]);
  });

  it("emphasises the topic being answered, keeps recorded ones visible, subdues the rest", () => {
    const recorded = [true, false, false, true, false, false];
    const stage = { kind: "building", activeTopic: 1, recorded } as const;
    const byTopic = (topic: number) => emphasisFor(cloud, stage, pointOf(topic));
    expect(byTopic(1)).toBe(1); // being answered
    expect(byTopic(0)).toBeGreaterThan(0); // recorded
    expect(byTopic(0)).toBeLessThan(1);
    expect(byTopic(2)).toBeLessThan(byTopic(3)); // not reached < recorded
  });

  it("applies no emphasis gradient outside the answering stage", () => {
    expect(emphasisFor(cloud, { kind: "grouped" }, 0)).toBe(1);
    expect(emphasisFor(cloud, { kind: "settled" }, 0)).toBe(1);
    expect(emphasisFor(cloud, { kind: "entry" }, 0)).toBe(1);
  });
});

describe("completeness", () => {
  it("reports the fraction of topics actually recorded", () => {
    expect(completeness(NONE)).toBe(0);
    expect(completeness(ALL)).toBe(1);
    expect(completeness([true, true, true, false, false, false])).toBe(0.5);
  });

  it("counts only genuine trues, so a sparse array cannot inflate it", () => {
    const sparse: boolean[] = [];
    sparse[0] = true;
    expect(completeness(sparse)).toBeCloseTo(1 / 6, 6);
  });
});
