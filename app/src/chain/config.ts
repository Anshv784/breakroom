// Network endpoints and fixed addresses. VITE_CLUSTER=mainnet switches everything.
import { PublicKey } from "@solana/web3.js";
import idl from "../idl/breakroom.json";

const env: Record<string, string | undefined> = (import.meta as any).env ?? ((globalThis as any).process?.env ?? {});
export const IS_MAINNET = env.VITE_CLUSTER === "mainnet";
export const CLUSTER = IS_MAINNET ? "mainnet" : "devnet";
export const BASE_RPC = (IS_MAINNET && env.VITE_BASE_RPC) || "https://rpc.magicblock.app/devnet";
export const TEE_RPC = IS_MAINNET ? "https://mainnet-tee.magicblock.app" : "https://devnet-tee.magicblock.app";
export const TEE_WS = TEE_RPC.replace("https://", "wss://");
export const PAYMENTS_API = "https://payments.magicblock.app";
export const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
export const PROGRAM_ID = new PublicKey(env.VITE_PROGRAM_ID || (idl as any).address);
export const ADMIN = new PublicKey("FwoAkqEeqdV5rpz9NbmN3ishH7a4DCLaCJGMDgHKLSJQ");
export const ESPL_PROGRAM = new PublicKey("SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2");
export const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
export const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
export const VRF_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
export const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
export const MAINNET_USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const seed = (s: string) => Buffer.from(s);
/** Devnet: the program's own test USDC (PDA mint authority, free faucet). Mainnet: real USDC. */
export const USDC_MINT = IS_MAINNET ? MAINNET_USDC : PublicKey.findProgramAddressSync([seed("usdc")], PROGRAM_ID)[0];
export const USDC_DECIMALS = 6;

export const SALE_FEE_BPS = 500;
export const TRADE_FEE_BPS = 200;
export const MIN_RAISE_BPS = 100;
