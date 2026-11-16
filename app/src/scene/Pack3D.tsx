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
    metalness: 0.75,
    roughness: 0.28,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [120, 520],
    clearcoat: 1,
    clearcoatRoughness: 0.2,
  });
}

export function Pack3D({ spot, art, tear = 0, highlight = false, ...props }: { spot: number; art: number; tear?: number; highlight?: boolean } & JSX.IntrinsicElements["group"]) {
  const tex = useMemo(() => packTexture(spot, art), [spot, art]);
  const bodyH = PH * (1 - TOP);
  const topH = PH * TOP;
  const body = useMemo(() => foilMaterial(tex, 0, 1 - TOP), [tex]);
  const top = useMemo(() => foilMaterial(tex, 1 - TOP, TOP), [tex]);
  const topRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = topRef.current;
    if (t) {
      const e = THREE.MathUtils.smoothstep(tear, 0, 1);
      t.position.set(PW * 0.15 * e, bodyH / 2 + topH / 2 + e * 0.5, 0.01 + e * 0.15);
      t.rotation.set(-e * 0.7, 0, -e * 1.1);
      t.visible = tear < 0.98;
    }
    if (glowRef.current) glowRef.current.opacity = highlight ? 0.35 + Math.sin(clock.elapsedTime * 4) * 0.15 : 0;
  });
  return (
    <group {...props}>
      <mesh material={body} position={[0, -topH / 2, 0]} castShadow>
        <boxGeometry args={[PW, bodyH, 0.035]} />
      </mesh>
      <mesh ref={topRef} material={top}>
        <boxGeometry args={[PW, topH, 0.035]} />
      </mesh>
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[PW * 1.35, PH * 1.25]} />
        <meshBasicMaterial ref={glowRef} color="#b58cff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
