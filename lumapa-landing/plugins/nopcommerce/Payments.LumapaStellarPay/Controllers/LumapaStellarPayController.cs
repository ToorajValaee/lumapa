using Microsoft.AspNetCore.Mvc;
using Nop.Plugin.Payments.LumapaStellarPay.Models;
using Nop.Services.Configuration;
using Nop.Web.Framework;
using Nop.Web.Framework.Controllers;
using Nop.Web.Framework.Mvc.Filters;

namespace Nop.Plugin.Payments.LumapaStellarPay.Controllers;

[AuthorizeAdmin]
[Area(AreaNames.ADMIN)]
public class LumapaStellarPayController : BasePluginController
{
    private readonly LumapaStellarPaySettings _settings;
    private readonly ISettingService _settingService;

    public LumapaStellarPayController(LumapaStellarPaySettings settings, ISettingService settingService)
    {
        _settings = settings;
        _settingService = settingService;
    }

    public IActionResult Configure()
    {
        var model = new ConfigurationModel
        {
            CheckoutBaseUrl = _settings.CheckoutBaseUrl,
            MerchantId = _settings.MerchantId,
            NetworkType = _settings.NetworkType,
            CustomNetworkId = _settings.CustomNetworkId,
            CustomNetworkName = _settings.CustomNetworkName,
            CustomHorizonUrl = _settings.CustomHorizonUrl,
            CustomNetworkPassphrase = _settings.CustomNetworkPassphrase,
            CustomNativeAssetCode = _settings.CustomNativeAssetCode,
            Destination = _settings.Destination,
            AssetCode = _settings.AssetCode,
            Issuer = _settings.Issuer,
            ExpiresMinutes = _settings.ExpiresMinutes,
            DescriptionText = _settings.DescriptionText
        };
        return View("~/Plugins/Payments.LumapaStellarPay/Views/Configure.cshtml", model);
    }

    [HttpPost]
    public async Task<IActionResult> Configure(ConfigurationModel model)
    {
        if (!ModelState.IsValid)
            return Configure();

        _settings.CheckoutBaseUrl = model.CheckoutBaseUrl?.TrimEnd('/') ?? string.Empty;
        _settings.MerchantId = model.MerchantId ?? string.Empty;
        _settings.NetworkType = string.IsNullOrWhiteSpace(model.NetworkType) ? "lumapa" : model.NetworkType.Trim();
        _settings.CustomNetworkId = model.CustomNetworkId ?? string.Empty;
        _settings.CustomNetworkName = model.CustomNetworkName ?? string.Empty;
        _settings.CustomHorizonUrl = model.CustomHorizonUrl?.TrimEnd('/') ?? string.Empty;
        _settings.CustomNetworkPassphrase = model.CustomNetworkPassphrase ?? string.Empty;
        _settings.CustomNativeAssetCode = model.CustomNativeAssetCode ?? string.Empty;
        _settings.Destination = model.Destination ?? string.Empty;
        _settings.AssetCode = string.IsNullOrWhiteSpace(model.AssetCode) ? "XLM" : model.AssetCode.Trim().ToUpperInvariant();
        _settings.Issuer = model.Issuer ?? string.Empty;
        _settings.ExpiresMinutes = Math.Max(1, model.ExpiresMinutes);
        _settings.DescriptionText = model.DescriptionText ?? string.Empty;

        await _settingService.SaveSettingAsync(_settings);
        return Configure();
    }
}
