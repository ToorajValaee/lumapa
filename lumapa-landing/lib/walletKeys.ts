import { generateMnemonic as generateBip39Mnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { Keypair } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

const HARDENED_OFFSET = 0x80000000;

function concatBytes(...arrays: Uint8Array[]) {
  const length = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function ser32(index: number) {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, index, false);
  return buffer;
}

function slip10Master(seed: Uint8Array) {
  const digest = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  return { key: digest.slice(0, 32), chainCode: digest.slice(32) };
}

function slip10DeriveHardened(parentKey: Uint8Array, parentChainCode: Uint8Array, index: number) {
  const hardenedIndex = index + HARDENED_OFFSET;
  const data = concatBytes(new Uint8Array([0]), parentKey, ser32(hardenedIndex));
  const digest = hmac(sha512, parentChainCode, data);
  return { key: digest.slice(0, 32), chainCode: digest.slice(32) };
}

export function generateMnemonic(wordCount: 12 | 24 = 24) {
  return generateBip39Mnemonic(wordlist, wordCount === 24 ? 256 : 128);
}

export function isValidMnemonic(mnemonic: string) {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

export function deriveStellarKeypair(mnemonic: string, accountIndex = 0) {
  if (!isValidMnemonic(mnemonic)) throw new Error('Invalid mnemonic phrase.');
  const seed = mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  let node = slip10Master(seed);
  node = slip10DeriveHardened(node.key, node.chainCode, 44);
  node = slip10DeriveHardened(node.key, node.chainCode, 148);
  node = slip10DeriveHardened(node.key, node.chainCode, accountIndex);
  const keypair = Keypair.fromRawEd25519Seed(Buffer.from(node.key));
  return {
    publicKey: keypair.publicKey(),
    secret: keypair.secret(),
    derivationPath: `m/44'/148'/${accountIndex}'`
  };
}

export function keypairFromSecret(secret: string) {
  const keypair = Keypair.fromSecret(secret.trim());
  return { publicKey: keypair.publicKey(), secret: keypair.secret() };
}

export function pickMnemonicChallenge(mnemonic: string, count = 4) {
  const words = mnemonic.trim().split(/\s+/g);
  const positions = new Set<number>();
  while (positions.size < Math.min(count, words.length)) {
    positions.add(Math.floor(Math.random() * words.length));
  }
  return Array.from(positions).sort((a, b) => a - b).map((index) => ({ index, word: words[index] }));
}
