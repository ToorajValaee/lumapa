# Lumapa separated projects

This package contains two independent deployable Next.js projects:

```text
lumapa-landing/  -> https://lumapa.ir
lumapa-wallet/   -> https://app.lumapa.ir
```

Future shop placeholder:

```text
shop.lumapa.ir   -> your e-commerce site later
```

## Build and transfer with Docker tar files

Landing:

```bash
cd lumapa-landing
docker build -t lumapa-landing:latest .
docker save -o lumapa-landing.tar lumapa-landing:latest
```

Wallet:

```bash
cd lumapa-wallet
docker build -t lumapa-wallet:latest .
docker save -o lumapa-wallet.tar lumapa-wallet:latest
```

On the server:

```bash
docker load -i lumapa-landing.tar
docker load -i lumapa-wallet.tar
docker compose -f docker-compose.prod.yml up -d
```

A root `docker-compose.prod.yml` is included to run both containers after loading the images.

## Nginx

Use `deploy/nginx/lumapa.conf` as the reverse-proxy example:

```text
lumapa.ir      -> 127.0.0.1:3100
app.lumapa.ir  -> 127.0.0.1:3200
shop.lumapa.ir -> reserved for your future shop
```

## Plugin custom networks

The shop plugins support built-in Lumapa/Public/Testnet networks and arbitrary custom Stellar networks. For Custom, merchants must fill network ID, display name, Horizon URL, network passphrase, and native asset code in the plugin settings. The checkout request carries these values to the customer wallet.
