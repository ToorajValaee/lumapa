using Microsoft.AspNetCore.Mvc;
using Nop.Web.Framework.Components;

namespace Nop.Plugin.Payments.LumapaStellarPay.Components;

public class PaymentInfoViewComponent : NopViewComponent
{
    public IViewComponentResult Invoke()
    {
        return Content("After you confirm the order, Lumapa will show the order-specific QR code and wallet-open button. You can pay with Lumapa or any SEP-7 compatible Stellar wallet.");
    }
}
