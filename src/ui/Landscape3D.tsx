import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PortfolioOutcome } from "../engine/montecarlo";

/**
 * Ландшафт будущих. Слева направо — год, вверх — стоимость портфеля,
 * в глубину — 2000 будущих, отсортированных от худшего (ближе) к лучшему (дальше).
 * При смене решения поверхность плавно перестраивается: обрыв превращается в пологий холм.
 */
const ROWS = 110;
const WIDTH = 3.4;
const DEPTH = 2.4;
const SCALE_Y = 1.15;
const MAX_VALUE = 2.6;
/** Высота, на которой стоимость равна нулю. */
const BASE = -1;

const RAMP: [number, number, number, number][] = [
  [0, 0.58, 0.1, 0.08],
  [0.5, 0.88, 0.2, 0.15],
  [0.8, 0.97, 0.56, 0.04],
  [1.0, 0.98, 0.8, 0.25],
  [1.15, 0.45, 0.82, 0.42],
  [1.6, 0.07, 0.63, 0.31],
  [2.6, 0.02, 0.38, 0.22],
];

function ramp(value: number, out: Float32Array, offset: number) {
  let i = 1;
  while (i < RAMP.length - 1 && value > RAMP[i][0]) i++;
  const a = RAMP[i - 1];
  const b = RAMP[i];
  const t = Math.min(1, Math.max(0, (value - a[0]) / (b[0] - a[0])));
  out[offset] = a[1] + (b[1] - a[1]) * t;
  out[offset + 1] = a[2] + (b[2] - a[2]) * t;
  out[offset + 2] = a[3] + (b[3] - a[3]) * t;
}

/** Берём ROWS траекторий равномерно по квантилям итога — получается срез всех будущих. */
function sampleSurface(outcome: PortfolioOutcome): Float32Array {
  const order = Array.from({ length: outcome.paths }, (_, i) => i).sort(
    (a, b) => outcome.finals[a] - outcome.finals[b],
  );
  const heights = new Float32Array(ROWS * outcome.steps);
  for (let r = 0; r < ROWS; r++) {
    const path = order[Math.round((r / (ROWS - 1)) * (outcome.paths - 1))];
    for (let s = 0; s < outcome.steps; s++) {
      heights[r * outcome.steps + s] = Math.min(outcome.values[path * outcome.steps + s], MAX_VALUE);
    }
  }
  return heights;
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 160, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.1, 0.22, 1);
  return sprite;
}

interface Props {
  outcome: PortfolioOutcome;
  /** WebGL недоступен — родитель покажет обычный график. */
  onUnavailable: () => void;
}

export default function Landscape3D({ outcome, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const setTargetRef = useRef<((heights: Float32Array, sweep: boolean) => void) | null>(null);
  const shownRef = useRef<PortfolioOutcome | null>(null);
  const outcomeRef = useRef(outcome);
  const unavailableRef = useRef(onUnavailable);
  outcomeRef.current = outcome;
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      unavailableRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    const cols = outcomeRef.current.steps;
    const count = ROWS * cols;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    const target = new THREE.Vector3(0, 0.2, 0);

    // --- Поверхность
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        positions[i] = (c / (cols - 1) - 0.5) * WIDTH;
        positions[i + 1] = BASE + SCALE_Y;
        // Худшие будущие — ближе к зрителю, лучшие — в глубине.
        positions[i + 2] = (0.5 - r / (ROWS - 1)) * DEPTH;
      }
    }
    const faces: number[] = [];
    const ridges: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        if (r < ROWS - 1) faces.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        if (r % 9 === 0 || r === ROWS - 1) ridges.push(a, a + 1);
      }
    }
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    const surfaceGeometry = new THREE.BufferGeometry();
    surfaceGeometry.setAttribute("position", positionAttr);
    surfaceGeometry.setAttribute("color", colorAttr);
    surfaceGeometry.setIndex(faces);
    const surfaceMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    scene.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial));

    // --- Гребни: отдельные будущие поверх поверхности (та же геометрия вершин)
    const ridgeGeometry = new THREE.BufferGeometry();
    ridgeGeometry.setAttribute("position", positionAttr);
    ridgeGeometry.setIndex(ridges);
    const ridgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    scene.add(new THREE.LineSegments(ridgeGeometry, ridgeMaterial));

    // --- Плоскость «половина вложенного» и рамка «вложено»
    const halfGeometry = new THREE.PlaneGeometry(WIDTH + 0.3, DEPTH + 0.3);
    const halfMaterial = new THREE.MeshBasicMaterial({
      color: 0xd92d20,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halfPlane = new THREE.Mesh(halfGeometry, halfMaterial);
    halfPlane.rotation.x = -Math.PI / 2;
    halfPlane.position.y = BASE + 0.5 * SCALE_Y;
    scene.add(halfPlane);

    const frameGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(WIDTH + 0.3, DEPTH + 0.3));
    const frameMaterial = new THREE.LineBasicMaterial({ color: 0x667085 });
    const frame = new THREE.LineSegments(frameGeometry, frameMaterial);
    frame.rotation.x = -Math.PI / 2;
    frame.position.y = BASE + SCALE_Y;
    scene.add(frame);

    const grid = new THREE.GridHelper(4.4, 22, 0xcbd5e1, 0xe4e7ec);
    grid.position.y = BASE;
    scene.add(grid);

    // --- Подписи
    const labels: [string, string, number, number, number][] = [
      ["сегодня", "#475467", -WIDTH / 2, BASE - 0.16, DEPTH / 2 + 0.3],
      ["через год", "#475467", WIDTH / 2, BASE - 0.16, DEPTH / 2 + 0.3],
      ["500 тыс ₸", "#d92d20", WIDTH / 2 + 0.75, BASE + 0.5 * SCALE_Y, DEPTH / 2],
      ["1 млн ₸", "#475467", WIDTH / 2 + 0.7, BASE + SCALE_Y, DEPTH / 2],
      ["лучшие будущие", "#087a44", WIDTH / 2 + 0.2, BASE + 2.3 * SCALE_Y, -DEPTH / 2],
      ["худшие будущие", "#b42318", -WIDTH / 2 + 0.3, BASE - 0.16, DEPTH / 2 + 0.62],
    ];
    const sprites = labels.map(([text, color, x, y, z]) => {
      const sprite = makeLabel(text, color);
      sprite.position.set(x, y, z);
      scene.add(sprite);
      return sprite;
    });

    scene.add(new THREE.HemisphereLight(0xffffff, 0xaab4c4, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2.5, 4, 3);
    scene.add(sun);

    // --- Морфинг высот
    let from: Float32Array = new Float32Array(count).fill(1);
    let to: Float32Array = from;
    const current = new Float32Array(count).fill(1);
    let morphStart = 0;
    let morphDuration = 0;
    let sweep = false;
    let morphing = false;

    const applyHeights = (progress: number) => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          // Первое появление — волна вдоль оси времени; смена решения — всё сразу.
          const local = sweep ? Math.min(1, Math.max(0, progress * 2 - c / (cols - 1))) : progress;
          const eased = local * local * (3 - 2 * local);
          const value = from[i] + (to[i] - from[i]) * eased;
          current[i] = value;
          positions[i * 3 + 1] = BASE + value * SCALE_Y;
          ramp(value, colors, i * 3);
        }
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      surfaceGeometry.computeVertexNormals();
    };

    setTargetRef.current = (heights, withSweep) => {
      from = current.slice();
      to = heights;
      sweep = withSweep;
      morphStart = performance.now();
      morphDuration = withSweep ? 2600 : 1200;
      morphing = true;
    };
    shownRef.current = outcomeRef.current;
    setTargetRef.current(sampleSurface(outcomeRef.current), true);

    // --- Камера: медленное покачивание, перетаскивание поворачивает
    let thetaBase = -0.42;
    let phi = 1.1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let idleSince = 0;
    const canvas = renderer.domElement;
    canvas.style.touchAction = "pan-y";
    canvas.style.cursor = "grab";

    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      thetaBase -= (event.clientX - lastX) * 0.009;
      phi = Math.min(1.5, Math.max(0.45, phi - (event.clientY - lastY) * 0.006));
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onUp = () => {
      dragging = false;
      idleSince = performance.now();
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frameId = 0;
    const tick = (now: number) => {
      if (morphing) {
        const progress = Math.min(1, (now - morphStart) / morphDuration);
        applyHeights(progress);
        if (progress >= 1) morphing = false;
      }
      // После перетаскивания покачивание возвращается плавно.
      const sway = dragging ? 0 : Math.min(1, (now - idleSince) / 1500) * 0.38 * Math.sin(now * 0.00045);
      const theta = thetaBase + sway;
      const radius = 6.4;
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      setTargetRef.current = null;
      surfaceGeometry.dispose();
      ridgeGeometry.dispose();
      halfGeometry.dispose();
      frameGeometry.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      [surfaceMaterial, ridgeMaterial, halfMaterial, frameMaterial].forEach((material) => material.dispose());
      sprites.forEach((sprite) => {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      });
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    if (shownRef.current === outcome || !setTargetRef.current) return;
    shownRef.current = outcome;
    setTargetRef.current(sampleSurface(outcome), false);
  }, [outcome]);

  return (
    <div
      ref={hostRef}
      className="landscape"
      role="img"
      aria-label="Трёхмерный ландшафт: 2000 вариантов стоимости портфеля за год, от худших к лучшим"
    />
  );
}
