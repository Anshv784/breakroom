// The break table. Everything on it is driven by the on-chain Break state:
//  * one sealed foil pack per spot, in an arc, with its owner's name
//  * the Deck in the middle: the TEE-sealed shuffle (locked -> shuffling -> live -> verified)
//  * each card the crank reveals flies out of its pack, flips in the showcase, then settles face up
//    in front of the spot that won it. Big pulls get a light burst.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { BreakState, CardInfo } from "../chain/layout";
import { ST } from "../chain/layout";
import { Card3D, CH } from "./Card3D";
import { Pack3D } from "./Pack3D";
import { faceOf, TIER_COLORS, type CardFace } from "../lib/art";
import { sfx } from "../lib/sfx";
import { LightCone, SpotStand, Studio, TableTop, Vault } from "./Set";

export interface StageProps {
  b: BreakState;
  cards: (CardInfo | null)[];
  names: (k: any) => string;
  selected: number | null;
  onSelect: (spot: number) => void;
  me?: string;
  onPull?: (p: { pos: number; card: number; spot: number }) => void;
}

const SHOW = new THREE.Vector3(0, 1.22, 1.55);
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function spotHome(s: number, n: number) {
  const span = Math.min(2.4, 0.9 + n * 0.12);
  const a = n === 1 ? 0 : -span / 2 + (span * s) / (n - 1);
  const r = 2.35;
  return { pos: new THREE.Vector3(Math.sin(a) * r * (n > 5 ? 0.92 : 1.1), 0.42, -Math.cos(a) * r + 0.7), yaw: -a * 0.8 };
}

/** Where card k of a spot stands once it's out: a fan in the spot's place, facing the room. */
function fanPlace(s: number, n: number, k: number, per: number) {
  const { pos, yaw } = spotHome(s, n);
  const off = per > 1 ? k - (per - 1) / 2 : 0;
  const width = Math.min(0.24, (n > 5 ? 0.5 : 0.8) / Math.max(1, per));
  const base = new THREE.Vector3(pos.x + Math.cos(yaw) * off * width, 0.38 + Math.abs(off) * -0.015, pos.z - Math.sin(yaw) * off * width + k * 0.004);
  const sc = n > 10 ? 0.55 : n > 5 ? 0.68 : 0.9;
  return { pos: base, rot: new THREE.Euler(-0.32, yaw, -off * 0.09), scale: new THREE.Vector3(sc, sc, sc) };
}

function RevealedCard({ face, place, seenAt, isLatest, big }: { face: CardFace; place: { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }; seenAt: number; isLatest: boolean; big: boolean }) {
  const g = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [glow, setGlow] = useState(big && isLatest ? 1 : 0);
  useEffect(() => {
    if (!(big && isLatest)) return;
    const t = setTimeout(() => setGlow(0), 1400);
    return () => clearTimeout(t);
  }, [big, isLatest]);
  const target = useMemo(() => new THREE.Object3D(), []);
  const from = useMemo(() => new THREE.Vector3(0, 0.95, -0.3), []);
  useFrame(() => {
    const o = g.current;
    if (!o) return;
    const age = (performance.now() - seenAt) / 1000;
    const hold = big ? 2.2 : 1.35;
    if (age < hold && seenAt > 0) {
      // rise out of the pack, flip toward the camera
      const t = easeOut(age / 0.55);
      o.position.lerpVectors(from, SHOW, t);
      target.position.copy(o.position);
      target.lookAt(camera.position);
      const flip = Math.PI * (1 - easeOut((age - 0.1) / 0.5));
      target.rotateY(flip);
      o.quaternion.slerp(target.quaternion, 0.35);
      const s = (big ? 1.3 : 1.0) * (0.6 + 0.4 * t);
      o.scale.setScalar(s);
    } else {
      o.position.lerp(place.pos, seenAt > 0 ? 0.12 : 1);
      target.rotation.copy(place.rot);
      o.quaternion.slerp(target.quaternion, seenAt > 0 ? 0.12 : 1);
      o.scale.lerp(place.scale, seenAt > 0 ? 0.12 : 1);
    }
  });
  return (
    <group ref={g}>
      <Card3D face={face} glow={glow} />
      {big && isLatest && <Burst color={TIER_COLORS[face.tier]} />}
    </group>
  );
}

function Burst({ color }: { color: string }) {
  const ref = useRef<THREE.Group>(null);
  const t0 = useRef(performance.now());
  useFrame(() => {
    const age = (performance.now() - t0.current) / 1000;
    if (ref.current) {
      ref.current.scale.setScalar(0.5 + age * 2.2);
      ref.current.visible = age < 1.6;
    }
  });
  return (
    <group ref={ref}>
      <Sparkles count={60} scale={1.6} size={8} speed={1.6} color={color} />
      <mesh>
        <ringGeometry args={[0.5, 0.56, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CameraRig({ focus }: { focus: boolean }) {
  const { camera, pointer, size } = useThree();
  // portrait screens: step back so the whole arc of spots fits
  const k = Math.max(1, Math.min(2.8, 1.55 / (size.width / size.height)));
  const look = useMemo(() => new THREE.Vector3(0, 0.6, 0), []);
  useFrame(() => {
    const want = focus ? new THREE.Vector3(pointer.x * 0.25, 1.8 * k, 4.6 * k) : new THREE.Vector3(pointer.x * 0.35, 1.9 * k, 4.7 * k);
    camera.position.lerp(want, 0.04);
    look.lerp(focus ? new THREE.Vector3(0, 0.95, 0.2) : new THREE.Vector3(0, 0.62, -0.7), 0.05);
    camera.lookAt(look);
  });
  return null;
}

export default function Stage({ b, cards, names, selected, onSelect, me, onPull }: StageProps) {
  const per = b.perSpot;
  // first time this client saw each position revealed (0 = was already out when we arrived)
  const seen = useRef<Map<number, number>>(new Map());
  const firstLoad = useRef(true);
  const [latest, setLatest] = useState<number | null>(null);
  useEffect(() => {
    const now = performance.now();
    let newest: number | null = null;
    b.revealed.forEach((c, pos) => {
      if (c < 0 || seen.current.has(pos)) return;
      seen.current.set(pos, firstLoad.current ? 0 : now);
      if (!firstLoad.current) newest = pos;
    });
    firstLoad.current = false;
    if (newest !== null) {
      const card = b.revealed[newest];
      setLatest(newest);
      const tier = cards[card]?.tier ?? b.cardTier[card] ?? 0;
      sfx.reveal(tier);
      onPull?.({ pos: newest, card, spot: Math.floor(newest / per) });
    }
  }, [b.revealed.join(","), cards.length]);

  const opening = b.status === ST.LIVE && b.cursor < b.nCards ? b.openOrder[Math.floor(b.cursor / per)] : -1;
  const latestAge = latest !== null ? performance.now() - (seen.current.get(latest) ?? 0) : 1e9;
  const focus = b.status === ST.LIVE && latestAge < 2600;

  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 1.9, 4.55], fov: 42 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <color attach="background" args={["#07060a"]} />
      <fog attach="fog" args={["#07060a", 8, 16]} />
      <ambientLight intensity={0.5} />
      <spotLight position={[0, 6.5, 1.5]} angle={0.62} penumbra={0.85} intensity={140} color="#fff1dc" />
      <directionalLight position={[0, 3.5, 7]} intensity={1.4} color="#e9e2ff" />
      <pointLight position={[-4.5, 2.2, 1.5]} intensity={18} color="#7cf7e4" />
      <pointLight position={[4.5, 2.2, 1.5]} intensity={18} color="#b58cff" />
      <pointLight position={[0, 1.6, -3.2]} intensity={10} color="#ffd27a" />
      <CameraRig focus={focus} />
      <Suspense fallback={null}>
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={4} color="#b58cff" position={[-3, 3, 3]} scale={[6, 1.5, 1]} />
          <Lightformer form="rect" intensity={4} color="#7cf7e4" position={[3, 3, 3]} scale={[6, 1.5, 1]} />
          <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 2, 6]} scale={[8, 2, 1]} />
          <Lightformer form="ring" intensity={2} color="#ffd27a" position={[0, 4, -3]} scale={3} />
        </Environment>
        <Studio status={b.status} />
        <LightCone />
        <TableTop status={b.status} />
        <Vault status={b.status} quiet={focus} label={b.status >= ST.ENDED ? "VERIFIED" : b.status === ST.SHUFFLING ? "VRF SHUFFLING" : b.status === ST.LIVE ? (b.mode === 1 && b.teamsOut < b.nSpots ? "RANDOMIZER" : "SEALED IN TEE") : b.sale === 1 ? "SEALED BIDS" : "BOX LOCKED"} />
        {Array.from({ length: b.nSpots }, (_, s) => {
          const posStart = s * per;
          const outCount = Array.from({ length: per }, (_, k) => b.revealed[posStart + k] >= 0).filter(Boolean).length;
          const done = outCount === per;
          const isOpening = s === opening;
          const home = spotHome(s, b.nSpots);
          const owner = b.spotOwner[s];
          const mine = !!owner && owner.toBase58() === me;
          const art = (cards[b.revealed[posStart]]?.art ?? s * 3) % 8;
          return (
            <group key={s}>
              {!done && (
                <PackSlot
                  n={b.nSpots}
                  s={s}
                  art={art}
                  home={home}
                  opening={isOpening}
                  torn={isOpening && outCount > 0}
                  selected={selected === s}
                  shuffling={b.status === ST.SHUFFLING}
                  onClick={() => onSelect(s)}
                />
              )}
              <SpotStand
                pos={home.pos}
                yaw={home.yaw}
                index={s}
                name={owner ? names(owner) : ""}
                owned={!!owner}
                mine={mine}
                selected={selected === s}
                price={b.ask[s] > 0n ? `$${(Number(b.ask[s]) / 1e6).toFixed(0)}` : undefined}
                onClick={() => onSelect(s)}
              />
            </group>
          );
        })}
        {b.revealed.map((c, pos) => {
          if (c < 0) return null;
          const info = cards[c];
          const face: CardFace = info ? faceOf(info) : { name: "Card", set: "Genesis", tier: b.cardTier[c], grade: 90, art: c, value: b.cardValue[c] };
          const s = Math.floor(pos / per);
          return (
            <RevealedCard
              key={pos}
              face={face}
              place={fanPlace(s, b.nSpots, pos % per, per)}
              seenAt={seen.current.get(pos) ?? 0}
              isLatest={latest === pos}
              big={face.tier >= 3}
            />
          );
        })}
        <Sparkles count={50} scale={[9, 3, 6]} position={[0, 1.6, 0]} size={1.6} speed={0.2} color="#cdb9ff" opacity={0.35} />
        <EffectComposer>
          <Bloom intensity={0.7} luminanceThreshold={0.6} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.9} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}

function PackSlot({ n, s, art, home, opening, torn, selected, shuffling, onClick }: { n: number; s: number; art: number; home: { pos: THREE.Vector3; yaw: number }; opening: boolean; torn: boolean; selected: boolean; shuffling: boolean; onClick: () => void }) {
  const g = useRef<THREE.Group>(null);
  const tear = useRef(0);
  const [tearV, setTearV] = useState(0);
  const center = useMemo(() => new THREE.Vector3(0, 0.82, -0.45), []);
  useFrame(({ clock }, dt) => {
    const o = g.current;
    if (!o) return;
    const t = clock.elapsedTime;
    let want = home.pos.clone();
    if (opening) want = center.clone();
    if (shuffling) {
      const a = t * 2.4 + s * 1.3;
      want = new THREE.Vector3(Math.cos(a) * 1.25, 0.9 + Math.sin(t * 3 + s) * 0.15, Math.sin(a) * 0.9 - 0.3);
    }
    if (selected && !opening && !shuffling) want.y += 0.12;
    o.position.lerp(want, opening || shuffling ? 0.08 : 0.1);
    const yaw = opening ? 0 : shuffling ? t * 2 + s : home.yaw;
    o.rotation.y = THREE.MathUtils.lerp(o.rotation.y, yaw, 0.1);
    o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, opening ? 0 : -0.18, 0.1);
    o.scale.setScalar(THREE.MathUtils.lerp(o.scale.x, opening ? 0.85 : n > 10 ? 0.5 : n > 5 ? 0.62 : 0.8, 0.08));
    const want_t = torn ? 1 : 0;
    if (Math.abs(tear.current - want_t) > 0.001) {
      tear.current = THREE.MathUtils.lerp(tear.current, want_t, Math.min(1, dt * 4));
      setTearV(tear.current);
    }
  });
  useEffect(() => {
    if (torn) sfx.rip();
  }, [torn]);
  return (
    <group
      ref={g}
      position={home.pos}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <Pack3D spot={s} art={art} tear={tearV} highlight={selected} />
    </group>
  );
}

export { CH };
