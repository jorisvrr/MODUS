"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  BASE_DOT_SIZE,
  BREATHING_AMPLITUDE,
  DOT_SIZE_MULTIPLIER,
  DRIFT_AMPLITUDE,
  ELASTIC,
  TIER_SCALE,
  advanceLifecycle,
  buildCloud,
  createLifecycles,
  createRng,
  cycleProgress,
  easeInOutCirc,
  localProgress,
  smoothstep,
  type CloudGeometry,
} from "@/lib/three/pointCloud";
import {
  isHeroSphere,
  isHeroNotificationWindow,
} from "@/lib/three/heroNotifications";
import { LogoMark } from "@/components/ui/Logo";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useResolvedTheme } from "@/lib/theme/useResolvedTheme";

const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Perspective-dependent pixel size: a dot further from the camera is
    // smaller, which is what makes the sphere read as volume rather than a
    // flat ring of dots.
    gl_PointSize = aSize * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = dot(c, c);
    if (d > 0.25) discard;          // circular sprite, not a square
    float a = smoothstep(0.25, 0.18, d);
    gl_FragColor = vec4(vColor, a);
  }
`;

const LINE_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = vAlpha * uOpacity;
    if (a <= 0.001) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Hero point cloud. Buffered `Points` with typed arrays mutated in the
 * frame loop — no DOM element per dot, no React state per frame, no
 * per-frame geometry or material construction.
 *
 * Anchoring: this component lays out a transparent anchor box at its own
 * size, then overscans the canvas around that anchor's centre using the
 * measured relationship `W = 2·max(cx, heroW − cx)`, `H = 2·max(cy,
 * heroH − cy)`, origin `(cx − W/2, cy − H/2)`. That is what lets dots
 * drift across the background while the sphere itself stays beside the
 * headline. A ResizeObserver keeps it correct through resize and font
 * loading.
 *
 * Fallbacks, all deliberate rather than inherited:
 *  - reduced motion renders a single stable ordered sphere and never
 *    starts a frame loop;
 *  - WebGL failure renders a static accessible description instead;
 *  - offscreen (IntersectionObserver) and `document.hidden` both stop the
 *    loop, and the frame delta is capped at 0.05s so a backgrounded tab
 *    does not resume with one enormous step.
 */
export function HeroScene({
  className = "",
  bubbles = [],
  bubblesNote,
}: {
  className?: string;
  /** Short process messages shown one at a time over the scene. */
  bubbles?: readonly string[];
  /** One static sentence explaining that the bubbles are illustrative. */
  bubblesNote?: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLParagraphElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleTextRef = useRef<HTMLSpanElement>(null);
  // Read inside the frame loop; a ref avoids rebuilding the whole scene
  // effect (and the WebGL context with it) when the dictionary object
  // identity changes on a locale switch. Synced in an effect rather than
  // during render, so the scene picks up translated copy on its next
  // bubble without being torn down.
  const bubblesRef = useRef<readonly string[]>(bubbles);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);
  const reducedMotion = usePrefersReducedMotion();
  const resolvedTheme = useResolvedTheme();

  useEffect(() => {
    const anchor = anchorRef.current;
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!anchor || !canvas || !fallback) return;

    // The fallback is swapped in by touching the DOM directly rather than
    // by setting React state. Both elements are always rendered; this
    // effect only decides which is shown. Driving it through setState
    // would be a synchronous cascading render in an effect body, and it
    // would also flash the canvas for one frame before the swap.
    const showFallback = () => {
      canvas.hidden = true;
      fallback.hidden = false;
    };

    if (!webglAvailable()) {
      showFallback();
      return;
    }

    // Quality tier. Coarse pointers and narrow viewports get the low
    // setting: fewer nodes and DPR 1, which is a real reduction in
    // fragment work rather than a cosmetic one.
    const lowQuality =
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
    const count = lowQuality ? 72 : 111;
    const dprCap = lowQuality ? 1 : 2;
    // The reference's dots are chunky — they are the subject. The spec's
    // base (0.05 × 1.6) renders a regular node at ~4px at this camera
    // distance, which disappeared against the lines; this lifts the whole
    // hierarchy without changing the 1 / 1.7 / 2.6 ratios between tiers.
    const pointScale = lowQuality ? 1.5 : 1.3;

    const cloud: CloudGeometry = buildCloud(count);
    const rng = createRng(99117);

    // Theme inversion for the non-accent nodes.
    //
    // `buildCloud` assigns ~40% of nodes the reference's dark ink, which
    // is correct on the light ground and effectively invisible on the dark
    // one — in a dark capture those nodes simply disappeared and the
    // sphere read as 40% sparser than it is. The green family carries
    // enough luminance to work on both grounds, so only the ink nodes
    // flip, to the cream that is already dark mode's text colour. The
    // *proportion* of accent to non-accent is identical in both themes;
    // only which end of the contrast range the non-accent sits at changes.
    const dark = resolvedTheme === "dark";
    if (dark) {
      for (let i = 0; i < count; i++) {
        if (cloud.colored[i]) continue;
        cloud.colors[i * 3] = 0.957;
        cloud.colors[i * 3 + 1] = 0.957;
        cloud.colors[i * 3 + 2] = 0.906; // #F4F4E7
      }
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !lowQuality,
        powerPreference: "high-performance",
      });
    } catch {
      // Context creation can fail even when the capability probe passed —
      // too many live contexts on the page, or a driver refusing one.
      showFallback();
      return;
    }
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const BASE_FOV = 45;
    const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    // --- Points ----------------------------------------------------------
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    pointGeo.setAttribute("aColor", new THREE.BufferAttribute(cloud.colors, 3));
    pointGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const pointMat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(pointGeo, pointMat);
    const root = new THREE.Group();
    root.add(points);
    scene.add(root);

    // --- Network edges ----------------------------------------------------
    const edgeCount = cloud.edges.length / 2;
    const edgePos = new Float32Array(edgeCount * 2 * 3);
    const edgeCol = new Float32Array(edgeCount * 2 * 3);
    const edgeAlpha = new Float32Array(edgeCount * 2).fill(1);
    // Hairlines follow the same inversion as the ink nodes.
    const edgeRGB = dark ? [0.957, 0.957, 0.906] : [0.102, 0.086, 0.078];
    for (let e = 0; e < edgeCount * 2; e++) {
      edgeCol[e * 3] = edgeRGB[0];
      edgeCol[e * 3 + 1] = edgeRGB[1];
      edgeCol[e * 3 + 2] = edgeRGB[2];
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
    edgeGeo.setAttribute("aColor", new THREE.BufferAttribute(edgeCol, 3));
    edgeGeo.setAttribute("aAlpha", new THREE.BufferAttribute(edgeAlpha, 1));
    const edgeMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: { uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    root.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // --- Radial spokes ----------------------------------------------------
    // Centre vertex alpha 0, node vertex alpha 1 — so each spoke fades out
    // of nothing at the centre and carries its node's colour at the rim.
    const spokePos = new Float32Array(count * 2 * 3);
    const spokeCol = new Float32Array(count * 2 * 3);
    const spokeAlpha = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      spokeAlpha[i * 2] = 0;
      spokeAlpha[i * 2 + 1] = 1;
      for (let k = 0; k < 3; k++) {
        spokeCol[i * 2 * 3 + k] = cloud.colors[i * 3 + k];
        spokeCol[(i * 2 + 1) * 3 + k] = cloud.colors[i * 3 + k];
      }
    }
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute("position", new THREE.BufferAttribute(spokePos, 3));
    spokeGeo.setAttribute("aColor", new THREE.BufferAttribute(spokeCol, 3));
    spokeGeo.setAttribute("aAlpha", new THREE.BufferAttribute(spokeAlpha, 1));
    const spokeMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: { uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    root.add(new THREE.LineSegments(spokeGeo, spokeMat));

    // --- Sizing and overscan ---------------------------------------------
    const hero = anchor.closest("section") ?? anchor.parentElement!;

    function layout() {
      const a = anchor!.getBoundingClientRect();
      const h = hero.getBoundingClientRect();
      const cx = a.left - h.left + a.width / 2;
      const cy = a.top - h.top + a.height / 2;
      const W = 2 * Math.max(cx, h.width - cx);
      const H = 2 * Math.max(cy, h.height - cy);
      if (W <= 0 || H <= 0) return;

      // Positioned relative to the anchor, which is what the canvas's
      // containing block is — so the origin is expressed in anchor space.
      canvas!.style.left = `${cx - W / 2 - (a.left - h.left)}px`;
      canvas!.style.top = `${cy - H / 2 - (a.top - h.top)}px`;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;

      const aspect = W / H;
      camera.aspect = aspect;
      // Portrait: widen the FOV so the sphere keeps its horizontal framing
      // instead of being cropped. Degrees in, degrees out — the conversion
      // is explicit because mixing the two silently produces a camera that
      // looks almost right.
      const fov =
        aspect < 1
          ? Math.min(
              120,
              (2 *
                Math.atan(Math.tan((BASE_FOV * Math.PI) / 180 / 2) / aspect) *
                180) /
                Math.PI,
            )
          : BASE_FOV;
      camera.fov = fov;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setSize(W, H, false);
    }

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(anchor);
    ro.observe(hero);

    // --- Interaction ------------------------------------------------------
    let rotX = 0;
    let rotY = 0;
    let velX = 0;
    let velY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let activePointer: number | null = null;

    function onPointerDown(e: PointerEvent) {
      // Only take the primary button / first touch, and never swallow a
      // right-click or a second finger.
      if (!e.isPrimary) return;
      dragging = true;
      activePointer = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas!.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragging || e.pointerId !== activePointer) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      rotY += dx * 0.005;
      rotX += dy * 0.005;
      // Velocity is stored per input pixel and converted to a per-second
      // rate at release, so inertia is frame-rate independent.
      velY = dx * 0.005;
      velX = dy * 0.005;
    }

    function endDrag(e: PointerEvent) {
      if (e.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      if (canvas!.hasPointerCapture(e.pointerId))
        canvas!.releasePointerCapture(e.pointerId);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    // pointercancel fires when the browser takes the gesture over — most
    // importantly when a touch turns into a page scroll. Without this the
    // cloud keeps rotating with a finger that is no longer ours.
    canvas.addEventListener("pointercancel", endDrag);
    const onBlur = () => {
      dragging = false;
      activePointer = null;
    };
    window.addEventListener("blur", onBlur);

    // --- Process bubbles --------------------------------------------------
    // One bubble per settled sphere hold. All timing uses VISIBLE ACTIVE time: the
    // clock is `elapsed`, which only advances while the frame loop runs,
    // so an offscreen or hidden-tab scene accrues no backlog and resumes
    // with a normal gap instead of a burst.
    //
    // This rides the existing render loop. It deliberately does not start
    // a second rAF, and it never touches scroll state, so it cannot affect
    // the page's scroll-linked motion.
    const BUBBLE_FIRST_DELAY = 1.6; // quiet beat after the scene appears
    const BUBBLE_HOLD = 3.0;
    const BUBBLE_GAP = 2.0; // hold + gap ~= one bubble per 5s
    const BUBBLE_FADE = 0.25;
    // Mobile omits them rather than covering the scene with a card that
    // barely fits; reduced motion keeps the sphere still without popups.
    const bubblesEnabled = !lowQuality && !reducedMotion;

    let bubbleIndex = -1;
    let bubbleNode = 0;
    let bubbleShownAt = -Infinity;
    let bubbleVisible = false;
    let nextBubbleAt = BUBBLE_FIRST_DELAY;
    const bubbleEl = bubbleRef.current;
    const bubbleTextEl = bubbleTextRef.current;

    function pickBubble() {
      const list = bubblesRef.current;
      if (!list.length) return;
      // Rotate without an immediate repeat.
      bubbleIndex =
        list.length === 1
          ? 0
          : (bubbleIndex + 1 + Math.floor(rng() * (list.length - 1))) %
            list.length;
      // Anchor to a node the scene actually gives meaning to: a green
      // ("colored") node, i.e. one the illustration marks as a signal.
      let tries = 0;
      do {
        bubbleNode = Math.floor(rng() * count);
        tries++;
      } while (!cloud.colored[bubbleNode] && tries < 24);
      if (bubbleTextEl) bubbleTextEl.textContent = list[bubbleIndex];
    }

    const projected = new THREE.Vector3();

    function updateBubble() {
      if (!bubbleEl) return;
      const sphere = reducedMotion || isHeroSphere(elapsed);
      anchor!.dataset.scenePhase = sphere ? "sphere" : "network";
      // A hard gate also protects against a paused CSS fade surviving a morph.
      bubbleEl.hidden = !bubblesEnabled || !sphere;
      if (!bubblesEnabled) return;
      if (!isHeroNotificationWindow(elapsed)) {
        bubbleVisible = false;
        bubbleEl.dataset.state = "out";
        return;
      }

      if (
        !bubbleVisible &&
        elapsed >= nextBubbleAt &&
        bubblesRef.current.length > 0
      ) {
        pickBubble();
        bubbleVisible = true;
        bubbleShownAt = elapsed;
        bubbleEl.dataset.state = "in";
      } else if (bubbleVisible && elapsed - bubbleShownAt > BUBBLE_HOLD) {
        bubbleVisible = false;
        bubbleEl.dataset.state = "out";
        nextBubbleAt = elapsed + BUBBLE_FADE + BUBBLE_GAP;
      }

      if (!bubbleVisible && elapsed - bubbleShownAt > BUBBLE_HOLD + BUBBLE_FADE)
        return;

      // Project the node's CURRENT world position through the live camera
      // into canvas-relative CSS pixels, every frame. The cloud rotates
      // and breathes continuously, so a fixed offset would detach.
      projected.set(
        positions[bubbleNode * 3],
        positions[bubbleNode * 3 + 1],
        positions[bubbleNode * 3 + 2],
      );
      root.localToWorld(projected);
      projected.project(camera);

      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      // Behind the camera, or outside the frame: suppress rather than
      // pin a label to a point that is not really there.
      if (
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      ) {
        bubbleEl.dataset.state = "out";
        return;
      }
      const px = (projected.x * 0.5 + 0.5) * w;
      const py = (-projected.y * 0.5 + 0.5) * h;

      /*
       * Canvas space is NOT the bubble's space.
       *
       * The canvas is overscanned: `layout()` sizes it to the whole hero
       * and offsets it with negative `left`/`top` so it is centred on the
       * anchor. The bubble is `absolute left-0 top-0` inside the anchor.
       * Positioning it with raw canvas pixels therefore placed it up to a
       * full overscan to the right — measured on production at x≈1790 in
       * a 1440px viewport, outside the hero's `overflow: hidden` box and
       * so clipped away entirely on every cycle. The bubbles were running
       * the whole time; they were off-screen.
       *
       * Adding the canvas's own offset converts into anchor space, and
       * the clamp then uses the ANCHOR's box — the visible scene area —
       * rather than the overscanned canvas, so a bubble can neither hang
       * off the scene nor drift over the headline column.
       */
      const canvasLeft = parseFloat(canvas!.style.left) || 0;
      const canvasTop = parseFloat(canvas!.style.top) || 0;
      const hostW = anchor!.clientWidth;
      const hostH = anchor!.clientHeight;

      const bw = bubbleEl.offsetWidth || 180;
      const bh = bubbleEl.offsetHeight || 34;
      const pad = 12;
      const x = Math.min(
        Math.max(px + canvasLeft + 14, pad),
        Math.max(pad, hostW - bw - pad),
      );
      const y = Math.min(
        Math.max(py + canvasTop - bh - 10, pad),
        Math.max(pad, hostH - bh - pad),
      );
      bubbleEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }

    // --- Frame loop -------------------------------------------------------
    const lifecycles = createLifecycles(count, rng, 0);
    let elapsed = 0;
    let raf = 0;
    let lastFrame = 0;
    let visible = true;
    let running = false;

    function writeFrame(dt: number) {
      elapsed += dt;
      const raw = reducedMotion ? 1 : cycleProgress(elapsed);
      const globalOrder = easeInOutCirc(raw);

      for (let i = 0; i < count; i++) {
        const l = lifecycles[i];
        if (!reducedMotion) advanceLifecycle(l, elapsed, rng);

        const eased = easeInOutCirc(localProgress(raw, cloud.rippleOffset[i]));

        const i3 = i * 3;
        // Drift and elastic wobble only matter in the disordered state;
        // they are faded out as the cloud organises so the sphere reads as
        // genuinely still at the top of the cycle.
        const wobble = reducedMotion ? 0 : (1 - eased) * DRIFT_AMPLITUDE;
        const ph = i * 1.7;
        const dx = Math.sin(elapsed * 0.6 + ph) * wobble;
        const dy = Math.cos(elapsed * 0.5 + ph * 1.3) * wobble;
        const dz = Math.sin(elapsed * 0.45 + ph * 0.7) * wobble;

        const ex =
          cloud.disorder[i3] + dx + Math.sin(elapsed * 2.1 + ph) * ELASTIC;
        const ey =
          cloud.disorder[i3 + 1] + dy + Math.cos(elapsed * 1.9 + ph) * ELASTIC;
        const ez = cloud.disorder[i3 + 2] + dz;

        positions[i3] = ex + (cloud.order[i3] - ex) * eased;
        positions[i3 + 1] = ey + (cloud.order[i3 + 1] - ey) * eased;
        positions[i3 + 2] = ez + (cloud.order[i3 + 2] - ez) * eased;

        const breathe = reducedMotion
          ? 1
          : 1 + Math.sin(elapsed * 0.9 + ph) * BREATHING_AMPLITUDE;
        sizes[i] =
          BASE_DOT_SIZE *
          DOT_SIZE_MULTIPLIER *
          TIER_SCALE[cloud.tiers[i]] *
          pointScale *
          breathe *
          (reducedMotion ? 1 : l.scale);
      }
      pointGeo.attributes.position.needsUpdate = true;
      pointGeo.attributes.aSize.needsUpdate = true;

      // Network edges follow the live node positions, so the graph
      // genuinely deforms as the cloud organises rather than cross-fading
      // between two fixed pictures.
      for (let e = 0; e < edgeCount; e++) {
        const a = cloud.edges[e * 2];
        const b = cloud.edges[e * 2 + 1];
        for (let k = 0; k < 3; k++) {
          edgePos[e * 2 * 3 + k] = positions[a * 3 + k];
          edgePos[(e * 2 + 1) * 3 + k] = positions[b * 3 + k];
        }
      }
      edgeGeo.attributes.position.needsUpdate = true;

      for (let i = 0; i < count; i++) {
        spokePos[i * 2 * 3] = 0;
        spokePos[i * 2 * 3 + 1] = 0;
        spokePos[i * 2 * 3 + 2] = 0;
        spokePos[(i * 2 + 1) * 3] = positions[i * 3];
        spokePos[(i * 2 + 1) * 3 + 1] = positions[i * 3 + 1];
        spokePos[(i * 2 + 1) * 3 + 2] = positions[i * 3 + 2];
      }
      spokeGeo.attributes.position.needsUpdate = true;

      // Topology crossfade: the network goes as the sphere arrives.
      // Ceilings tuned against the reference captures: the lines are thin
      // ink hairlines that support the dots, never the dominant element.
      // 0.5 made the graph read as the subject and the nodes as decoration.
      edgeMat.uniforms.uOpacity.value =
        0.3 * (1 - smoothstep(0, 0.65, globalOrder));
      spokeMat.uniforms.uOpacity.value =
        0.32 * smoothstep(0.35, 0.95, globalOrder);

      // Rotation: auto spin plus a slow sway, with drag inertia on top.
      if (!reducedMotion) {
        if (!dragging) {
          const decay = Math.pow(0.93, dt * 60);
          velX *= decay;
          velY *= decay;
          rotX += velX;
          rotY += velY;
          rotY += 0.09 * dt;
        }
        root.rotation.y = rotY;
        root.rotation.x = rotX + 0.06 * Math.sin(0.035 * elapsed);
      }

      updateBubble();

      renderer.render(scene, camera);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 0.016);
      lastFrame = now;
      writeFrame(dt);
    }

    function start() {
      if (running || reducedMotion) return;
      running = true;
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function sync() {
      if (visible && !document.hidden) start();
      else stop();
    }

    if (reducedMotion) {
      // One stable ordered sphere, drawn once. No loop is ever created.
      writeFrame(0);
    } else {
      const io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          sync();
        },
        { threshold: 0 },
      );
      io.observe(anchor);
      document.addEventListener("visibilitychange", sync);

      return () => {
        stop();
        io.disconnect();
        document.removeEventListener("visibilitychange", sync);
        ro.disconnect();
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", endDrag);
        canvas.removeEventListener("pointercancel", endDrag);
        window.removeEventListener("blur", onBlur);
        pointGeo.dispose();
        pointMat.dispose();
        edgeGeo.dispose();
        edgeMat.dispose();
        spokeGeo.dispose();
        spokeMat.dispose();
        renderer.dispose();
      };
    }

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", onBlur);
      pointGeo.dispose();
      pointMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      spokeGeo.dispose();
      spokeMat.dispose();
      renderer.dispose();
    };
  }, [reducedMotion, resolvedTheme]);

  return (
    <div ref={anchorRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        // `touch-action: pan-y` is the part that keeps the page usable on
        // a phone: horizontal drag rotates the cloud, vertical drag still
        // scrolls the page, and the browser decides which without us
        // calling preventDefault on every touchmove.
        // `cursor-pointer` is the hand the scene was missing: the canvas is
        // the real hit area and it really does respond to dragging, so the
        // cursor now says so. `active:cursor-grabbing` marks the drag
        // itself. Nothing above it intercepts — the copy column sits beside
        // it, and the bubble overlay below is pointer-events-none.
        className="absolute cursor-pointer touch-pan-y active:cursor-grabbing"
        aria-hidden="true"
      />
      {/* Complete static fallback for WebGL failure, not a blank box.
          Hidden until the effect determines it is needed. */}
      <p
        ref={fallbackRef}
        hidden
        // `[&[hidden]]:hidden` is load-bearing, not belt-and-braces. Any
        // Tailwind display utility (`flex` here) overrides the user-agent
        // `[hidden] { display: none }` rule, so the bare `hidden`
        // attribute silently did nothing and this text rendered on top of
        // the live scene. Caught in a screenshot, not reasoned about.
        // The attribute selector outranks the plain class, so this wins.
        className="absolute inset-0 m-auto flex max-w-[22rem] items-center justify-center text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.12em] text-muted [&[hidden]]:hidden"
      >
        A network of the people, processes and tools in a business — resolving
        into a single connected picture.
      </p>
      {/*
       * Process bubble. Purely decorative and `aria-hidden`: a rotating
       * synthetic message must never be announced, and it must never steal
       * focus or block the scene, hence `pointer-events-none`. Its single
       * static explanation lives in the sr-only paragraph below.
       *
       * Positioned by `transform` written directly from the frame loop —
       * no React state per frame.
       */}
      <div
        ref={bubbleRef}
        data-state="out"
        data-hero-notification=""
        hidden
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-20 flex max-w-[16rem] items-start gap-3 rounded-xl border border-line/70 bg-surface/95 px-3.5 py-3 text-ink shadow-[0_12px_32px_-14px_rgba(0,0,0,0.28),0_2px_6px_rgba(0,0,0,0.04)] backdrop-blur-md transition-[opacity,translate] duration-200 ease-modus data-[state=in]:translate-y-0 data-[state=in]:opacity-100 data-[state=out]:translate-y-1 data-[state=out]:opacity-0 [&[hidden]]:hidden"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-modus/20 bg-modus/5 text-modus">
          <LogoMark className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            MODUS
            <span className="h-1 w-1 rounded-full bg-modus" />
          </span>
          <span
            ref={bubbleTextRef}
            className="block text-[13px] font-medium leading-relaxed"
          />
        </span>
      </div>

      {/* The canvas is decorative; this is the accessible equivalent. It is
          a static description, not a live region — the signal labels must
          never be announced repeatedly. */}
      <span className="sr-only">
        A rotating three-dimensional network of points that organises into a
        sphere, representing the connections MODUS maps across a business.
        {bubblesNote ? ` ${bubblesNote}` : null}
      </span>
    </div>
  );
}
