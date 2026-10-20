# Lumapa merchant SEP-7 payments

Lumapa checkout creates standard Stellar SEP-7 payment requests. The shop plugin creates a payment session on `https://lumapa.ir`, then redirects the customer to `/pay/{sessionId}`.

## Built-in network IDs

Use these for common networks:

```text
lumapa   -> Lumapa private network
public   -> Stellar public network
testnet  -> Stellar testnet
```

## Custom Stellar networks

For custom networks, do not rely on a display title only. The plugin must send the real network details with the payment session:

```json
{
  "network": "myshop-main",
  "networkName": "My Shop Network",
  "horizonUrl": "https://horizon.example.com",
  "networkPassphrase": "My Shop Network ; August 2026",
  "nativeAssetCode": "SHOP"
}
```

`network` is a stable slug for your own reporting and session records. `networkPassphrase` is the technical value wallets use to sign for the correct Stellar network. `horizonUrl` is kept with the session so payment verification can use the correct Horizon server.

The generated SEP-7 URI includes `network_passphrase`, plus Lumapa helper parameters such as `network_name`, `horizon_url`, and `native_asset_code`. Standard wallets ignore unknown parameters; Lumapa Wallet uses them for clearer review screens.

## Example native-asset payment

```text
web+stellar:pay?destination=G...&amount=25&asset_code=SHOP&memo=ORD-1001&network=myshop-main&network_passphrase=My%20Shop%20Network%20%3B%20August%202026
```

For native assets, `asset_issuer` must be empty.

## Example issued-asset payment

```text
web+stellar:pay?destination=G...&amount=25&asset_code=USDC&asset_issuer=G...ISSUER&memo=ORD-1001&network=public&network_passphrase=Public%20Global%20Stellar%20Network%20%3B%20September%202015
```
