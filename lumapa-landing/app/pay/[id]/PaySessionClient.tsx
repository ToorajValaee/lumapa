'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PaymentSession, NetworkProfile } from '@/lib/types';
import { DEFAULT_NETWORKS } from '@/lib/networks';

function networkForSession(session: PaymentSession): NetworkProfile {
  const found = DEFAULT_NETWORKS.find(
    (network) => network.id === session.network || network.name === session.network || network.networkPassphrase === session.networkPassphrase,
  );
  if (found && !session.networkName && !session.horizonUrl && !session.nativeAssetCode) return found;
  return {
    id: session.network || found?.id || 'custom',
    name: session.networkName || found?.name || session.network || 'Custom Stellar network',
    horizonUrl: session.horizonUrl || found?.horizonUrl || process.env.NEXT_PUBLIC_LUMAPA_HORIZON_URL || 'https://horizon.badje.ir',
    networkPassphrase:
      session.networkPassphrase ||
      found?.networkPassphrase ||
      process.env.NEXT_PUBLIC_LUMAPA_NETWORK_PASSPHRASE ||
      'Lumapa Network ; July 2026',
    nativeAssetSymbol: session.nativeAssetCode || found?.nativeAssetSymbol || process.env.NEXT_PUBLIC_LUMAPA_NATIVE_SYMBOL || 'BADJ',
    nativeAssetDisplayName: session.nativeAssetCode || found?.nativeAssetDisplayName || process.env.NEXT_PUBLIC_LUMAPA_NATIVE_NAME || 'Custom native asset',
    isCustom: !found || Boolean(session.networkName || session.horizonUrl || session.nativeAssetCode),
  };
}

export default function PaySessionClient({ session: initialSession }: { session: PaymentSession }) {
  const [session, setSession] = useState(initialSession);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
  const walletUrl = process.env.NEXT_PUBLIC_LUMAPA_WALLET_URL || 'https://app.lumapa.ir';
  const checkoutBaseUrl = process.env.NEXT_PUBLIC_LUMAPA_BASE_URL || 'https://lumapa.ir';
  const paymentPageUrl = `${checkoutBaseUrl.replace(/\/$/, '')}/pay/${encodeURIComponent(session.id)}`;
  const lumapaConnectUrl = `${walletUrl.replace(/\/$/, '')}/connect?uri=${encodeURIComponent(session.stellarUri)}`;
  const network = useMemo(() => networkForSession(session), [session]);
  const isPayable = session.status === 'pending';

  async function copyUri() {
    await navigator.clipboard.writeText(session.stellarUri);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function checkStatus() {
    setChecking(true);
    try {
      const res = await fetch(`/api/payment-sessions/${encodeURIComponent(session.id)}/verify`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (res.ok) {
        const next = await res.json();
        setSession(next);
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (session.status !== 'pending') return;
    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.status]);

  useEffect(() => {
    if (session.status !== 'paid' || !session.returnUrl) return;
    setRedirectSeconds(4);
    const tick = window.setInterval(() => {
      setRedirectSeconds((current) => {
        if (current === null) return null;
        if (current <= 1) {
          window.clearInterval(tick);
          window.location.assign(session.returnUrl as string);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [session.status, session.returnUrl]);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <section className="spatial-card w-full max-w-md rounded-[1.5rem] p-5 text-center">
        <div className="mx-auto mb-4 inline-flex rounded-full border border-white/10 bg-white/[.03] px-3 py-1 text-[10px] uppercase tracking-[.18em] text-white/45">
          Powered by badje.ir
        </div>
        <h1 className="text-xl font-semibold">Lumapa Checkout</h1>
        <p className="mt-2 text-sm text-white/55">Order {session.orderId}</p>

        {session.status === 'paid' ? (
          <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-left text-sm text-emerald-50">
            <strong className="block text-base">Payment confirmed</strong>
            <p className="mt-1 text-emerald-100/80">This order has already been paid. Do not pay it again.</p>
            {session.transactionHash ? (
              <div className="mt-3 break-all font-mono text-xs text-emerald-100/70">Tx: {session.transactionHash}</div>
            ) : null}
            {session.returnUrl ? (
              <div className="mt-4">
                <a href={session.returnUrl} className="app-button primary w-full">
                  Return to shop
                </a>
                {redirectSeconds !== null ? (
                  <p className="mt-2 text-center text-xs text-emerald-100/70">Returning to shop in {redirectSeconds}…</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : session.status === 'expired' ? (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-left text-sm text-amber-50">
            <strong className="block text-base">Payment session expired</strong>
            <p className="mt-1 text-amber-100/80">Return to the shop and create a new checkout session.</p>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-left text-sm">
          <div className="flex justify-between gap-3"><span className="text-white/45">Amount</span><strong>{session.amount} {session.assetCode}</strong></div>
          <div className="mt-2 flex justify-between gap-3"><span className="text-white/45">Network</span><strong>{network.name}</strong></div>
          <div className="mt-2 flex justify-between gap-3"><span className="text-white/45">Status</span><strong>{checking && session.status === 'pending' ? 'checking…' : session.status}</strong></div>
          <div className="mt-2 break-all text-xs text-white/45">Destination: {session.destination}</div>
          <div className="mt-1 break-all text-xs text-white/45">Memo: {session.memo || session.orderId}</div>
          {session.statusMessage ? <div className="mt-2 text-xs text-white/45">{session.statusMessage}</div> : null}
        </div>

        {isPayable ? (
          <>
            <p className="mt-4 text-sm font-medium text-white/80">Scan with Lumapa Wallet</p>
            <p className="mt-1 text-xs leading-5 text-white/45">This QR uses a short payment-session link so mobile wallet cameras can read it reliably.</p>
            <div className="mx-auto mt-3 w-fit rounded-2xl bg-white p-3 text-black">
              <QRCodeSVG value={paymentPageUrl} size={250} includeMargin />
            </div>

            <a href={lumapaConnectUrl} className="app-button primary mt-4 w-full">
              Open in Lumapa Wallet
            </a>
            <button type="button" onClick={copyUri} className="app-button mt-3 w-full">
              {copied ? 'Copied' : 'Copy standard Stellar request'}
            </button>
            <a href={session.stellarUri} className="mt-3 block text-center text-xs text-white/45 underline-offset-4 hover:text-white hover:underline">
              Use another Stellar wallet
            </a>
          </>
        ) : null}

        <button type="button" onClick={checkStatus} className="app-button mt-3 w-full" disabled={checking}>
          {checking ? 'Checking…' : 'Check payment status'}
        </button>

        <p className="mt-3 text-xs leading-5 text-white/45">
          Lumapa verifies the order by checking Horizon for the destination, amount, asset, and memo. Once paid, this page prevents duplicate payment.
        </p>
        <details className="mt-4 text-left text-xs text-white/45">
          <summary>Technical payment details</summary>
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 text-white/55">Short QR URL</div>
              <pre className="safe-scroll max-h-24 overflow-auto rounded-xl bg-black/25 p-3 whitespace-pre-wrap break-all">{paymentPageUrl}</pre>
            </div>
            <div>
              <div className="mb-1 text-white/55">Standard Stellar request URI</div>
              <pre className="safe-scroll max-h-36 overflow-auto rounded-xl bg-black/25 p-3 whitespace-pre-wrap break-all">{session.stellarUri}</pre>
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}
