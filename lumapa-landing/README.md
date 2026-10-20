# Lumapa Landing

Public landing, merchant checkout pages, plugin downloads, and developer source-code links for **Lumapa**.

Production domain:

```text
https://lumapa.ir
```

The wallet app is a separate project and should run at:

```text
https://app.lumapa.ir
```

Future e-commerce demo/shop domain:

```text
https://shop.lumapa.ir
```

Footer credit: powered by **badje.ir**.

## Run locally

```bash
npm i
npm run dev
```

Open:

```text
http://localhost:3000
```

## Docker build and save

```bash
docker build -t lumapa-landing:latest .
docker save -o lumapa-landing.tar lumapa-landing:latest
```

On server:

```bash
docker load -i lumapa-landing.tar
docker compose -f docker-compose.prod.yml up -d
```

## Included plugin downloads

```text
/downloads/woocommerce-lumapa-stellar-pay.zip
/downloads/nopcommerce-lumapa-stellar-pay.zip
```

The plugins should create standard Stellar SEP-7 payment requests, so compatible Stellar wallets can open the same payment request. Lumapa Wallet is one compatible wallet.

Set your GitHub repository link with:

```env
NEXT_PUBLIC_GITHUB_REPO_URL=https://github.com/YOUR_ORG/YOUR_REPO
```

## Custom network plugin setup

Merchants can now choose **Custom Stellar network** in the WooCommerce or nopCommerce plugin settings. When Custom is selected, these fields are required:

```text
Custom network ID: a stable slug, for example myshop-main
Custom network display name: shown on checkout, for example My Shop Network
Custom Horizon URL: example https://horizon.example.com
Custom network passphrase: exact Stellar Core network passphrase
Custom native asset code: example BADJ, SHOP, or XLM
```

The network passphrase is included in the generated SEP-7 payment URI so compatible wallets can sign for the correct network. Customers should not enter these details during checkout; the merchant config provides them.
