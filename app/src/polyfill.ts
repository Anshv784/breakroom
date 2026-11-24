// Must be the first import: some Solana libraries touch Buffer while their modules load.
import { Buffer } from "buffer";
(globalThis as any).Buffer ??= Buffer;
