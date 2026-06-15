// DOK-156 — env-gated TON "proof-of-cover" notarization.
//
// SCOPE: notarization ONLY. We anchor a sha256 HASH of the policy certificate
// plus the MINIMAL metadata (policy number, agreement id, coverage amount,
// dates) on-chain so the cover becomes tamper-proof. We NEVER put personal
// data on-chain. This is explicitly NOT coins/payments/transfers/value tokens —
// it is a verifiable proof-of-cover record only.
//
// ENV-GATED: without the required env vars the whole module is a no-op. The
// policy stays exactly as it is today (off-chain only), no errors, no behaviour
// change. Testnet is the default network.
//
// BEST-EFFORT: anchoring must never block or slow swap acceptance / policy
// issuance. Every on-chain call is wrapped so a failure (or missing env) just
// returns a non-anchored result; it never throws to the caller.
//
// SERVER-ONLY: this module pulls in the heavy @ton/* SDKs via lazy dynamic
// import so it can never be bundled into a client. Client components must read
// onChainRef from the DTO instead of importing anything here.

import { createHash } from "node:crypto";

export type TonNetwork = "testnet" | "mainnet";

// A read-only env bag. Looser than NodeJS.ProcessEnv so callers (and tests) can
// pass plain partial objects without casting.
export type ChainEnv = Record<string, string | undefined>;

export type TonConfig = {
  network: TonNetwork;
  endpoint: string;
  apiKey?: string;
  /** Service wallet secret — mnemonic words (space-separated) or a raw key. */
  mnemonic?: string;
  signingKey?: string;
};

export type AnchorResult =
  | { skipped: true; status: "skipped"; ref: null; network: null }
  | { skipped: false; status: "pending" | "anchored" | "failed"; ref: string | null; network: TonNetwork };

// The minimal, PII-free certificate metadata that gets hashed and anchored.
// NOTHING here identifies a person: no names, no emails, no addresses.
export type CertificateMetadata = {
  policyNumber: string;
  agreementId: string;
  coverageAmount: number;
  dateFrom: string; // ISO date (yyyy-mm-dd) — see canonicalMetadata
  dateTo: string; // ISO date (yyyy-mm-dd)
};

// Minimal shape we need off a persisted policy / its agreement to build the
// canonical metadata. Kept structural so callers can pass a Prisma row.
export type AnchorablePolicy = {
  policyNumber: string;
  agreementId: string;
  coverageAmount: number;
  dateFrom: Date | string;
  dateTo: Date | string;
};

const DEFAULT_ENDPOINTS: Record<TonNetwork, string> = {
  testnet: "https://testnet.toncenter.com/api/v2/jsonRPC",
  mainnet: "https://toncenter.com/api/v2/jsonRPC",
};

/**
 * Read the TON config from env. Returns null ("disabled") when the essential
 * env is missing — which is the default state and makes anchoring a no-op.
 *
 * Essential: a signing secret (TON_MNEMONIC or TON_SIGNING_KEY). The endpoint
 * has a sane per-network default, so only the secret truly gates the feature.
 */
export function readConfig(env: ChainEnv = process.env): TonConfig | null {
  const network: TonNetwork = env.TON_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const mnemonic = env.TON_MNEMONIC?.trim() || undefined;
  const signingKey = env.TON_SIGNING_KEY?.trim() || undefined;

  // No service wallet secret → feature disabled (no-op).
  if (!mnemonic && !signingKey) return null;

  const endpoint = env.TON_ENDPOINT?.trim() || DEFAULT_ENDPOINTS[network];

  return {
    network,
    endpoint,
    apiKey: env.TON_API_KEY?.trim() || undefined,
    mnemonic,
    signingKey,
  };
}

/** True when the env enables on-chain anchoring. */
export function isEnabled(env: ChainEnv = process.env): boolean {
  return readConfig(env) !== null;
}

const day = (d: Date | string): string =>
  (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

/**
 * Canonical, deterministic, PII-FREE metadata for hashing. Stable key order +
 * normalised date granularity (day) so the same policy always hashes the same
 * regardless of object key order or time-of-day noise.
 */
export function canonicalMetadata(policy: AnchorablePolicy): CertificateMetadata {
  return {
    policyNumber: policy.policyNumber,
    agreementId: policy.agreementId,
    coverageAmount: policy.coverageAmount,
    dateFrom: day(policy.dateFrom),
    dateTo: day(policy.dateTo),
  };
}

/** Stable JSON serialisation (sorted keys) of the canonical metadata. */
export function canonicalJson(policy: AnchorablePolicy): string {
  const m = canonicalMetadata(policy);
  // Explicit key order — never rely on insertion order for the hash input.
  return JSON.stringify({
    agreementId: m.agreementId,
    coverageAmount: m.coverageAmount,
    dateFrom: m.dateFrom,
    dateTo: m.dateTo,
    policyNumber: m.policyNumber,
  });
}

/**
 * Deterministic sha256 (hex) of the canonical certificate metadata. Pure and
 * dependency-free so it can be unit-tested and recomputed for verification.
 * Contains NO personal data by construction (see canonicalMetadata).
 */
export function certificateHash(policy: AnchorablePolicy): string {
  return createHash("sha256").update(canonicalJson(policy), "utf8").digest("hex");
}

/** Explorer URL for a given on-chain ref (tx hash / address) for the badge UI. */
export function explorerUrl(ref: string | null | undefined, network: TonNetwork | string | null | undefined): string | null {
  if (!ref) return null;
  const host = network === "mainnet" ? "tonviewer.com" : "testnet.tonviewer.com";
  return `https://${host}/transaction/${ref}`;
}

/**
 * Anchor the certificate hash on TON. Best-effort and fully wrapped:
 *   - disabled (no env) → { skipped: true, status: "skipped" }
 *   - any error         → { skipped: false, status: "failed", ref: null }
 *   - success           → { skipped: false, status: "anchored", ref }
 *
 * The hash is written as the comment/body of a tiny self-send from the service
 * wallet — a verifiable, value-less record. It is NOT a coin/payment/transfer
 * of value; the only TON moved is the negligible network fee on the service
 * wallet's own message, which is an implementation detail of writing a record.
 */
export async function anchorPolicy(
  policy: AnchorablePolicy,
  env: ChainEnv = process.env,
): Promise<AnchorResult> {
  const config = readConfig(env);
  if (!config) {
    return { skipped: true, status: "skipped", ref: null, network: null };
  }

  try {
    const hash = certificateHash(policy);
    const ref = await writeRecord(config, hash);
    if (!ref) {
      return { skipped: false, status: "failed", ref: null, network: config.network };
    }
    return { skipped: false, status: "anchored", ref, network: config.network };
  } catch (err) {
    // Never rethrow — anchoring is best-effort and must not affect the caller.
    console.error("[chain:ton] anchor failed", err);
    return { skipped: false, status: "failed", ref: null, network: config.network };
  }
}

/**
 * Write `hash` as a verifiable record on TON and return a reference (the
 * external message hash). Lazily imports the TON SDK so this never lands in a
 * client bundle and a missing optional dep degrades gracefully to "failed".
 */
async function writeRecord(config: TonConfig, hash: string): Promise<string | null> {
  // Lazy, dynamic, server-only imports. The variable indirection + ignore hint
  // keep the bundler from trying to statically resolve these into any client
  // graph.
  const tonClientMod = "@ton/ton";
  const tonCryptoMod = "@ton/crypto";
  const tonCoreMod = "@ton/core";

  const { TonClient, WalletContractV4, internal } = (await import(
    /* webpackIgnore: true */ tonClientMod
  )) as typeof import("@ton/ton");
  const { mnemonicToPrivateKey } = (await import(
    /* webpackIgnore: true */ tonCryptoMod
  )) as typeof import("@ton/crypto");
  const { beginCell } = (await import(/* webpackIgnore: true */ tonCoreMod)) as typeof import("@ton/core");

  // Resolve the service wallet keypair from the configured secret.
  const words = (config.mnemonic ?? config.signingKey ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const keyPair = await mnemonicToPrivateKey(words);

  const client = new TonClient({ endpoint: config.endpoint, apiKey: config.apiKey });
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);

  // The record body: a fixed tag + the sha256 hash, as an on-chain comment.
  // No personal data — only the proof-of-cover hash.
  const body = beginCell()
    .storeUint(0, 32) // text-comment opcode
    .storeStringTail(`swapl:proof-of-cover:${hash}`)
    .endCell();

  const seqno = await contract.getSeqno();
  const transfer = wallet.createTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: wallet.address, // self-send: a value-less record, not a transfer
        value: BigInt(0),
        bounce: false,
        body,
      }),
    ],
  });

  await contract.send(transfer);

  // Reference = external message hash (hex). This is what the explorer URL and
  // the verification endpoint key off.
  return transfer.hash().toString("hex");
}
