// Inspect one card in its graded slab: drag to turn it and watch the foil move.
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PresentationControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Slab3D } from "./Card3D";
import { faceOf } from "../lib/art";
import type { CardInfo } from "../chain/layout";

export default function SlabViewer({ card }: { card: CardInfo }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 2.6], fov: 40 }}>
      <color attach="background" args={["#07060a"]} />
      <ambientLight intensity={0.4} />
      <spotLight position={[2, 3, 3]} intensity={40} angle={0.5} penumbra={1} />
      <Suspense fallback={null}>
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={3} color="#b58cff" position={[-2, 1, 2]} scale={[3, 1, 1]} />
          <Lightformer form="rect" intensity={3} color="#7cf7e4" position={[2, -1, 2]} scale={[3, 1, 1]} />
        </Environment>
        <PresentationControls global snap rotation={[0, 0.3, 0]} polar={[-0.5, 0.5]} azimuth={[-1, 1]}>
          <Slab3D face={faceOf(card)} />
        </PresentationControls>
        <EffectComposer>
          <Bloom intensity={0.5} luminanceThreshold={0.7} mipmapBlur />
        </EffectComposer>
      </Suspense>
      <OrbitControls enabled={false} />
    </Canvas>
  );
}
