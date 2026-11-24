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

/**
 * `tear` is a ref (0..1) read every frame, so the rip animates without re-rendering React:
 *  0.00-0.45  the crimped top peels up from its left corner
 *  0.45-1.00  it comes away, spinning off up and to the right
 * A soft light rises out of the opening and a few foil flakes fall from the tear line.
 */
export function Pack3D({ spot, art, tear, ...props }: { spot: number; art: number; tear?: React.MutableRefObject<number> } & JSX.IntrinsicElements["group"]) {
  const tex = useMemo(() => packTexture(spot, art), [spot, art]);
  const bodyH = PH * (1 - TOP);
  const topH = PH * TOP;
  const body = useMemo(() => foilMaterial(tex, 0, 1 - TOP), [tex]);
  const top = useMemo(() => new THREE.MeshStandardMaterial({ map: crimpTexture(art), metalness: 0.45, roughness: 0.42, envMapIntensity: 0.6 }), [art]);
  const pivot = useRef<THREE.Group>(null);
  const topMat = useRef<THREE.MeshStandardMaterial>(top);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const flakes = useRef<THREE.Group>(null);
  const bodyGeo = useMemo(() => pouchGeometry(PW, bodyH, 0.018, 0.022, false, true), [bodyH]);
  const topGeo = useMemo(() => pouchGeometry(PW, topH, 0.018, 0.004, true, false), [topH]);
  const flakeSeeds = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ x: (i / 9 - 0.5) * PW * 0.9, vx: (Math.sin(i * 12.9 + spot) * 0.5) * 0.35, vy: 0.55 + ((i * 7) % 5) * 0.09, spin: 3 + (i % 4) * 2, c: FLAKE_COLORS[i % 4] })), [spot]);
  const seamY = bodyH - topH / 2 - topH / 2; // top edge of the body, in group space (body is centred at -topH/2)
  useFrame(() => {
    const k = tear?.current ?? 0;
    const p = pivot.current;
    if (p) {
      const peel = THREE.MathUtils.smoothstep(k, 0, 0.45);
      const fly = THREE.MathUtils.smoothstep(k, 0.45, 1);
      p.position.set(-PW / 2 + fly * 0.35, seamY / 2 + fly * 0.55, 0.012 + fly * 0.25);
      p.rotation.set(-fly * 0.6, fly * 0.8, peel * 0.42 + fly * 1.6);
      p.visible = k < 0.995;
      topMat.current.opacity = 1 - THREE.MathUtils.smoothstep(k, 0.75, 1);
      topMat.current.transparent = k > 0.75;
    }
    if (glow.current) glow.current.opacity = 0.22 * THREE.MathUtils.smoothstep(k, 0.2, 0.7);
    const f = flakes.current;
    if (f) {
      const t = Math.max(0, (k - 0.3) / 0.7) * 1.1; // seconds-ish of flight while the tear completes
      f.visible = k > 0.3 && k < 0.999;
      f.children.forEach((m, i) => {
        const d = flakeSeeds[i];
        m.position.set(d.x + d.vx * t, seamY / 2 + 0.02 + d.vy * t - 1.6 * t * t, 0.04 + 0.12 * t);
        m.rotation.set(t * d.spin, t * d.spin * 0.7, t * d.spin * 0.5);
        ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(t, 0.6, 1.1));
      });
    }
  });
  return (
    <group {...props}>
      <mesh material={body} geometry={bodyGeo} position={[0, -topH / 2, 0]} />
      {/* the top strip hangs off a pivot at its left corner so it peels instead of sliding */}
      <group ref={pivot} position={[-PW / 2, seamY / 2, 0.012]}>
        <mesh material={top} geometry={topGeo} position={[PW / 2, topH / 2, -0.012]} />
      </group>
      {/* light from inside the opened pack */}
      <mesh position={[0, seamY / 2 + 0.02, 0.03]}>
        <planeGeometry args={[PW * 1.1, 0.34]} />
        <meshBasicMaterial ref={glow} map={GLOW} color="#ffe9c9" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={flakes} visible={false}>
        {flakeSeeds.map((d, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.035, 0.022]} />
            <meshBasicMaterial color={d.c} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
