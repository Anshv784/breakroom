// A sealed foil booster pack. `tear` (0..1) rips the crimped top off and lets the cards out.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { crimpTexture, packTexture } from "./textures";

export const PW = 0.72;
export const PH = 1.06;
const TOP = 0.12; // the strip that tears off

function foilMaterial(map: THREE.Texture, offsetY: number, repeatY: number) {
  const m = map.clone();
  m.needsUpdate = true;
  m.offset.set(0, offsetY);
  m.repeat.set(1, repeatY);
  return new THREE.MeshPhysicalMaterial({
    map: m,
    metalness: 0.6,
    roughness: 0.3,
    iridescence: 0.6,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [160, 480],
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.5,
  });
}

/** A foil pouch: front and back bulge like a filled pack, flattening into the crimped ends. */
function pouchGeometry(w: number, h: number, depth: number, bulge: number, crimpTop: boolean, crimpBottom: boolean) {
  const g = new THREE.BoxGeometry(w, h, depth, 18, 28, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const hw = w / 2;
  const hh = h / 2;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (Math.abs(z) < depth / 2 - 1e-5) continue;
    const x = p.getX(i) / hw;
    const y = p.getY(i) / hh;
    const across = Math.pow(Math.max(0, 1 - x * x), 0.55);
    // ease to flat over the last 12% at each crimped end
    const endT = (v: number, crimp: boolean) => (crimp ? THREE.MathUtils.smoothstep(1 - Math.abs(v), 0, 0.12) : 1);
    const along = y > 0 ? endT(y, crimpTop) : endT(y, crimpBottom);
    p.setZ(i, z + Math.sign(z) * bulge * across * along);
  }
  g.computeVertexNormals();
  return g;
}

/** Soft elliptical falloff for the light spilling out of an opened pack. */
const GLOW = (() => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const x = c.getContext("2d")!;
  x.translate(128, 128);
  x.scale(1, 0.75);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(-128, -180, 256, 200);
  return new THREE.CanvasTexture(c);
})();

const FLAKE_COLORS = ["#7cf7e4", "#b58cff", "#ffd27a", "#f3eff6"];

/** The silver inside of the foil, with a ragged torn top edge (alpha). */
const TORN = (() => {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 32;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, "#d9dbe3");
  g.addColorStop(0.5, "#f4f5f8");
  g.addColorStop(1, "#c9ccd6");
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(0, 32);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i <= 512; i += 6) x.lineTo(i, 6 + r() * 18);
  x.lineTo(512, 32);
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

/**
 * `tear` is a ref (0..1) read every frame, so the rip animates without re-rendering React.
 *  0.00-0.62  a tear front runs across the seal from left to right; behind it the crimp strip
 *             curls up and away from the pack while a ragged silver edge opens along the seam
 *  0.62-1.00  the freed strip is pulled off up and to the right and drops out of view
 * Foil flakes break off where the front passes, and a soft light spills out of the opening.
 */
export function Pack3D({ spot, art, tear, ...props }: { spot: number; art: number; tear?: React.MutableRefObject<number> } & JSX.IntrinsicElements["group"]) {
  const tex = useMemo(() => packTexture(spot, art), [spot, art]);
  const bodyH = PH * (1 - TOP);
  const topH = PH * TOP;
  const body = useMemo(() => foilMaterial(tex, 0, 1 - TOP), [tex]);
  const top = useMemo(() => new THREE.MeshStandardMaterial({ map: crimpTexture(art), metalness: 0.45, roughness: 0.42, envMapIntensity: 0.6, side: THREE.DoubleSide }), [art]);
  const torn = useMemo(() => new THREE.MeshStandardMaterial({ map: TORN, transparent: true, alphaTest: 0.4, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }), []);
  const strip = useRef<THREE.Group>(null);
  const stripMesh = useRef<THREE.Mesh>(null);
  const edge = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const flakes = useRef<THREE.Group>(null);
  const bodyGeo = useMemo(() => pouchGeometry(PW, bodyH, 0.018, 0.022, false, true), [bodyH]);
  const topGeo = useMemo(() => pouchGeometry(PW, topH, 0.018, 0.004, true, false), [topH]);
  const basePos = useMemo(() => (topGeo.attributes.position.array as Float32Array).slice(), [topGeo]);
  const flakeSeeds = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ xn: (i + 0.5) / 12, vx: Math.sin(i * 12.9 + spot) * 0.12, vy: 0.25 + ((i * 7) % 5) * 0.06, spin: 3 + (i % 4) * 2, c: FLAKE_COLORS[i % 4] })), [spot]);
  const seam = bodyH / 2 - topH / 2; // top edge of the body (body is centred at -topH/2)
  const lastK = useRef(-1);
  useFrame(() => {
    const k = tear?.current ?? 0;
    const front = Math.min(1.3, (k / 0.62) * 1.3); // tear front in 0..1 of the width (overshoots to finish)
    const fly = THREE.MathUtils.smoothstep(k, 0.62, 1);
    // curl the strip behind the tear front (vertex deform, only while it changes)
    if (stripMesh.current && k !== lastK.current) {
      lastK.current = k;
      const pos = topGeo.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = basePos[i * 3], y = basePos[i * 3 + 1], z = basePos[i * 3 + 2];
        const xn = (x + PW / 2) / PW;
        const d = THREE.MathUtils.clamp((front - xn) / 0.3, 0, 1); // how freed this column is
        const ang = d * 1.15; // curls back about the strip's bottom edge
        const yy = y + topH / 2; // height above the hinge
        arr[i * 3] = x;
        arr[i * 3 + 1] = -topH / 2 + yy * Math.cos(ang) + d * 0.025;
        arr[i * 3 + 2] = z - yy * Math.sin(ang) + d * d * 0.03;
      }
      pos.needsUpdate = true;
      topGeo.computeVertexNormals();
    }
    const g = strip.current;
    if (g) {
      g.position.set(fly * 0.42, seam + topH / 2 + fly * 0.5 - fly * fly * 0.6, 0.0 + fly * 0.22);
      g.rotation.set(-fly * 0.5, fly * 0.6, -fly * 1.2);
      g.visible = k < 0.995;
    }
    if (edge.current) {
      const w = THREE.MathUtils.clamp(front, 0, 1);
      edge.current.visible = w > 0.001;
      edge.current.scale.set(Math.max(0.001, w), 1, 1);
      edge.current.position.set(-PW / 2 + (PW * w) / 2, seam + 0.008, 0.0);
    }
    if (glow.current) glow.current.opacity = 0.2 * THREE.MathUtils.smoothstep(k, 0.35, 0.8);
    const f = flakes.current;
    if (f) {
      f.visible = k > 0.02 && k < 0.999;
      f.children.forEach((m, i) => {
        const d = flakeSeeds[i];
        const born = (d.xn / 1.3) * 0.62; // when the front reached it
        const t = Math.max(0, k - born) * 1.6;
        const x = -PW / 2 + d.xn * PW;
        m.visible = k > born;
        m.position.set(x + d.vx * t, seam + 0.01 + d.vy * t - 1.4 * t * t, 0.03 + 0.08 * t);
        m.rotation.set(t * d.spin, t * d.spin * 0.7, t * d.spin * 0.5);
        ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - THREE.MathUtils.smoothstep(t, 0.5, 0.9));
      });
    }
  });
  return (
    <group {...props}>
      <mesh material={body} geometry={bodyGeo} position={[0, -topH / 2, 0]} />
      <group ref={strip} position={[0, seam + topH / 2, 0]}>
        <mesh ref={stripMesh} material={top} geometry={topGeo} />
      </group>
      {/* ragged silver inner foil, revealed along the seam as the tear runs */}
      <mesh ref={edge} material={torn} visible={false}>
        <planeGeometry args={[PW, 0.022]} />
      </mesh>
      {/* light from inside the opened pack */}
      <mesh position={[0, seam + 0.02, 0.03]}>
        <planeGeometry args={[PW * 1.1, 0.34]} />
        <meshBasicMaterial ref={glow} map={GLOW} color="#ffe9c9" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={flakes} visible={false}>
        {flakeSeeds.map((d, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.022, 0.014]} />
            <meshStandardMaterial color={d.c} metalness={0.8} roughness={0.3} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
