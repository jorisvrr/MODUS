"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  buildDiagnosticCloud,
  emphasisFor,
  stageFor,
  targetsFor,
  type DiagnosticStage,
} from "@/lib/three/diagnosticScene";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useResolvedTheme } from "@/lib/theme/useResolvedTheme";

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aEmphasis;
  varying float vEmphasis;
  void main() {
    vEmphasis = aEmphasis;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  varying float vEmphasis;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = dot(c, c);
    if (d > 0.25) discard;              // circular, not square
    float edge = smoothstep(0.25, 0.17, d);
    // Emphasis drives BOTH colour and opacity: the topic being answered
    // reads in MODUS green, recorded topics fall back to ink, and topics
    // not yet reached fade back without disappearing.
    vec3 color = mix(uInk, uAccent, smoothstep(0.6, 1.0, vEmphasis));
    gl_FragColor = vec4(color, edge * mix(0.14, 1.0, vEmphasis));
  }
`;

/**
 * The diagnostic's composition: a loose cloud that is drawn into one disc
 * as topics are answered, regrouped into the review screen's three groups
 * at review, and — only after the server confirms persistence — settled
 * onto the MODUS mark.
 *
 * One scene, one cloud, persistent point identities. Positions ease toward
 * the current stage's targets every frame, so back navigation, editing and
 * a restored draft all resolve to the right composition without queued or
 * stale transitions: a new stage changes the target and the points
 * continue from wherever they are.
 *
 * Purely visual. The explanation and the answer summary beside it are real
 * HTML (`DiagnosticExplainer`) — the canvas is `aria-hidden` and carries
 * no information that exists nowhere else, which is also what makes the
 * reduced-motion and no-WebGL paths complete rather than degraded.
 *
 * No projected labels any more. Six HTML labels pinned to six separated
 * planes lined up into what read as a floating menu over the scene, and
 * they duplicated the step heading and progress bar underneath. The
 * explanation now sits in one block beside the canvas, where it is
 * selectable, translatable and readable by a screen reader.
 */
export function DiagnosticScene({
  screen,
  step,
  recorded,
  className = "",
}: {
  screen: string;
  step: number;
  /**
   * One flag per topic: true once that topic holds a real answer. This is
   * what the composition grows by, so it must come from the answers
   * themselves and not from the step counter.
   */
  recorded: readonly boolean[];
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const theme = useResolvedTheme();
  // Read inside the frame loop so a stage change never rebuilds the scene
  // or the WebGL context.
  const stageRef = useRef<DiagnosticStage>(stageFor(screen, step, recorded));
  // Set by the scene effect while reduced motion is in force. See below.
  const renderStaticRef = useRef<(() => void) | null>(null);

  /*
   * `recorded` is a fresh array on every parent render, so it must not be
   * an effect dependency — that alone would re-run this effect constantly.
   * Its CONTENT is what matters, and that is a short, stable string.
   */
  const recordedKey = recorded.map((r) => (r ? "1" : "0")).join("");

  useEffect(() => {
    stageRef.current = stageFor(screen, step, recordedKey.split("").map((c) => c === "1"));
    /*
     * Under reduced motion there is no frame loop running, so nothing
     * would ever pick this new stage up — the scene would stay frozen in
     * whatever composition it was mounted with. Re-rendering once per
     * stage change keeps every stage correct without animating between
     * them, which is the actual request behind `prefers-reduced-motion`:
     * no motion, not no information.
     */
    if (reducedMotion) renderStaticRef.current?.();
  }, [screen, step, recordedKey, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!host || !canvas || !fallback) return;

    const showFallback = () => {
      canvas.hidden = true;
      fallback.hidden = false;
    };

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      showFallback();
      return;
    }
    renderer.setClearAlpha(0);

    const cloud = buildDiagnosticCloud();
    const { count } = cloud;

    const positions = new Float32Array(cloud.entry); // start unresolved
    // The growing stage's targets depend on which topics are answered, so
    // they are computed per frame — into this one buffer, owned for the
    // lifetime of the scene rather than allocated inside the loop.
    const scratch = new Float32Array(count * 3);
    // Larger than the hero cloud: this sits behind a form at lower
    // opacity, and smaller points read as dust rather than a surface.
    const sizes = new Float32Array(count).fill(0.055);
    const emphasis = new Float32Array(count).fill(1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aEmphasis", new THREE.BufferAttribute(emphasis, 1));

    const dark = theme === "dark";
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uInk: { value: new THREE.Color(dark ? 0xf4f4e7 : 0x1a1614) },
        // MODUS green in light; lifted in dark so it stays distinguishable
        // from the cream ink points.
        uAccent: { value: new THREE.Color(dark ? 0x7aa37f : 0x1e3b2e) },
      },
    });

    const points = new THREE.Points(geo, mat);
    const root = new THREE.Group();
    root.add(points);
    const scene = new THREE.Scene();
    scene.add(root);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    /*
     * Far enough back that the waiting shell is mostly IN frame. At 3.9 it
     * fell outside the top and bottom of the canvas, so the not-yet-
     * answered points read as scattered dust along the lower edge rather
     * than as a shell of information around the picture being built.
     */
    camera.position.set(0, 0, 4.3);

    function resize() {
      const r = host!.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(r.width, r.height, false);
      // Under reduced motion there is no frame loop to redraw into the new
      // size, so a resize would otherwise leave the last render stretched
      // or, if the host started at zero height, blank.
      renderStaticRef.current?.();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let last = 0;
    let visible = true;
    let running = false;

    function draw(dt: number) {
      const stage = stageRef.current;
      const target = targetsFor(cloud, stage, scratch);
      // Exponential approach: a new stage supersedes the previous one
      // immediately and continues from the CURRENT displayed positions, so
      // rapid back-and-forth never queues or lags.
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);

      for (let i = 0; i < count * 3; i++) {
        positions[i] += (target[i] - positions[i]) * k;
      }
      for (let i = 0; i < count; i++) {
        const want = emphasisFor(cloud, stage, i);
        emphasis[i] += (want - emphasis[i]) * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aEmphasis.needsUpdate = true;

      // A slow drift only while the picture is still incomplete; the
      // composed states are deliberately still.
      if (!reducedMotion) {
        const settle = stage.kind === "entry" ? 1 : 0.12;
        root.rotation.y += dt * 0.12 * settle;
      }
      renderer.render(scene, camera);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      draw(dt);
    }

    const start = () => {
      if (running || reducedMotion) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => (visible && !document.hidden ? start() : stop());

    if (reducedMotion) {
      // Static composition for the current stage: no morph, no drift.
      // Points are placed directly on the stage's targets instead of being
      // eased toward them, so every stage shows the same information a
      // moving scene would.
      const renderStatic = () => {
        const stage = stageRef.current;
        positions.set(targetsFor(cloud, stage, scratch));
        for (let i = 0; i < count; i++) emphasis[i] = emphasisFor(cloud, stage, i);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aEmphasis.needsUpdate = true;
        renderer.render(scene, camera);
      };
      renderStatic();
      // Published so a stage change can re-render it — there is no frame
      // loop here to notice one.
      renderStaticRef.current = renderStatic;
      return () => {
        renderStaticRef.current = null;
        ro.disconnect();
        geo.dispose();
        mat.dispose();
        renderer.dispose();
      };
    }

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(host);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
    /*
     * Deliberately NOT dependent on screen, step or `recorded`: those are
     * read through `stageRef` inside the loop. A dependency on any of them
     * would tear down the WebGL context and rebuild the cloud on every
     * answer, which resets every point to the opening cloud and makes the
     * stages read as unrelated illustrations instead of one object being
     * organised.
     */
  }, [reducedMotion, theme]);

  return (
    <div ref={hostRef} className={`relative ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {/* Non-WebGL fallback: a static mark, so the column is not simply
          empty. Nothing is lost — the explanation beside it is HTML. */}
      <div
        ref={fallbackRef}
        hidden
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center [&[hidden]]:hidden"
      >
        <span className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-1.5 w-16 rounded-full bg-line-strong/40"
              style={{ opacity: 1 - i * 0.25 }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
