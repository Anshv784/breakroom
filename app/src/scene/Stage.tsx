// The break table. Everything on it is driven by the on-chain Break state:
//  * one sealed foil pack per spot, in an arc, with its owner's name
//  * the Deck in the middle: the TEE-sealed shuffle (locked -> shuffling -> live -> verified)
//  * each card the crank reveals flies out of its pack, flips in the showcase, then settles face up
//    in front of the spot that won it. Big pulls get a light burst.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { BreakState, CardInfo } from "../chain/layout";
import { ST } from "../chain/layout";
import { Card3D, CH } from "./Card3D";
import { Pack3D } from "./Pack3D";
import { faceOf, TIER_COLORS, type CardFace } from "../lib/art";
import { sfx } from "../lib/sfx";

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
  return { pos: new THREE.Vector3(Math.sin(a) * r * (n > 5 ? 0.92 : 1.1), 0.5, -Math.cos(a) * r + 0.7), yaw: -a * 0.8 };
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

/** The sealed shuffle, drawn as a crystal that reflects the break's stage. */
function DeckCore({ status, seeded, quiet }: { status: number; seeded: boolean; quiet: boolean }) {
  const m = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const speed = status === ST.SHUFFLING ? 6 : status === ST.LIVE ? 0.9 : 0.35;
    if (m.current) {
      m.current.rotation.y += dt * speed;
      m.current.rotation.x += dt * speed * 0.4;
    }
    if (ring.current) ring.current.rotation.z -= dt * speed * 0.6;
  });
  const color = status >= ST.ENDED ? "#4fe3a1" : status === ST.SHUFFLING ? "#ffd27a" : "#b58cff";
  const label = status >= ST.ENDED ? "VERIFIED" : status === ST.SHUFFLING ? "VRF SHUFFLE" : status === ST.LIVE ? "SEALED IN TEE" : "BOX LOCKED";
  return (
    <group position={[0, 0.42, 0.55]} scale={0.6}>
      <mesh ref={m}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.9} transmission={0.6} roughness={0.15} thickness={0.5} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
        <torusGeometry args={[0.55, 0.012, 8, 96]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <pointLight color={color} intensity={1.6} distance={1.6} position={[0, 0.2, 0.6]} />
      <Html center position={[0, -0.78, 0]} distanceFactor={7} style={{ pointerEvents: "none" }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".18em", color, whiteSpace: "nowrap", textShadow: "0 0 12px rgba(0,0,0,.9)", opacity: quiet ? 0 : 1, transition: "opacity .4s" }}>
          {label}
          {seeded && status === ST.LIVE ? " · VRF" : ""}
        </div>
      </Html>
    </group>
  );
}

function Table() {
  const felt = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(512, 512, 40, 512, 512, 512);
    g.addColorStop(0, "#2a1d38");
    g.addColorStop(0.7, "#160f1f");
    g.addColorStop(1, "#0b0810");
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
      x.fillRect(Math.random() * 1024, Math.random() * 1024, 1, 1);
    }
    x.strokeStyle = "rgba(181,140,255,0.18)";
    x.lineWidth = 3;
    x.beginPath();
    x.arc(512, 512, 300, 0, Math.PI * 2);
    x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4.2, 96]} />
        <meshStandardMaterial map={felt} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[4.15, 4.35, 128]} />
        <meshStandardMaterial color="#2d2338" metalness={0.6} roughness={0.35} />
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
      <fog attach="fog" args={["#07060a", 6.5, 12]} />
      <ambientLight intensity={0.35} />
      <spotLight position={[0, 6, 2.5]} angle={0.75} penumbra={0.9} intensity={110} color="#fff1dc" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 2, 1]} intensity={12} color="#7cf7e4" />
      <pointLight position={[4, 2, 1]} intensity={12} color="#b58cff" />
      <CameraRig focus={focus} />
      <Suspense fallback={null}>
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2.5} color="#b58cff" position={[-3, 3, 2]} scale={[5, 1, 1]} />
          <Lightformer form="rect" intensity={2.5} color="#7cf7e4" position={[3, 3, 2]} scale={[5, 1, 1]} />
          <Lightformer form="ring" intensity={1.5} color="#ffd27a" position={[0, 4, -3]} scale={3} />
        </Environment>
        <Table />
        <DeckCore status={b.status} seeded={b.seedSource === 1} quiet={focus} />
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
              <Html position={[home.pos.x, b.nSpots > 5 ? 0.98 : 1.18, home.pos.z - 0.05]} center distanceFactor={b.nSpots > 5 ? 5 : 6} zIndexRange={[10, 0]}>
                <button
                  onClick={() => onSelect(s)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "4px 9px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    background: selected === s ? "rgba(181,140,255,.35)" : "rgba(10,8,14,.75)",
                    border: `1px solid ${mine ? "rgba(79,227,161,.7)" : "rgba(255,255,255,.14)"}`,
                    color: owner ? "#f3eff6" : "#7d7586",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  #{s + 1} {owner ? names(owner) : "open"}
                  {mine ? " · you" : ""}
                </button>
              </Html>
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
        <ContactShadows position={[0, 0.003, 0]} opacity={0.55} scale={9} blur={2.4} far={2} />
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
