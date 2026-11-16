// Mint + appraise test card NFTs (devnet). Real deployments register tokenized graded cards instead.
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { MINT_SIZE, createInitializeMint2Instruction, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createSetAuthorityInstruction, AuthorityType, getMinimumBalanceForRentExemptMint } from "@solana/spl-token";
import { BreakroomClient, ata, cardPda, fixedBytes, ix } from "../app/src/chain/client";

export interface CardSpec {
  name: string;
  set: string;
  value: number; // USD
  tier: number;
  grade: number; // x10
  art: number;
}

/** Admin mints a 1-of-1 card to `owner` and records its appraisal. */
export async function mintCard(adminC: BreakroomClient, owner: PublicKey, spec: CardSpec): Promise<PublicKey> {
  const mint = Keypair.generate();
  const rent = await getMinimumBalanceForRentExemptMint(adminC.base);
  const me = adminC.me;
  await adminC.sendBase(
    [
      SystemProgram.createAccount({ fromPubkey: me, newAccountPubkey: mint.publicKey, lamports: rent, space: MINT_SIZE, programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }),
      createInitializeMint2Instruction(mint.publicKey, 0, me, null),
      createAssociatedTokenAccountIdempotentInstruction(me, ata(owner, mint.publicKey), owner, mint.publicKey),
      createMintToInstruction(mint.publicKey, ata(owner, mint.publicKey), me, 1),
      createSetAuthorityInstruction(mint.publicKey, me, AuthorityType.MintTokens, null),
    ],
    [mint],
  );
  const cert = BigInt(Math.floor(Math.random() * 9e9) + 1e9);
  await adminC.sendBase([
    ix(
      "appraise",
      { value: new (await import("@coral-xyz/anchor")).BN(spec.value * 1e6), tier: spec.tier, grade: spec.grade, cert: new (await import("@coral-xyz/anchor")).BN(cert.toString()), name: fixedBytes(spec.name, 32), set: fixedBytes(spec.set, 24), art: spec.art },
      { appraiser: me, mint: mint.publicKey, card: cardPda(mint.publicKey) },
    ),
  ]);
  return mint.publicKey;
}
