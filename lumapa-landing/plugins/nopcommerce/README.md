# Lumapa Stellar Pay for nopCommerce

This folder contains the source plugin for nopCommerce 4.90.

## Correct install/build flow

1. Copy the folder `Payments.LumapaStellarPay` into your nopCommerce source tree:

```text
<your-nopcommerce-root>/Plugins/Payments.LumapaStellarPay
```

2. From the nopCommerce root, build the plugin:

```bash
dotnet build Plugins/Payments.LumapaStellarPay/Nop.Plugin.Payments.LumapaStellarPay.csproj -c Release
```

3. Confirm this file exists after build:

```text
Presentation/Nop.Web/Plugins/Payments.LumapaStellarPay/Nop.Plugin.Payments.LumapaStellarPay.dll
```

4. Restart nopCommerce and reload the plugins list.

## Why “main assembly isn’t found” happens

nopCommerce reads `plugin.json` and looks for the file named in `FileName`:

```json
"FileName": "Nop.Plugin.Payments.LumapaStellarPay.dll"
```

If that DLL is not present under `Presentation/Nop.Web/Plugins/Payments.LumapaStellarPay`, nopCommerce shows:

```text
The main assembly isn't found. Hence this plugin can't be loaded.
```

This usually means the source folder was copied directly into the web plugins folder without building, or the `.csproj` output path does not point to `Presentation/Nop.Web/Plugins/Payments.LumapaStellarPay`.
