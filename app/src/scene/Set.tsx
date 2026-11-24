// The break-room set: studio backdrop, reflective table with a status-lit rim, a pedestal per
// spot with its nameplate, and the TEE vault in the middle (a sealed booster box inside glass).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { ST } from "../chain/layout";

export const STATUS_COLOR = (status: number) => (status >= ST.ENDED ? "#4fe3a1" : status === ST.SHUFFLING ? "#ffd27a" : status === ST.LIVE ? "#d79bff" : "#b58cff");

/** Back wall: a curved studio cyc with vertical light strips in the foil colours. */
export function Studio({ status }: { status: number }) {
  const strips = useMemo(() => {
    const out: { a: number; c: string; h: number }[] = [];
    const cols = ["#7cf7e4", "#b58cff", "#ffd27a", "#ff5fa8"];
    for (let i = 0; i < 14; i++) out.push({ a: -1.1 + (i / 13) * 2.2, c: cols[i % 4], h: 2.2 });
    return out;
  }, []);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const fast = status === ST.SHUFFLING ? 6 : status === ST.LIVE ? 2 : 0.8;
    mats.current.forEach((m) => m && (m.opacity = 0.05));
    void t;
    void fast;
  });
  return (
    <group>
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[9.5, 9.5, 7, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
        <meshStandardMaterial color="#0d0a12" side={THREE.BackSide} roughness={0.9} />
      </mesh>
      {strips.map((s, i) => (
        <mesh key={i} position={[Math.sin(s.a) * 9.3, 1.1 + s.h / 2, -Math.cos(s.a) * 9.3]} rotation={[0, -s.a, 0]}>
          <planeGeometry args={[0.035, s.h]} />
          <meshBasicMaterial ref={(m) => (mats.current[i] = m!)} color={s.c} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A soft volumetric cone from the ceiling light onto the table. */
export function LightCone() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { color: { value: new THREE.Color("#c9b8ff") } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 color; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float fade = smoothstep(0.0, 1.0, vUv.y); gl_FragColor = vec4(color, 0.07 * edge * fade); }`,
      }),
    [],
  );
  return (
    <mesh position={[0, 3.2, -0.2]} material={mat}>
      <cylinderGeometry args={[0.35, 3.4, 6.4, 48, 1, true]} />
    </mesh>
  );
}

/** Glossy dark table with a status-coloured LED rim. */
export function TableTop({ status }: { status: number }) {
  const rim = useRef<THREE.MeshBasicMaterial>(null);
  const color = STATUS_COLOR(status);
  useFrame(({ clock }) => {
    if (rim.current) {
      rim.current.color.lerp(new THREE.Color(color), 0.05);
      rim.current.opacity = 0.6;
      void clock;
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[4.3, 128]} />
        {/* satin lacquer: picks up the soft studio light without mirror streaks */}
        <meshPhysicalMaterial color="#110e16" roughness={0.45} metalness={0.3} clearcoat={0.5} clearcoatRoughness={0.4} envMapIntensity={0.3} />
      </mesh>
      {/* inner ring markings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[1.18, 1.2, 128]} />
        <meshBasicMaterial color="#b58cff" transparent opacity={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[2.95, 2.965, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
      </mesh>
      {/* LED rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[4.22, 4.3, 160]} />
        <meshBasicMaterial ref={rim} color={color} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      {/* base sits just below the top so the two never fight for the same pixels */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[4.32, 4.1, 0.18, 128]} />
        <meshStandardMaterial color="#1c1622" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** Pedestal under each spot: lit edge in the owner's state, nameplate in front. */
export function SpotStand({
  pos,
  yaw,
  index,
  name,
  owned,
  mine,
  selected,
  price,
  team,
  teamColor,
  quiet = false,
  onClick,
}: {
  pos: THREE.Vector3;
  yaw: number;
  index: number;
  name: string;
  owned: boolean;
  mine: boolean;
  selected: boolean;
  price?: string;
  team?: string;
  teamColor?: string;
  quiet?: boolean;
  onClick: () => void;
}) {
  const edge = mine ? "#4fe3a1" : selected ? "#ffd27a" : owned ? "#b58cff" : "#8a8295";
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.opacity = selected ? 0.16 : mine ? 0.12 : 0.03;
    void clock;
  });
  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, yaw, 0]}>
      <RoundedBox args={[0.74, 0.06, 0.5]} radius={0.02} position={[0, 0.03, 0]} onClick={(e) => (e.stopPropagation(), onClick())}>
        <meshStandardMaterial color="#1a1420" metalness={0.8} roughness={0.25} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.062, 0]}>
        <planeGeometry args={[0.7, 0.46]} />
        <meshBasicMaterial ref={glow} color={edge} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Html position={[0, 0.07, 0.33]} center transform={false} distanceFactor={4.2} zIndexRange={[20, 0]} style={{ pointerEvents: "auto" }}>
        <button
          onClick={onClick}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 7px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            background: selected ? "rgba(255,210,122,.14)" : "rgba(10,8,14,.72)",
            border: `1px solid ${selected ? "#ffd27a88" : mine ? "#4fe3a188" : "rgba(255,255,255,.10)"}`,
            backdropFilter: "blur(6px)",
            font: "500 9.5px Inter Tight, sans-serif",
            letterSpacing: ".01em",
            color: owned ? "#e9e4ef" : "#8a8295",
            maxWidth: 150,
            opacity: quiet ? 0.1 : 1,
            transition: "opacity .35s ease, background .2s",
          }}
        >
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8.5, color: "#7d7586" }}>{String(index + 1).padStart(2, "0")}</span>
          <span style={{ width: 4, height: 4, borderRadius: 4, background: mine ? "#4fe3a1" : owned ? "#b58cff" : "#5d5666", flex: "none" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{owned ? (mine ? "You" : name) : "open"}</span>
          {price && <span style={{ color: "#4fe3a1", fontFamily: "JetBrains Mono, monospace", fontSize: 8.5 }}>{price}</span>}
          {team && <span style={{ color: teamColor, fontFamily: "JetBrains Mono, monospace", fontSize: 8, letterSpacing: ".06em" }}>{team.toUpperCase()}</span>}
        </button>
      </Html>
    </group>
  );
}

/** Booster-box print for the vault. */
function boxTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "#2a1640");
  g.addColorStop(0.5, "#120b1c");
  g.addColorStop(1, "#3a2410");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = "#ffd27a";
  x.lineWidth = 10;
  x.strokeRect(18, 18, 476, 476);
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.font = "900 70px Unbounded, sans-serif";
  x.fillText("BREAK", 256, 210);
  x.fillText("ROOM", 256, 285);
  x.font = "600 26px 'JetBrains Mono', monospace";
  x.fillStyle = "#ffd27a";
  x.fillText("GENESIS · SEALED BOX", 256, 345);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The sealed shuffle, as a glass vault around the booster box. */
export function Vault({ status, quiet, label }: { status: number; quiet: boolean; label: string }) {
  const g = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const tex = useMemo(boxTexture, []);
  const color = STATUS_COLOR(status);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const shuffling = status === ST.SHUFFLING;
    if (box.current) {
      box.current.rotation.y += dt * (shuffling ? 2.4 : 0.2);
      box.current.position.y = 0.32 + Math.sin(t * 1.2) * 0.02;
      const open = status >= ST.ENDED ? 1 : 0;
      box.current.scale.setScalar(THREE.MathUtils.lerp(box.current.scale.x, open ? 0.75 : 1, 0.05));
    }
    if (rings.current) {
      rings.current.rotation.y += dt * (shuffling ? 1.6 : 0.25);
      rings.current.position.y = 0.5 + (shuffling ? Math.sin(t * 2) * 0.18 : 0);
    }
    if (g.current) g.current.scale.setScalar(THREE.MathUtils.lerp(g.current.scale.x, quiet ? 0.42 : 0.52, 0.08));
  });
  return (
    <group ref={g} position={[0, 0, 1.05]} scale={0.52}>
      {/* plinth */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.52, 0.6, 0.1, 64]} />
        <meshStandardMaterial color="#1b1522" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.102, 0]}>
        <ringGeometry args={[0.42, 0.5, 64]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* the box */}
      <group ref={box}>
        <mesh>
          <boxGeometry args={[0.36, 0.36, 0.22]} />
          <meshPhysicalMaterial map={tex} metalness={0.5} roughness={0.3} clearcoat={1} iridescence={0.6} />
        </mesh>
      </group>
      {/* glass vault */}
      <RoundedBox args={[0.78, 0.78, 0.78]} radius={0.06} smoothness={4} position={[0, 0.5, 0]}>
        {/* clean glass: no animated distortion, no grain */}
        <meshPhysicalMaterial transmission={1} thickness={0.35} roughness={0.14} ior={1.4} clearcoat={0.25} clearcoatRoughness={0.3} specularIntensity={0.35} attenuationColor={color} attenuationDistance={2.5} envMapIntensity={0.55} transparent />
      </RoundedBox>
      {/* orbiting scan rings */}
      <group ref={rings} position={[0, 0.5, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.56, 0.004, 8, 160]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} />
        </mesh>
      </group>
      <pointLight color={color} intensity={0.35} distance={1.4} position={[0, 0.6, 0.7]} />
      <Html center position={[0, 0.02, 0.72]} distanceFactor={5} style={{ pointerEvents: "none" }}>
        <div
          style={{
            font: "500 6.5px JetBrains Mono, monospace",
            letterSpacing: ".2em",
            color,
            whiteSpace: "nowrap",
            padding: "2px 7px",
            borderRadius: 999,
            border: `1px solid ${color}44`,
            background: "rgba(8,6,12,.7)",
            opacity: quiet ? 0 : 1,
            transition: "opacity .4s",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}
