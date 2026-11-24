// The break table. Everything on it is driven by the on-chain Break state:
//  * one sealed foil pack per spot, in an arc, with its owner's name
//  * the Deck in the middle: the TEE-sealed shuffle (locked -> shuffling -> live -> verified)
//  * each card the crank reveals flies out of its pack, flips in the showcase, then settles face up
//    in front of the spot that won it. Big pulls get a light burst.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Lightformer, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { CAPTURE } from "../lib/capture";
import type { BreakState, CardInfo } from "../chain/layout";
import { ST } from "../chain/layout";
import { Card3D, CH } from "./Card3D";
import { Pack3D } from "./Pack3D";
import { faceOf, TIER_COLORS, type CardFace } from "../lib/art";
import { sfx } from "../lib/sfx";
import { LightCone, SpotStand, Studio, TableTop, Vault } from "./Set";
import { cardsPerSpot, placements, spotOfPos, teamNames, ELEMENT_COLORS } from "../lib/breakmath";

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
/** Frame-rate independent smoothing factor: same feel at 60 Hz and 120 Hz. */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * Math.min(dt, 0.1));
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

function RevealedCard({ face, place, seenAt, isLatest, big, fromVault }: { face: CardFace; place: { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }; seenAt: number; isLatest: boolean; big: boolean; fromVault?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [glow, setGlow] = useState(big && isLatest ? 1 : 0);
  useEffect(() => {
    if (!(big && isLatest)) return;
    const t = setTimeout(() => setGlow(0), 1400);
    return () => clearTimeout(t);
  }, [big, isLatest]);
  const target = useMemo(() => new THREE.Object3D(), []);
  const from = useMemo(() => (fromVault ? new THREE.Vector3(0, 0.35, 1.05) : new THREE.Vector3(0, 1.02, -0.42)), [fromVault]);
  useFrame((_, dt) => {
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
      o.quaternion.slerp(target.quaternion, damp(14, dt));
      const s = (big ? 1.3 : 1.0) * (0.6 + 0.4 * t);
      o.scale.setScalar(s);
    } else {
      const f = seenAt > 0 ? damp(6, dt) : 1;
      o.position.lerp(place.pos, f);
      target.rotation.copy(place.rot);
      o.quaternion.slerp(target.quaternion, f);
      o.scale.lerp(place.scale, f);
    }
  });
  return (
    <group ref={g}>
      <Card3D face={face} glow={glow * 0.6} sweepFrom={seenAt > 0 ? seenAt + 250 : 0} />
      {big && isLatest && <Burst color={TIER_COLORS[face.tier]} />}
    </group>
  );
}

function Burst({ color }: { color: string }) {
  const ref = useRef<THREE.Group>(null);
  const disc = useRef<THREE.MeshBasicMaterial>(null);
  const t0 = useRef(performance.now());
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  useFrame(() => {
    const age = (performance.now() - t0.current) / 1000;
    if (ref.current) ref.current.visible = age < 2.4;
    if (disc.current) disc.current.opacity = 0.26 * Math.min(1, age / 0.35) * (1 - Math.min(1, Math.max(0, (age - 1.2) / 1.1)));
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0, -0.05]} scale={1.45}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={disc} map={tex} color={color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Sparkles count={26} scale={[1.4, 1.6, 0.6]} size={3.5} speed={0.35} color={color} opacity={0.8} />
    </group>
  );
}

function CameraRig({ focus }: { focus: boolean }) {
  const { camera, pointer, size } = useThree();
  // portrait screens: step back so the whole arc of spots fits
  const k = Math.max(1, Math.min(2.8, 1.55 / (size.width / size.height)));
  const look = useMemo(() => new THREE.Vector3(0, 0.6, 0), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  const lookWant = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (focus) want.set(pointer.x * 0.18, 1.7 * k, 4.4 * k);
    else want.set(pointer.x * 0.2, 1.5 * k + pointer.y * 0.05, 3.75 * k);
    camera.position.lerp(want, damp(focus ? 2.2 : 1.6, dt));
    lookWant.set(...((focus ? [0, 0.95, 0.2] : [0, 0.5, -0.75]) as [number, number, number]));
    look.lerp(lookWant, damp(2.4, dt));
    camera.lookAt(look);
  });
  return null;
}

export default function Stage({ b, cards, names, selected, onSelect, me, onPull, epoch = 0 }: StageProps & { epoch?: number }) {
  const per = b.perSpot;
  // first time this client saw each position revealed (0 = was already out when we arrived)
  const seen = useRef<Map<number, number>>(new Map());
  const firstLoad = useRef(true);
  const [latest, setLatest] = useState<number | null>(null);
  const lastEpoch = useRef(epoch);
  if (lastEpoch.current !== epoch) {
    // a replay started: forget what we've seen so every reveal animates again
    lastEpoch.current = epoch;
    seen.current = new Map();
    firstLoad.current = false;
  }
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
      onPull?.({ pos: newest, card, spot: spotOfPos(b, newest) });
    }
  }, [b.revealed.join(","), cards.length]);

  const teams = b.mode === 1;
  const opening = !teams && b.status === ST.LIVE && b.cursor < b.nCards ? b.openOrder[Math.floor(b.cursor / per)] : -1;
  const place = placements(b);
  const counts = cardsPerSpot(b);
  const latestAge = latest !== null ? performance.now() - (seen.current.get(latest) ?? 0) : 1e9;
  const focus = b.status === ST.LIVE && latestAge < 2600;

  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 4.6, 9.5], fov: 42 }} performance={{ min: 0.6 }} gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: CAPTURE }}>
      <color attach="background" args={["#07060a"]} />
      <fog attach="fog" args={["#07060a", 8, 16]} />
      <ambientLight intensity={0.5} />
      <spotLight position={[0, 6.5, 1.5]} angle={0.8} penumbra={1} intensity={38} color="#f4eefa" />
      <directionalLight position={[0, 3.5, 7]} intensity={1.4} color="#e9e2ff" />
      <pointLight position={[-4.5, 2.2, 1.5]} intensity={18} color="#7cf7e4" />
      <pointLight position={[4.5, 2.2, 1.5]} intensity={18} color="#b58cff" />
      <pointLight position={[0, 1.6, -3.2]} intensity={8} color="#cfc4ff" />
      <CameraRig focus={focus} />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={4} color="#b58cff" position={[-3, 3, 3]} scale={[6, 1.5, 1]} />
          <Lightformer form="rect" intensity={4} color="#7cf7e4" position={[3, 3, 3]} scale={[6, 1.5, 1]} />
          <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 2, 6]} scale={[8, 2, 1]} />
          <Lightformer form="ring" intensity={1.6} color="#cfc4ff" position={[0, 4, -3]} scale={3} />
        </Environment>
        <Studio status={b.status} />
        <LightCone />
        <TableTop status={b.status} />
        <Vault status={b.status} quiet={focus} label={b.status >= ST.ENDED ? "VERIFIED" : b.status === ST.SHUFFLING ? "VRF SHUFFLING" : b.status === ST.LIVE ? (b.mode === 1 && b.teamsOut < b.nSpots ? "RANDOMIZER" : "SEALED IN TEE") : b.sale === 1 ? "SEALED BIDS" : "BOX LOCKED"} />
        <group key={epoch}>
        {Array.from({ length: b.nSpots }, (_, s) => {
          const posStart = s * per;
          const outCount = teams ? [...place.values()].filter((p) => p.spot === s).length : Array.from({ length: per }, (_, k) => b.revealed[posStart + k] >= 0).filter(Boolean).length;
          const done = teams ? b.spotTeam[s] !== 0 && outCount >= counts[s] && b.status >= ST.LIVE : outCount === per;
          const isOpening = s === opening;
          const home = spotHome(s, b.nSpots);
          const owner = b.spotOwner[s];
          const mine = !!owner && owner.toBase58() === me;
          const art = (s * 3) % 8; // fixed per spot, so the print never swaps mid-rip
          return (
            <group key={s}>
              <PackSlot
                n={b.nSpots}
                s={s}
                art={art}
                home={home}
                opening={isOpening}
                gone={done}
                selected={selected === s}
                shuffling={b.status === ST.SHUFFLING}
                onClick={() => onSelect(s)}
              />
              <SpotStand
                pos={home.pos}
                yaw={home.yaw}
                index={s}
                name={owner ? names(owner) : ""}
                team={teams && b.spotTeam[s] ? teamNames(b.spotTeam[s]).join(" · ") : undefined}
                teamColor={teams && b.spotTeam[s] ? ELEMENT_COLORS[Math.log2(b.spotTeam[s] & -b.spotTeam[s])] : undefined}
                owned={!!owner}
                mine={mine}
                selected={selected === s}
                price={b.ask[s] > 0n ? `$${(Number(b.ask[s]) / 1e6).toFixed(0)}` : undefined}
                quiet={focus}
                onClick={() => onSelect(s)}
              />
            </group>
          );
        })}
        {b.revealed.map((c, pos) => {
          if (c < 0) return null;
          const info = cards[c];
          const face: CardFace = info ? faceOf(info) : { name: "Card", set: "Genesis", tier: b.cardTier[c], grade: 90, art: c, value: b.cardValue[c] };
          const pl = place.get(pos);
          if (!pl) return null;
          const s = pl.spot;
          return (
            <RevealedCard
              key={pos}
              face={face}
              place={fanPlace(s, b.nSpots, pl.k, Math.max(1, counts[s]))}
              fromVault={teams}
              seenAt={seen.current.get(pos) ?? 0}
              isLatest={latest === pos}
              big={face.tier >= 3}
            />
          );
        })}
        </group>
        <Sparkles count={50} scale={[9, 3, 6]} position={[0, 1.6, 0]} size={1.6} speed={0.2} color="#cdb9ff" opacity={0.35} />
        <EffectComposer>
          <Bloom intensity={0.3} luminanceThreshold={0.9} luminanceSmoothing={0.15} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.9} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}

/**
 * One spot's pack. Opening choreography (all frame-rate independent, no flashes):
 *  glide to the centre -> settle -> a short anticipation shake -> the top peels off (rip sound)
 *  -> cards rise out of it (RevealedCard) -> once its cards are out the empty pack drops and fades.
 */
function PackSlot({ n, s, art, home, opening, gone, selected, shuffling, onClick }: { n: number; s: number; art: number; home: { pos: THREE.Vector3; yaw: number }; opening: boolean; gone: boolean; selected: boolean; shuffling: boolean; onClick: () => void }) {
  const g = useRef<THREE.Group>(null);
  const tear = useRef(gone ? 1 : 0);
  const hovered = useRef(false);
  const openedAt = useRef<number | null>(null);
  const goneAt = useRef<number | null>(gone ? -1 : null); // -1: already gone when we arrived
  const ripped = useRef(false);
  const center = useMemo(() => new THREE.Vector3(0, 0.82, -0.45), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (opening && openedAt.current === null) openedAt.current = performance.now();
  }, [opening]);
  useEffect(() => {
    if (gone && goneAt.current === null) goneAt.current = performance.now() + 650; // let the last card clear the pack first
  }, [gone]);
  useFrame(({ clock }, dt) => {
    const o = g.current;
    if (!o) return;
    const t = clock.elapsedTime;
    const now = performance.now();
    // gone: drop, tip forward and fade out of the frame, then hide
    if (goneAt.current !== null && now >= goneAt.current) {
      if (goneAt.current < 0) {
        o.visible = false;
        return;
      }
      const k = Math.min(1, (now - goneAt.current) / 700);
      const e = k * k;
      o.position.y -= dt * (0.4 + 2.2 * e);
      o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, 0.9, damp(3, dt));
      o.scale.setScalar(Math.max(0.0001, o.scale.x * (1 - dt * 2.4)));
      o.visible = k < 1;
      return;
    }
    const since = openedAt.current !== null ? (now - openedAt.current) / 1000 : -1;
    want.copy(home.pos);
    if (opening) want.copy(center);
    if (shuffling) {
      const a = t * 2.4 + s * 1.3;
      want.set(Math.cos(a) * 1.25, 0.9 + Math.sin(t * 3 + s) * 0.15, Math.sin(a) * 0.9 - 0.3);
    }
    o.position.lerp(want, damp(opening ? 4.5 : shuffling ? 4 : 5, dt));
    const yaw = opening ? 0 : shuffling ? t * 2 + s : home.yaw;
    const h = hovered.current && !opening && !shuffling;
    o.rotation.y = THREE.MathUtils.lerp(o.rotation.y, yaw * (h ? 0.6 : 1), damp(6, dt));
    o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, opening ? -0.05 : h ? -0.04 : -0.18, damp(6, dt));
    // anticipation: a small, quick shake once it has settled in the centre
    const shake = opening && since > 0.45 && since < 0.7 ? Math.sin(since * 70) * 0.03 * (1 - (since - 0.45) / 0.25) : 0;
    o.rotation.z = THREE.MathUtils.lerp(o.rotation.z, shake, damp(30, dt));
    const base = opening ? 0.95 : n > 10 ? 0.5 : n > 5 ? 0.62 : 0.8;
    o.scale.setScalar(THREE.MathUtils.lerp(o.scale.x, base * (h ? 1.04 : 1), damp(opening ? 4 : 7, dt)));
    // the rip: starts right after the shake, takes ~0.7 s
    if (opening && since > 0.7) {
      if (!ripped.current) {
        ripped.current = true;
        sfx.rip();
      }
      tear.current = Math.min(1, (since - 0.7) / 0.55);
    }
  });
  return (
    <group
      ref={g}
      position={home.pos}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.cursor = "";
      }}
    >
      <Pack3D spot={s} art={art} tear={tear} />
    </group>
  );
}

export { CH };
