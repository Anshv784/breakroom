// A sealed foil booster pack, built to read like the real thing: a pillowed foil pouch with crinkles
// that catch the light, serrated crimp seals top and bottom, full-bleed print. `tear` (a ref, 0..1)
// rips it the way you rip a pack: a tear runs across just under the top seal, the strip curls back
// behind it and comes away, leaving a ragged silver edge with the cards' edges showing inside.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { foilNormalTexture, packTexture, serrationTexture } from "./textures";

export const PW = 0.72;
export const PH = 1.06;
const TOP = 0.115; // what tears off: the top seal plus a sliver of the print under it

function uvSlice(t: THREE.Texture, offsetY: number, repeatY: number) {
  const m = t.clone();
  m.needsUpdate = true;
  m.offset.set(0, offsetY);
  m.repeat.set(1, repeatY);
  return m;
}

function foilMaterial(offsetY: number, repeatY: number, map: THREE.Texture) {
  return new THREE.MeshPhysicalMaterial({
    map: uvSlice(map, offsetY, repeatY),
    normalMap: uvSlice(foilNormalTexture(), offsetY, repeatY),
    normalScale: new THREE.Vector2(0.55, 0.55),
    alphaMap: uvSlice(serrationTexture(), offsetY, repeatY),
    alphaTest: 0.5,
    metalness: 0.3,
    roughness: 0.26,
    clearcoat: 0.7,
    clearcoatRoughness: 0.1,
    iridescence: 0.2,
    iridescenceIOR: 1.4,
    iridescenceThicknessRange: [180, 420],
    envMapIntensity: 0.7,
    side: THREE.DoubleSide,
  });
}

/** A foil pouch: puffed in the middle, flat at the crimped ends, with a little crinkle everywhere. */
function pouchGeometry(w: number, h: number, depth: number, bulge: number, crimpTop: boolean, crimpBottom: boolean, seed: number) {
  const g = new THREE.BoxGeometry(w, h, depth, 28, 40, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const hw = w / 2;
  const hh = h / 2;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (Math.abs(z) < depth / 2 - 1e-5) continue;
    const xx = p.getX(i), yy = p.getY(i);
    const x = xx / hw;
    const y = yy / hh;
    const across = Math.pow(Math.max(0, 1 - x * x), 0.6);
    const endT = (v: number, crimp: boolean) => (crimp ? THREE.MathUtils.smoothstep(1 - Math.abs(v), 0, 0.16) : 1);
    const along = y > 0 ? endT(y, crimpTop) : endT(y, crimpBottom);
    // crinkles: a few soft creases, stronger toward the corners where real foil wrinkles
    const crease = (Math.sin(xx * 31 + yy * 7 + seed) * 0.5 + Math.sin(xx * 11 - yy * 23 + seed * 2) * 0.35 + Math.sin(yy * 41 + seed * 3) * 0.15) * 0.0022 * (0.4 + Math.abs(x));
    p.setZ(i, z + Math.sign(z) * (bulge * across * along + crease * along));
  }
  g.computeVertexNormals();
  return g;
}

/** The silver inside of the foil with a ragged torn top edge. */
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
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i <= 512; i += 5) x.lineTo(i, 4 + r() * 20);
  x.lineTo(512, 32);
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

/** Soft falloff for the light spilling out of the opened pack. */
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

const FLAKE_COLORS = ["#e9ebf1", "#b58cff", "#ffd27a", "#7cf7e4"];
const STACK_MAT = new THREE.MeshStandardMaterial({ color: "#ece7f2", roughness: 0.7 });

export function Pack3D({ spot, art, tear, ...props }: { spot: number; art: number; tear?: React.MutableRefObject<number> } & JSX.IntrinsicElements["group"]) {
  const tex = useMemo(() => packTexture(spot, art), [spot, art]);
  const bodyH = PH * (1 - TOP);
  const topH = PH * TOP;
  const body = useMemo(() => foilMaterial(0, 1 - TOP, tex), [tex]);
  const top = useMemo(() => foilMaterial(1 - TOP, TOP, tex), [tex]);
  const torn = useMemo(() => new THREE.MeshStandardMaterial({ map: TORN, transparent: true, alphaTest: 0.4, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }), []);
  const strip = useRef<THREE.Group>(null);
  const stripMesh = useRef<THREE.Mesh>(null);
  const edge = useRef<THREE.Mesh>(null);
  const stack = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const flakes = useRef<THREE.Group>(null);
  const bodyGeo = useMemo(() => pouchGeometry(PW, bodyH, 0.016, 0.03, false, true, spot), [bodyH, spot]);
  const topGeo = useMemo(() => pouchGeometry(PW, topH, 0.016, 0.006, true, false, spot + 5), [topH, spot]);
  const basePos = useMemo(() => (topGeo.attributes.position.array as Float32Array).slice(), [topGeo]);
  const flakeSeeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ xn: (i + 0.5) / 14, vx: Math.sin(i * 12.9 + spot) * 0.14, vy: 0.22 + ((i * 7) % 5) * 0.06, spin: 3 + (i % 4) * 2, c: FLAKE_COLORS[i % 4], s: 0.6 + ((i * 5) % 4) * 0.25 })), [spot]);
  const seam = bodyH / 2 - topH / 2; // top edge of the body (body is centred at -topH/2)
  const lastK = useRef(-1);
  useFrame(() => {
    const k = tear?.current ?? 0;
    const front = Math.min(1.35, (k / 0.62) * 1.35); // tear front across the width (overshoots to finish)
    const fly = THREE.MathUtils.smoothstep(k, 0.62, 1);
    // the freed part of the strip curls back off the pack behind the tear front
    if (stripMesh.current && k !== lastK.current) {
      lastK.current = k;
      const pos = topGeo.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = basePos[i * 3], y = basePos[i * 3 + 1], z = basePos[i * 3 + 2];
        const xn = (x + PW / 2) / PW;
        const d = THREE.MathUtils.clamp((front - xn) / 0.32, 0, 1);
        const ang = d * 1.2;
        const yy = y + topH / 2;
        arr[i * 3] = x - d * d * 0.015;
        arr[i * 3 + 1] = -topH / 2 + yy * Math.cos(ang) + d * 0.03;
        arr[i * 3 + 2] = z - yy * Math.sin(ang) - d * d * 0.02;
      }
      pos.needsUpdate = true;
      topGeo.computeVertexNormals();
    }
    const g = strip.current;
    if (g) {
      g.position.set(fly * 0.5, seam + topH / 2 + fly * 0.45 - fly * fly * 0.7, fly * 0.25);
      g.rotation.set(-fly * 0.6, fly * 0.7, -fly * 1.4);
      g.visible = k < 0.995;
    }
    if (edge.current) {
      const w = THREE.MathUtils.clamp(front, 0, 1);
      edge.current.visible = w > 0.001;
      edge.current.scale.set(Math.max(0.001, w), 1, 1);
      edge.current.position.set(-PW / 2 + (PW * w) / 2, seam + 0.006, 0.012);
    }
    // the top edges of the cards inside, once the pack is open
    if (stack.current) {
      const o = THREE.MathUtils.smoothstep(k, 0.55, 0.9);
      stack.current.visible = o > 0.01;
      stack.current.position.y = seam - 0.03 + o * 0.035;
    }
    if (glow.current) glow.current.opacity = 0.18 * THREE.MathUtils.smoothstep(k, 0.4, 0.85);
    const f = flakes.current;
    if (f) {
      f.visible = k > 0.02 && k < 0.999;
      f.children.forEach((m, i) => {
        const d = flakeSeeds[i];
        const born = (d.xn / 1.35) * 0.62;
        const t = Math.max(0, k - born) * 1.6;
        m.visible = k > born;
        m.position.set(-PW / 2 + d.xn * PW + d.vx * t, seam + 0.01 + d.vy * t - 1.5 * t * t, 0.03 + 0.08 * t);
        m.rotation.set(t * d.spin, t * d.spin * 0.7, t * d.spin * 0.5);
        m.scale.setScalar(d.s);
        ((m as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(t, 0.5, 0.9));
      });
    }
  });
  return (
    <group {...props}>
      <mesh material={body} geometry={bodyGeo} position={[0, -topH / 2, 0]} />
      <group ref={strip} position={[0, seam + topH / 2, 0]}>
        <mesh ref={stripMesh} material={top} geometry={topGeo} />
      </group>
      <mesh ref={edge} material={torn} visible={false}>
        <planeGeometry args={[PW, 0.02]} />
      </mesh>
      <group ref={stack} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} material={STACK_MAT} position={[(i - 1) * 0.006, i * 0.004, -0.004 + i * 0.002]}>
            <boxGeometry args={[PW * 0.84, 0.06, 0.002]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, seam + 0.02, 0.03]}>
        <planeGeometry args={[PW * 1.1, 0.34]} />
        <meshBasicMaterial ref={glow} map={GLOW} color="#ffe9c9" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={flakes} visible={false}>
        {flakeSeeds.map((d, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.022, 0.014]} />
            <meshStandardMaterial color={d.c} metalness={0.85} roughness={0.25} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
