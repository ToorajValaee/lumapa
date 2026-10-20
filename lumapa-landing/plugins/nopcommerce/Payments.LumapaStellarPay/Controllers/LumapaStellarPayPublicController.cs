using Microsoft.AspNetCore.Mvc;
using Nop.Core.Domain.Payments;
using Nop.Plugin.Payments.LumapaStellarPay.Services;
using Nop.Services.Orders;
using Nop.Web.Framework.Controllers;

namespace Nop.Plugin.Payments.LumapaStellarPay.Controllers;

public class LumapaStellarPayPublicController : BasePluginController
{
    private readonly IOrderProcessingService _orderProcessingService;
    private readonly IOrderService _orderService;
    private readonly LumapaClient _lumapaClient;
    private readonly LumapaStellarPaySettings _settings;

    public LumapaStellarPayPublicController(
        IOrderProcessingService orderProcessingService,
        IOrderService orderService,
        LumapaClient lumapaClient,
        LumapaStellarPaySettings settings)
    {
        _orderProcessingService = orderProcessingService;
        _orderService = orderService;
        _lumapaClient = lumapaClient;
        _settings = settings;
    }

    private async Task<bool> MarkOrderPaidAsync(Nop.Core.Domain.Orders.Order order, string? sessionId, string? transactionHash)
    {
        if (!string.IsNullOrWhiteSpace(transactionHash))
            order.CaptureTransactionId = transactionHash;

        if (!string.IsNullOrWhiteSpace(sessionId))
            order.AuthorizationTransactionId = sessionId;

        await _orderService.UpdateOrderAsync(order);

        if (order.PaymentStatus != PaymentStatus.Paid)
            await _orderProcessingService.MarkOrderAsPaidAsync(order);

        await _orderService.InsertOrderNoteAsync(new Nop.Core.Domain.Orders.OrderNote
        {
            OrderId = order.Id,
            Note = $"Lumapa Stellar payment verified. Session: {sessionId}; transaction: {transactionHash}",
            DisplayToCustomer = false,
            CreatedOnUtc = DateTime.UtcNow
        });

        return true;
    }

    private async Task<bool> VerifyAndMarkOrderPaidAsync(Nop.Core.Domain.Orders.Order order)
    {
        if (order.PaymentStatus == PaymentStatus.Paid)
            return true;

        var sessionId = order.AuthorizationTransactionId;
        if (string.IsNullOrWhiteSpace(sessionId))
            return false;

        var status = await _lumapaClient.VerifySessionAsync(_settings.CheckoutBaseUrl, sessionId);
        if (status?.Status?.Equals("paid", StringComparison.OrdinalIgnoreCase) == true)
            return await MarkOrderPaidAsync(order, status.Id ?? sessionId, status.TransactionHash);

        await _orderService.InsertOrderNoteAsync(new Nop.Core.Domain.Orders.OrderNote
        {
            OrderId = order.Id,
            Note = $"Lumapa payment status check: {status?.Status ?? "unknown"}. {status?.StatusMessage}",
            DisplayToCustomer = false,
            CreatedOnUtc = DateTime.UtcNow
        });
        return false;
    }

    [HttpGet]
    [IgnoreAntiforgeryToken]
    [Route("Plugins/LumapaStellarPay/Return")]
    public async Task<IActionResult> Return(int orderId)
    {
        var order = await _orderService.GetOrderByIdAsync(orderId);
        if (order is not null)
            await VerifyAndMarkOrderPaidAsync(order);

        return Redirect(order is null ? "/" : $"/orderdetails/{order.Id}");
    }

    [HttpPost]
    [IgnoreAntiforgeryToken]
    [Route("Plugins/LumapaStellarPay/Callback")]
    public async Task<IActionResult> Callback(int orderId, [FromBody] LumapaCallbackPayload payload)
    {
        if (orderId <= 0 || payload is null || !string.Equals(payload.Status, "paid", StringComparison.OrdinalIgnoreCase))
            return Accepted(new { ok = false, message = "Ignored callback." });

        var order = await _orderService.GetOrderByIdAsync(orderId);
        if (order is null)
            return NotFound(new { ok = false, message = "Order not found." });

        if (!string.IsNullOrWhiteSpace(order.AuthorizationTransactionId) &&
            !string.IsNullOrWhiteSpace(payload.SessionId) &&
            !string.Equals(order.AuthorizationTransactionId, payload.SessionId, StringComparison.Ordinal))
            return BadRequest(new { ok = false, message = "Payment session does not match this order." });

        await MarkOrderPaidAsync(order, payload.SessionId, payload.TransactionHash);

        return Ok(new { ok = true });
    }
}

public class LumapaCallbackPayload
{
    public string? SessionId { get; set; }
    public string? MerchantId { get; set; }
    public string? OrderId { get; set; }
    public string? Status { get; set; }
    public string? TransactionHash { get; set; }
    public string? PaidAt { get; set; }
    public string? Payer { get; set; }
    public string? ReturnUrl { get; set; }
}
