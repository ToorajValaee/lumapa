# Lumapa Wallet

Independent Stellar PWA wallet for Lumapa.

Production domain:

```text
https://app.lumapa.ir
```

Landing domain:

```text
https://lumapa.ir
```

Future shop domain:

```text
https://shop.lumapa.ir
```

The wallet supports account creation on the Lumapa private Stellar network, account recovery on any Stellar network, SEP-7 `web+stellar:` payment/transaction requests, local encrypted vault storage, and WebAuthn/passkey approval.

## Run locally

```bash
npm i
npm run dev
```

Open:

```text
http://localhost:3000
```

Unlike the previous combined project, local development opens the wallet directly. There is no host-based routing and no landing page inside this project.

## Docker build and save

```bash
docker build -t lumapa-wallet:latest .
docker save -o lumapa-wallet.tar lumapa-wallet:latest
```

On server:

```bash
docker load -i lumapa-wallet.tar
docker compose -f docker-compose.prod.yml up -d
```

## Required production env

```env
NEXT_PUBLIC_LUMAPA_WALLET_URL=https://app.lumapa.ir
NEXT_PUBLIC_LUMAPA_PUBLIC_URL=https://lumapa.ir
NEXT_PUBLIC_LUMAPA_HORIZON_URL=https://horizon.badje.ir
NEXT_PUBLIC_LUMAPA_NETWORK_PASSPHRASE="Lumapa Network ; July 2026"
NEXT_PUBLIC_LUMAPA_NATIVE_SYMBOL=BADJ
NEXT_PUBLIC_LUMAPA_NATIVE_NAME="Lumapa native"
LUMAPA_HORIZON_URL=https://horizon.badje.ir
LUMAPA_NETWORK_PASSPHRASE="Lumapa Network ; July 2026"
LUMAPA_STARTER_SECRET=S_REPLACE_WITH_LUMAPA_STARTER_SECRET
LUMAPA_STARTING_BALANCE=10
```

`LUMAPA_STARTER_SECRET` is used only by the server route that creates/funds new accounts on your private network. User secrets stay encrypted locally on the user's device.
