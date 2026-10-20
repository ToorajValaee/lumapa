using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Nop.Plugin.Payments.LumapaStellarPay.Services;

public class LumapaClient
{
    private readonly HttpClient _httpClient;

    public LumapaClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<LumapamentSessionResponse> CreateSessionAsync(string checkoutBaseUrl, LumapamentSessionRequest request)
    {
        var baseUrl = checkoutBaseUrl.TrimEnd('/');
        var response = await _httpClient.PostAsJsonAsync($"{baseUrl}/api/payment-sessions", request);
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Lumapa Pay API failed: {(int)response.StatusCode} {text}");

        var result = await response.Content.ReadFromJsonAsync<LumapamentSessionResponse>();
        return result ?? throw new InvalidOperationException("Lumapa Pay API returned an empty response.");
    }

    public async Task<LumapaSessionStatusResponse?> VerifySessionAsync(string checkoutBaseUrl, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(checkoutBaseUrl) || string.IsNullOrWhiteSpace(sessionId))
            return null;

        var baseUrl = checkoutBaseUrl.TrimEnd('/');
        var response = await _httpClient.PostAsync($"{baseUrl}/api/payment-sessions/{Uri.EscapeDataString(sessionId)}/verify", null);
        if (!response.IsSuccessStatusCode)
            return null;

        return await response.Content.ReadFromJsonAsync<LumapaSessionStatusResponse>();
    }
}


public record LumapamentSessionRequest(
    [property: JsonPropertyName("merchantId")] string MerchantId,
    [property: JsonPropertyName("orderId")] string OrderId,
    [property: JsonPropertyName("network")] string Network,
    [property: JsonPropertyName("networkName")] string? NetworkName,
    [property: JsonPropertyName("horizonUrl")] string? HorizonUrl,
    [property: JsonPropertyName("networkPassphrase")] string? NetworkPassphrase,
    [property: JsonPropertyName("nativeAssetCode")] string? NativeAssetCode,
    [property: JsonPropertyName("destination")] string Destination,
    [property: JsonPropertyName("amount")] string Amount,
    [property: JsonPropertyName("assetCode")] string AssetCode,
    [property: JsonPropertyName("issuer")] string? Issuer,
    [property: JsonPropertyName("memo")] string Memo,
    [property: JsonPropertyName("expiresAt")] string ExpiresAt,
    [property: JsonPropertyName("callbackUrl")] string? CallbackUrl,
    [property: JsonPropertyName("returnUrl")] string? ReturnUrl
);

public record LumapamentSessionResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("stellarUri")] string StellarUri,
    [property: JsonPropertyName("status")] string Status
);

public record LumapaSessionStatusResponse(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("transactionHash")] string? TransactionHash,
    [property: JsonPropertyName("paidAt")] string? PaidAt,
    [property: JsonPropertyName("payer")] string? Payer,
    [property: JsonPropertyName("statusMessage")] string? StatusMessage
);
