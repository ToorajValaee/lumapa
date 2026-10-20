# Lumapa Wallet security notes

Lumapa is designed as a non-custodial Stellar wallet.

## Local secrets

- User secrets and mnemonics are encrypted locally.
- The server never receives user wallet secrets.
- Revealing secrets requires wallet unlock and approval.
- WebAuthn/passkeys can be used as an approval gate.

## Account creation source account

The server-side `LUMAPA_STARTER_SECRET` funds new accounts only on the Lumapa private network. Keep this account limited and monitored.

Recommended controls:

- fund it with a limited balance
- rotate it if exposed
- rate-limit `/api/lumapa/create-account`
- add abuse protection before public launch
- monitor failed and repeated creation attempts

## Merchant payments

Payment sessions generate standard Stellar SEP-7 requests. Merchant backends must verify completed transactions on Horizon before marking orders paid.

Verify:

- network passphrase
- destination
- asset code and issuer
- amount
- memo or muxed account
- ledger success
- transaction uniqueness
