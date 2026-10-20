using Microsoft.AspNetCore.Http;
using Nop.Core.Domain.Orders;
using Nop.Core.Domain.Payments;
using Nop.Plugin.Payments.LumapaStellarPay.Components;
using Nop.Plugin.Payments.LumapaStellarPay.Services;
using Nop.Services.Configuration;
using Nop.Services.Localization;
using Nop.Services.Orders;
using Nop.Services.Payments;
using Nop.Services.Plugins;

namespace Nop.Plugin.Payments.LumapaStellarPay;

public class LumapaStellarPayPaymentMethod : BasePlugin, IPaymentMethod
{
    private readonly LumapaStellarPaySettings _settings;
    private readonly LumapaClient _lumaPayClient;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILocalizationService _localizationService;
    private readonly IOrderService _orderService;
    private readonly ISettingService _settingService;

    public LumapaStellarPayPaymentMethod(
        LumapaStellarPaySettings settings,
        LumapaClient lumaPayClient,
        IHttpContextAccessor httpContextAccessor,
        ILocalizationService localizationService,
        IOrderService orderService,
        ISettingService settingService)
    {
        _settings = settings;
        _lumaPayClient = lumaPayClient;
        _httpContextAccessor = httpContextAccessor;
        _localizationService = localizationService;
        _orderService = orderService;
        _settingService = settingService;
    }

    private (string Network, string? NetworkName, string? HorizonUrl, string? NetworkPassphrase, string? NativeAssetCode) GetNetworkPayload()
    {
        var networkType = string.IsNullOrWhiteSpace(_settings.NetworkType) ? "lumapa" : _settings.NetworkType.Trim();
        if (!networkType.Equals("custom", StringComparison.OrdinalIgnoreCase))
        {
            var displayName = networkType switch
            {
                "lumapa" => "Lumapa Network",
                "public" => "Stellar Public Network",
                "testnet" => "Stellar Testnet",
                _ => networkType
            };
            return (networkType, displayName, null, null, null);
        }

        var networkId = (_settings.CustomNetworkId ?? string.Empty).Trim().ToLowerInvariant();
        var networkName = (_settings.CustomNetworkName ?? string.Empty).Trim();
        var horizonUrl = (_settings.CustomHorizonUrl ?? string.Empty).TrimEnd('/');
        var passphrase = (_settings.CustomNetworkPassphrase ?? string.Empty).Trim();
        var nativeAssetCode = (_settings.CustomNativeAssetCode ?? string.Empty).Trim().ToUpperInvariant();

        if (string.IsNullOrWhiteSpace(networkId) || string.IsNullOrWhiteSpace(networkName) || string.IsNullOrWhiteSpace(horizonUrl) || string.IsNullOrWhiteSpace(passphrase) || string.IsNullOrWhiteSpace(nativeAssetCode))
            throw new InvalidOperationException("Custom network is selected, but custom network ID, display name, Horizon URL, passphrase, and native asset code are required.");

        return (networkId, networkName, horizonUrl, passphrase, nativeAssetCode);
    }

    public bool SupportCapture => false;
    public bool SupportPartiallyRefund => false;
    public bool SupportRefund => false;
    public bool SupportVoid => false;
    public RecurringPaymentType RecurringPaymentType => RecurringPaymentType.NotSupported;
    public PaymentMethodType PaymentMethodType => PaymentMethodType.Redirection;
    public bool SkipPaymentInfo => false;

    public Task<ProcessPaymentResult> ProcessPaymentAsync(ProcessPaymentRequest processPaymentRequest)
    {
        return Task.FromResult(new ProcessPaymentResult
        {
            NewPaymentStatus = PaymentStatus.Pending
        });
    }

    public async Task PostProcessPaymentAsync(PostProcessPaymentRequest postProcessPaymentRequest)
    {
        var order = postProcessPaymentRequest.Order;
        if (string.IsNullOrWhiteSpace(_settings.CheckoutBaseUrl) || string.IsNullOrWhiteSpace(_settings.Destination))
            throw new InvalidOperationException("Lumapa Stellar Pay is not configured.");

        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(Math.Max(1, _settings.ExpiresMinutes)).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");
        var orderId = order.CustomOrderNumber ?? order.Id.ToString();
        var network = GetNetworkPayload();
        var request = _httpContextAccessor.HttpContext?.Request;
        var shopBaseUrl = request is null ? string.Empty : $"{request.Scheme}://{request.Host}";
        var callbackUrl = string.IsNullOrWhiteSpace(shopBaseUrl)
            ? null
            : $"{shopBaseUrl}/Plugins/LumapaStellarPay/Callback?orderId={order.Id}";
        var returnUrl = string.IsNullOrWhiteSpace(shopBaseUrl)
            ? null
            : $"{shopBaseUrl}/Plugins/LumapaStellarPay/Return?orderId={order.Id}";

        var sessionRequest = new LumapamentSessionRequest(
            _settings.MerchantId,
            orderId,
            network.Network,
            network.NetworkName,
            network.HorizonUrl,
            network.NetworkPassphrase,
            network.NativeAssetCode,
            _settings.Destination,
            order.OrderTotal.ToString("0.#######", System.Globalization.CultureInfo.InvariantCulture),
            string.IsNullOrWhiteSpace(_settings.AssetCode) ? "XLM" : _settings.AssetCode.Trim().ToUpperInvariant(),
            string.IsNullOrWhiteSpace(_settings.Issuer) ? null : _settings.Issuer.Trim(),
            orderId.Length > 28 ? orderId[..28] : orderId,
            expiresAt,
            callbackUrl,
            returnUrl
        );

        var session = await _lumaPayClient.CreateSessionAsync(_settings.CheckoutBaseUrl, sessionRequest);
        order.AuthorizationTransactionId = session.Id;
        order.AuthorizationTransactionCode = session.StellarUri;
        await _orderService.UpdateOrderAsync(order);

        await _orderService.InsertOrderNoteAsync(new OrderNote
        {
            OrderId = order.Id,
            Note = $"Lumapa Stellar Pay session: {session.Id}; URI: {session.StellarUri}",
            DisplayToCustomer = false,
            CreatedOnUtc = DateTime.UtcNow
        });

        var redirectUrl = $"{_settings.CheckoutBaseUrl.TrimEnd('/')}/pay/{Uri.EscapeDataString(session.Id)}";
        _httpContextAccessor.HttpContext?.Response.Redirect(redirectUrl);
    }

    public Task<bool> HidePaymentMethodAsync(IList<ShoppingCartItem> cart)
    {
        return Task.FromResult(string.IsNullOrWhiteSpace(_settings.CheckoutBaseUrl) || string.IsNullOrWhiteSpace(_settings.Destination));
    }

    public Task<decimal> GetAdditionalHandlingFeeAsync(IList<ShoppingCartItem> cart) => Task.FromResult(0m);

    public Task<CapturePaymentResult> CaptureAsync(CapturePaymentRequest capturePaymentRequest) =>
        Task.FromResult(new CapturePaymentResult { Errors = new[] { "Capture is not supported by Lumapa Stellar Pay." } });

    public Task<RefundPaymentResult> RefundAsync(RefundPaymentRequest refundPaymentRequest) =>
        Task.FromResult(new RefundPaymentResult { Errors = new[] { "Refunds must be performed manually on Stellar." } });

    public Task<VoidPaymentResult> VoidAsync(VoidPaymentRequest voidPaymentRequest) =>
        Task.FromResult(new VoidPaymentResult { Errors = new[] { "Void is not supported by Lumapa Stellar Pay." } });

    public Task<ProcessPaymentResult> ProcessRecurringPaymentAsync(ProcessPaymentRequest processPaymentRequest) =>
        Task.FromResult(new ProcessPaymentResult { Errors = new[] { "Recurring payments are not supported by Lumapa Stellar Pay." } });

    public Task<CancelRecurringPaymentResult> CancelRecurringPaymentAsync(CancelRecurringPaymentRequest cancelPaymentRequest) =>
        Task.FromResult(new CancelRecurringPaymentResult { Errors = new[] { "Recurring payments are not supported by Lumapa Stellar Pay." } });

    public Task<bool> CanRePostProcessPaymentAsync(Order order) => Task.FromResult(true);

    public Task<IList<string>> ValidatePaymentFormAsync(IFormCollection form) => Task.FromResult<IList<string>>(new List<string>());

    public Task<ProcessPaymentRequest> GetPaymentInfoAsync(IFormCollection form) => Task.FromResult(new ProcessPaymentRequest());

    public Type GetPublicViewComponent() => typeof(PaymentInfoViewComponent);

    public Task<string> GetPaymentMethodDescriptionAsync() => Task.FromResult(_settings.DescriptionText);

    public override string GetConfigurationPageUrl()
    {
        return "/Admin/LumapaStellarPay/Configure";
    }

    public override async Task InstallAsync()
    {
        await _settingService.SaveSettingAsync(new LumapaStellarPaySettings());
        await _localizationService.AddOrUpdateLocaleResourceAsync(new Dictionary<string, string>
        {
            ["Plugins.Payments.LumapaStellarPay.Fields.CheckoutBaseUrl"] = "Lumapa checkout URL",
            ["Plugins.Payments.LumapaStellarPay.Fields.MerchantId"] = "Merchant ID",
            ["Plugins.Payments.LumapaStellarPay.Fields.NetworkType"] = "Network",
            ["Plugins.Payments.LumapaStellarPay.Fields.CustomNetworkId"] = "Custom network ID",
            ["Plugins.Payments.LumapaStellarPay.Fields.CustomNetworkName"] = "Custom network display name",
            ["Plugins.Payments.LumapaStellarPay.Fields.CustomHorizonUrl"] = "Custom Horizon URL",
            ["Plugins.Payments.LumapaStellarPay.Fields.CustomNetworkPassphrase"] = "Custom network passphrase",
            ["Plugins.Payments.LumapaStellarPay.Fields.CustomNativeAssetCode"] = "Custom native asset code",
            ["Plugins.Payments.LumapaStellarPay.Fields.Destination"] = "Destination Stellar address",
            ["Plugins.Payments.LumapaStellarPay.Fields.AssetCode"] = "Asset code",
            ["Plugins.Payments.LumapaStellarPay.Fields.Issuer"] = "Asset issuer",
            ["Plugins.Payments.LumapaStellarPay.Fields.ExpiresMinutes"] = "Payment expiry minutes",
            ["Plugins.Payments.LumapaStellarPay.Fields.DescriptionText"] = "Checkout description"
        });
        await base.InstallAsync();
    }

    public override async Task UninstallAsync()
    {
        await _settingService.DeleteSettingAsync<LumapaStellarPaySettings>();
        await _localizationService.DeleteLocaleResourcesAsync("Plugins.Payments.LumapaStellarPay");
        await base.UninstallAsync();
    }
}
