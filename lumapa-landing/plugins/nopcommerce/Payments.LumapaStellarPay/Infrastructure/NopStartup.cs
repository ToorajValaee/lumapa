using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nop.Core.Infrastructure;
using Nop.Plugin.Payments.LumapaStellarPay.Services;

namespace Nop.Plugin.Payments.LumapaStellarPay.Infrastructure;

public class NopStartup : INopStartup
{
    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddHttpClient<LumapaClient>();
    }

    public void Configure(IApplicationBuilder application)
    {
    }

    public int Order => 3000;
}
