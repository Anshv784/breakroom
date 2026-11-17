// A sealed foil booster pack. `tear` (0..1) rips the crimped top off and lets the cards out.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { packTexture } from "./textures";

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

export function Pack3D({ spot, art, tear = 0, highlight = false, ...props }: { spot: number; art: number; tear?: number; highlight?: boolean } & JSX.IntrinsicElements["group"]) {
  const tex = useMemo(() => packTexture(spot, art), [spot, art]);
  const bodyH = PH * (1 - TOP);
  const topH = PH * TOP;
  const body = useMemo(() => foilMaterial(tex, 0, 1 - TOP), [tex]);
  const top = useMemo(() => foilMaterial(tex, 1 - TOP, TOP), [tex]);
  const topRef = useRef<THREE.Mesh>(null);
  const bodyGeo = useMemo(() => pouchGeometry(PW, bodyH, 0.018, 0.022, false, true), [bodyH]);
  const topGeo = useMemo(() => pouchGeometry(PW, topH, 0.018, 0.004, true, false), [topH]);
  useFrame(({ clock }) => {
    const t = topRef.current;
    if (t) {
      const e = THREE.MathUtils.smoothstep(tear, 0, 1);
      t.position.set(PW * 0.15 * e, bodyH / 2 + topH / 2 + e * 0.5, 0.01 + e * 0.15);
      t.rotation.set(-e * 0.7, 0, -e * 1.1);
      t.visible = tear < 0.98;
    }
  });
  return (
    <group {...props}>
      <mesh material={body} geometry={bodyGeo} position={[0, -topH / 2, 0]} />
      <mesh ref={topRef} material={top} geometry={topGeo} />
    </group>
  );
}
