# Legacy secp256k1 fork support

Lumapa supports **standard Stellar Ed25519 accounts** today. A legacy/fork-specific secp256k1 account type is now represented in the types, but **cannot yet be recovered, signed, or submitted** without matching the actual chain protocol.

## Why a fork adapter is needed

The upstream Stellar Core classic account public key and signature implementations are Ed25519-only. A modified core may add a new public-key discriminant, address encoding, transaction serialization, or signature type. Merely deriving a BIP-32 secp256k1 key will not reveal which address corresponds to that key or how to sign the fork's transaction.

## Required technical inputs (public; never send private keys)

- Fork's Stellar Core repository link and commit/version or protocol specification.
- A **public** address from the secp256k1 account, plus the address encoding / checksum rules.
- Mnemonic derivation algorithm and path (e.g. BIP-32/BIP-44; coin type, account index, compressed/uncompressed pubkey).
- Network passphrase, Horizon URL, any custom account endpoint.
- Transaction hashing, XDR changes, signature encoding and hint format.
- Example public transaction XDR and signature (test network only).

Once confirmed, an adapter should provide `deriveAddress`, `getAccount`, `getBalance`, `signTransaction`, `submitTransaction`, and signature verification, plus test vectors. Do not mark any custom network as `accountKeyAlgorithm: 'secp256k1'` until the adapter is deployed and tested.

## Security

Never convert secp256k1 material into Ed25519 material merely to make a transaction pass. Never upload real mnemonics/secrets to diagnostic tools. Legacy account signing is fail-closed in `lib/stellar.ts`.
