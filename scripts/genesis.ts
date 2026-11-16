// The BREAKROOM Genesis set: original characters, one per element (art % 8 picks the element:
// 0 ember, 1 tidal, 2 stone, 3 void, 4 storm, 5 bloom, 6 frost, 7 solar).
export const GENESIS: { name: string; el: number }[] = [
  { name: "Ember Wyrm", el: 0 }, { name: "Cinder Fox", el: 0 }, { name: "Ashen Drake", el: 0 }, { name: "Pyre Monk", el: 0 },
  { name: "Tidal Sprite", el: 1 }, { name: "Abyss Leviathan", el: 1 }, { name: "Reef Herald", el: 1 }, { name: "Brine Siren", el: 1 },
  { name: "Stone Golem", el: 2 }, { name: "Quartz Tortoise", el: 2 }, { name: "Basalt Titan", el: 2 }, { name: "Geode Mole", el: 2 },
  { name: "Void Seraph", el: 3 }, { name: "Null Wisp", el: 3 }, { name: "Eclipse Oracle", el: 3 }, { name: "Hollow Knight", el: 3 },
  { name: "Storm Roc", el: 4 }, { name: "Static Hare", el: 4 }, { name: "Thunder Djinn", el: 4 }, { name: "Gale Courier", el: 4 },
  { name: "Bloom Dryad", el: 5 }, { name: "Thorn Stag", el: 5 }, { name: "Moss Warden", el: 5 }, { name: "Petal Imp", el: 5 },
  { name: "Frost Lynx", el: 6 }, { name: "Rime Owl", el: 6 }, { name: "Glacier Maw", el: 6 }, { name: "Snowglass Fae", el: 6 },
  { name: "Solar Lion", el: 7 }, { name: "Dawn Moth", el: 7 }, { name: "Halo Phoenix", el: 7 }, { name: "Gilded Scarab", el: 7 },
];

/** A box of `n` cards with a real rarity curve: one chase, a few big hits, a long tail. */
export function boxSpecs(n: number, seed = Date.now()) {
  let s = seed % 2147483647 || 1;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const pool = [...GENESIS].sort(() => rnd() - 0.5);
  const tiers: number[] = [];
  tiers.push(4);
  const legend = Math.max(1, Math.round(n * 0.08));
  const epic = Math.max(1, Math.round(n * 0.17));
  const rare = Math.round(n * 0.3);
  for (let i = 0; i < legend; i++) tiers.push(3);
  for (let i = 0; i < epic; i++) tiers.push(2);
  for (let i = 0; i < rare; i++) tiers.push(1);
  while (tiers.length < n) tiers.push(0);
  tiers.length = n;
  const value = (t: number) => [2 + rnd() * 5, 11 + rnd() * 14, 32 + rnd() * 38, 110 + rnd() * 90, 420 + rnd() * 160][t];
  const grade = (t: number) => (t >= 3 ? 95 + Math.round(rnd()) * 5 : 80 + Math.round(rnd() * 3) * 5);
  return tiers.map((t, i) => {
    const g = pool[i % pool.length];
    return { name: g.name, set: "Genesis", value: Math.round(value(t)), tier: t, grade: grade(t), art: g.el + 8 * Math.floor(rnd() * 100) };
  });
}
