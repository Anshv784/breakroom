// Landing hero: a graded chase card in its slab, sealed packs orbiting, the foil catching light.
import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { CAPTURE } from "../lib/capture";
import { Slab3D } from "./Card3D";
import { Pack3D } from "./Pack3D";
import type { CardFace } from "../lib/art";

const HERO: CardFace = { name: "Void Seraph", set: "Genesis", tier: 4, grade: 100, art: 3, value: 480_000_000n, cert: 4815162342n };

function Rig() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ pointer, clock }) => {
    const o = g.current;
    if (!o) return;
    o.rotation.y = THREE.MathUtils.lerp(o.rotation.y, pointer.x * 0.5 + Math.sin(clock.elapsedTime * 0.4) * 0.18, 0.05);
    o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, -pointer.y * 0.25, 0.05);
    o.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.05;
  });
  return (
    <group ref={g}>
      <Slab3D face={HERO} scale={1.45} />
    </group>
  );
}

function Orbit() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.12;
  });
  const n = 7;
  return (
    <group ref={g}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = 1.95;
        return <Pack3D key={i} spot={i} art={i} position={[Math.cos(a) * r, Math.sin(i * 1.7) * 0.5 - 0.1, Math.sin(a) * r]} rotation={[0.1, -a + Math.PI / 2, 0.15 * Math.sin(i)]} scale={0.62} />;
      })}
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.2, 4.4], fov: 38 }} gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: CAPTURE }}>
      <color attach="background" args={["#09080b"]} />
      <fog attach="fog" args={["#09080b", 4.5, 9]} />
      <ambientLight intensity={0.3} />
      <spotLight position={[2, 4, 3]} angle={0.5} penumbra={1} intensity={60} color="#ffe9c7" />
      <pointLight position={[-3, -1, 2]} intensity={14} color="#7cf7e4" />
      <pointLight position={[3, 1, -2]} intensity={14} color="#b58cff" />
      <Suspense fallback={null}>
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={3} color="#b58cff" position={[-3, 2, 2]} scale={[4, 1, 1]} />
          <Lightformer form="rect" intensity={3} color="#7cf7e4" position={[3, -1, 2]} scale={[4, 1, 1]} />
          <Lightformer form="ring" intensity={2} color="#ffd27a" position={[0, 3, -3]} scale={3} />
        </Environment>
        <group position={[0.35, 0, 0]}>
          <Rig />
          <Orbit />
        </group>
        <Sparkles count={70} scale={[7, 4, 4]} size={2.2} speed={0.25} color="#d9c8ff" opacity={0.5} />
        <EffectComposer>
          <Bloom intensity={0.75} luminanceThreshold={0.62} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.85} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
