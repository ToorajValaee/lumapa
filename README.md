# Lumapa

**Independent, non-custodial Stellar wallet and standards-based checkout platform.**

[Website](https://lumapa.ir) · [Wallet](https://app.lumapa.ir) · [Issues](https://github.com/ToorajValaee/lumapa/issues)

Lumapa contains two independently deployed Next.js projects. The wallet is a mobile-first Stellar PWA supporting compatible custom networks. The landing application hosts checkout, payment sessions, and merchant plugin downloads. Powered by [badje.ir](https://badje.ir).

> **Security status:** Active development; no independent security audit. Do not use significant funds or production merchant payments before auditing signing, vault protection, payment verification, and plugin callbacks.

## Projects

| Location | Role | Domain |
| --- | --- | --- |
| [lumapa-wallet/](lumapa-wallet/) | Wallet PWA, onboarding, accounts, Stellar signing | app.lumapa.ir |
| [lumapa-landing/](lumapa-landing/) | Public site, checkout and payment API | lumapa.ir |
| [lumapa-landing/plugins/](lumapa-landing/plugins/) | WooCommerce and nopCommerce integrations | Merchant shops |
| [deploy/nginx/](deploy/nginx/) | Nginx configuration example | Your server |
| [docker-compose.prod.yml](docker-compose.prod.yml) | Production image deployment | Your server |

`shop.lumapa.ir` is reserved for a future shop, not part of this repository.

## Features

- Stellar Mainnet, Testnet, Lumapa and custom Horizon networks.
- Multiple accounts per network, mnemonic/secret recovery, and encrypted local keys.
- Mnemonic derivation discovery (indexes 0–19), funded-account detection, and multi-account selection.
- Native and issued assets, trustlines, sending, receiving, QR scanning, history, and transaction signing.
- SEP-7 compatible payment requests and hosted merchant checkout.
- WooCommerce and nopCommerce integrations.
- Installable PWA with optional WebAuthn/passkey approval.

**SEP-7 does not imply a persistent wallet connection or automatic listing in dApp wallet pickers.**

## Local development

Requires Node.js 22+ and npm. Run each app in a separate terminal:

```bash
cd lumapa-wallet
cp .env.example .env.local
npm ci
npm run dev
```

```bash
cd lumapa-landing
cp .env.example .env.local
npm ci
npm run dev -- -p 3001
```

Wallet: http://localhost:3000. Landing: http://localhost:3001.

Never commit private seeds or mnemonics. Configure `LUMAPA_STARTER_SECRET` in the wallet server runtime only. `NEXT_PUBLIC_*` variables are compiled into Next.js at **build time**; configure exact network passphrases before building.

## Deploy prebuilt Docker images

```bash
docker build -t lumapa-landing:latest ./lumapa-landing
docker build -t lumapa-wallet:latest ./lumapa-wallet
docker save -o lumapa-landing.tar lumapa-landing:latest
docker save -o lumapa-wallet.tar lumapa-wallet:latest
```

Transfer tar images and `docker-compose.prod.yml` to your server, then:

```bash
docker load -i lumapa-landing.tar
docker load -i lumapa-wallet.tar
docker compose -f docker-compose.prod.yml up -d
```

Use [the Nginx example](deploy/nginx/lumapa.conf) to route `lumapa.ir` to port 3100 and `app.lumapa.ir` to port 3200. HTTPS is required for camera and WebAuthn on public domains.

## Custom Stellar networks

Supply a Horizon URL and the network's **exact passphrase**; RPC is optional. The native token may have a custom display symbol, but remains Stellar's native asset on-chain. Mnemonic discovery scans indexes 0–19 and allows importing funded or unfunded addresses.

## Merchant checkout

Merchant integrations configure the receiver address, asset, and network (including custom Horizon and passphrase). Checkout creates SEP-7 requests and verifies settlement through Horizon. **A wallet submission alone must never mark an order as paid.** See [merchant protocol notes](lumapa-landing/docs/merchant-sep7.md).

## Checks

```bash
cd lumapa-wallet && npm ci && npm run typecheck && npm run build
cd ../lumapa-landing && npm ci && npm run typecheck && npm run build
```

nopCommerce requires a compatible .NET/nopCommerce build environment. WooCommerce PHP should be linted and tested within WordPress.

## Contributing and security

Read [the wallet security guidance](lumapa-wallet/SECURITY.md). Bug reports and contributions are welcome via [Issues](https://github.com/ToorajValaee/lumapa/issues). Never submit secrets, production environment files, or private payment data.
