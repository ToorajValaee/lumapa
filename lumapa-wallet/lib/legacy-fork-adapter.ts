import type { AccountKeyAlgorithm, NetworkProfile } from './types';

/**
 * Fork-specific account support must be implemented only after reviewing
 * the fork's public key encoding, derivation, XDR, hashing, and signatures.
 * No mnemonic or private key is ever sent to a remote adapter.
 */
export interface DerivedForkAccount {
  index: number;
  address: string;
  derivationPath: string;
  keyAlgorithm: AccountKeyAlgorithm;
}

export interface ForkAccountStatus {
  exists: boolean;
  address: string;
}

/** A verified adapter provides each operation for its own network format. */
export interface LegacyForkAdapter {
  readonly id: string;
  readonly keyAlgorithm: 'secp256k1';
  deriveAddress(mnemonic: string, index: number): Promise<DerivedForkAccount>;
  lookupAccount(network: NetworkProfile, address: string): Promise<ForkAccountStatus>;
  signTransaction(args: {
    network: NetworkProfile;
    unsignedPayload: Uint8Array;
    privateKey: Uint8Array;
  }): Promise<Uint8Array>;
  verifySignature(args: {
    payload: Uint8Array;
    signature: Uint8Array;
    publicKey: Uint8Array;
  }): Promise<boolean>;
}

/**
 * Deliberately no default legacy adapter. Do not treat BIP-32 private
 * key bytes as Stellar/Ed25519 seeds, and do not guess a fork encoding.
 */
const verifiedAdapters: Readonly<Record<string, LegacyForkAdapter>> = Object.freeze({});

export function getLegacyForkAdapter(network: NetworkProfile): LegacyForkAdapter | undefined {
  if (network.accountKeyAlgorithm !== 'secp256k1' || !network.legacyAdapterId) return undefined;
  return verifiedAdapters[network.legacyAdapterId];
}

export function requireLegacyForkAdapter(network: NetworkProfile): LegacyForkAdapter {
  const adapter = getLegacyForkAdapter(network);
  if (!adapter) {
    throw new Error('This network has no verified secp256k1 adapter. Provide the Stellar Core fork specification before enabling recovery or signing.');
  }
  return adapter;
}
