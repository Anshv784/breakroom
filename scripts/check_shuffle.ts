// The browser verifier must reproduce the program's shuffle bit for bit.
import { readFileSync } from "fs";
import { shuffle } from "../app/src/chain/shuffle";
const v = JSON.parse(readFileSync(new URL("../app/src/chain/shuffle.vector.json", import.meta.url), "utf8"));
const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
const got = shuffle(seed, 30, 10);
const ok = JSON.stringify(got.order) === JSON.stringify(v.order) && JSON.stringify(got.spots) === JSON.stringify(v.spots);
console.log(ok ? "shuffle.ts matches the program" : `MISMATCH\n got ${JSON.stringify(got)}\n want ${JSON.stringify(v)}`);
process.exit(ok ? 0 : 1);
