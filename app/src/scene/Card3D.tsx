// A physical card: holo face, branded back, real thickness, and an optional graded slab around it.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { holoMaterial } from "./holo";
import { backTexture, faceTexture, slabLabelTexture } from "./textures";
import type { CardFace } from "../lib/art";
import { TIER_COLORS } from "../lib/art";

export const CW = 0.63; // card width (m) — poker-size proportions
export const CH = 0.88;

const R = 0.034; // corner radius: real cards have rounded corners
const T = 0.006; // card stock thickness

function roundedShape(w: number, h: number, r: number) {
  const x = -w / 2, y = -h / 2;
  const sh = new THREE.Shape();
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y);
  sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r);
  sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h);
  sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r);
  sh.quadraticCurveTo(x, y, x + r, y);
  return sh;
}
/** A rounded-rect face with 0..1 UVs across the whole card (ShapeGeometry's UVs are in shape units). */
function faceGeometry() {
  const g = new THREE.ShapeGeometry(roundedShape(CW, CH, R), 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + CW / 2) / CW, (p.getY(i) + CH / 2) / CH);
  return g;
}
const FACE_GEO = faceGeometry();
const EDGE_GEO = new THREE.ExtrudeGeometry(roundedShape(CW, CH, R), { depth: T, bevelEnabled: false, curveSegments: 8 });
EDGE_GEO.translate(0, 0, -T / 2);
const EDGE_MAT = new THREE.MeshStandardMaterial({ color: "#d9d2e0", roughness: 0.75, metalness: 0 });

export function Card3D({ face, glow = 0, dim = false, sweepFrom = 0, ...props }: { face: CardFace; glow?: number; dim?: boolean; sweepFrom?: number } & JSX.IntrinsicElements["group"]) {
  const tex = useMemo(() => faceTexture(face), [face.name, face.tier, face.grade, face.art, face.value]);
  const mat = useMemo(() => holoMaterial(tex, face.tier), [tex, face.tier]);
  const back = useMemo(() => new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.5, metalness: 0.1 }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    mat.uniforms.time.value += dt;
    mat.uniforms.reveal.value = THREE.MathUtils.lerp(mat.uniforms.reveal.value, dim ? 0.35 : 1, 0.1);
    mat.uniforms.glow.value = THREE.MathUtils.lerp(mat.uniforms.glow.value, glow, 0.15);
    const age = sweepFrom > 0 ? (performance.now() - sweepFrom) / 900 : 9;
    mat.uniforms.sweep.value = age < 1.6 ? -0.25 + age * 1.0 : -1;
  });
  return (
    <group {...props}>
      <mesh geometry={FACE_GEO} material={mat} position={[0, 0, T / 2 + 0.0004]} />
      <mesh geometry={FACE_GEO} material={back} position={[0, 0, -T / 2 - 0.0004]} rotation={[0, Math.PI, 0]} />
      <mesh geometry={EDGE_GEO} material={EDGE_MAT} />
    </group>
  );
}

/** A card inside an acrylic grading slab with its label. */
export function Slab3D({ face, ...props }: { face: CardFace } & JSX.IntrinsicElements["group"]) {
  const label = useMemo(() => slabLabelTexture(face), [face.name, face.grade, face.cert, face.tier]);
  const tint = TIER_COLORS[face.tier];
  return (
    <group {...props}>
      <Card3D face={face} position={[0, -0.07, 0]} />
      <mesh position={[0, CH / 2 + 0.06, 0.012]}>
        <planeGeometry args={[CW + 0.06, 0.15]} />
        <meshStandardMaterial map={label} roughness={0.4} />
      </mesh>
      <RoundedBox args={[CW + 0.12, CH + 0.36, 0.06]} radius={0.03} smoothness={4} position={[0, 0.0, 0]}>
        <meshPhysicalMaterial transmission={1} thickness={0.06} roughness={0.06} ior={1.45} clearcoat={1} attenuationColor={tint} attenuationDistance={4} transparent />
      </RoundedBox>
    </group>
  );
}

/** Soft, gentle idle motion for anything floating. */
export function useFloat(ref: React.RefObject<THREE.Object3D>, amp = 0.03, speed = 1, phase = 0) {
  const base = useRef<THREE.Vector3 | null>(null);
  useFrame(({ clock }) => {
    const o = ref.current;
    if (!o) return;
    if (!base.current) base.current = o.position.clone();
    const t = clock.elapsedTime * speed + phase;
    o.position.y = base.current.y + Math.sin(t) * amp;
    o.rotation.z = Math.sin(t * 0.7) * 0.03;
  });
}
