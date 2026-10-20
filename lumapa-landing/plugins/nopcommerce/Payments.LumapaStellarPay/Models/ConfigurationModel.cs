using Nop.Web.Framework.Models;
using Nop.Web.Framework.Mvc.ModelBinding;

namespace Nop.Plugin.Payments.LumapaStellarPay.Models;

public record ConfigurationModel : BaseNopModel
{
    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.CheckoutBaseUrl")]
    public string CheckoutBaseUrl { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.MerchantId")]
    public string MerchantId { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.NetworkType")]
    public string NetworkType { get; set; } = "lumapa";

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.CustomNetworkId")]
    public string CustomNetworkId { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.CustomNetworkName")]
    public string CustomNetworkName { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.CustomHorizonUrl")]
    public string CustomHorizonUrl { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.CustomNetworkPassphrase")]
    public string CustomNetworkPassphrase { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.CustomNativeAssetCode")]
    public string CustomNativeAssetCode { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.Destination")]
    public string Destination { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.AssetCode")]
    public string AssetCode { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.Issuer")]
    public string Issuer { get; set; } = string.Empty;

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.ExpiresMinutes")]
    public int ExpiresMinutes { get; set; }

    [NopResourceDisplayName("Plugins.Payments.LumapaStellarPay.Fields.DescriptionText")]
    public string DescriptionText { get; set; } = string.Empty;
}
