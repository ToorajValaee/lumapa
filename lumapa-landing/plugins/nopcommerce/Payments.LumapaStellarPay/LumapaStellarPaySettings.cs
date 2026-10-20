using Nop.Core.Configuration;

namespace Nop.Plugin.Payments.LumapaStellarPay;

public class LumapaStellarPaySettings : ISettings
{
    public string CheckoutBaseUrl { get; set; } = "https://lumapa.ir";
    public string MerchantId { get; set; } = "nopcommerce";
    public string NetworkType { get; set; } = "lumapa";
    public string CustomNetworkId { get; set; } = string.Empty;
    public string CustomNetworkName { get; set; } = string.Empty;
    public string CustomHorizonUrl { get; set; } = string.Empty;
    public string CustomNetworkPassphrase { get; set; } = string.Empty;
    public string CustomNativeAssetCode { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public string AssetCode { get; set; } = "BADJ";
    public string Issuer { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 15;
    public string DescriptionText { get; set; } = "Pay securely with any compatible Stellar wallet using Lumapa.";
}
