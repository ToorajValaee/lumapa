import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Code2,
  Download,
  ExternalLink,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Wallet,
} from 'lucide-react';

const githubUrl = process.env.NEXT_PUBLIC_GITHUB_REPO_URL || '#';
const walletUrl = process.env.NEXT_PUBLIC_LUMAPA_WALLET_URL || 'https://app.lumapa.ir';
const shopUrl = process.env.NEXT_PUBLIC_LUMAPA_SHOP_URL || 'https://shop.lumapa.ir';

function externalHref(href: string) {
  return href && href !== '#' ? href : undefined;
}

export default function LandingPage() {
  const githubHref = externalHref(githubUrl);
  const openWalletHref = externalHref(walletUrl) || "https://app.lumapa.ir";

  return (
    <main className="min-h-screen bg-[#fafafa] text-neutral-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="Lumapa home">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-neutral-950 text-white">
            <Wallet size={18} />
          </span>
          <span className="text-base font-semibold tracking-tight">Lumapa</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm font-medium">
          <a href="#plugins" className="hidden rounded-full px-3 py-2 text-neutral-600 hover:text-neutral-950 sm:inline-flex">
            Plugins
          </a>
          <a href={openWalletHref} className="rounded-full bg-neutral-950 px-4 py-2 text-white">
            Open wallet
          </a>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-14 pt-8 sm:px-6 md:grid-cols-[1.05fr_.95fr] md:items-center md:pb-20 md:pt-16">
        <div>
          <p className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm font-medium text-neutral-600">
            Independent Stellar wallet and checkout connector
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-neutral-950 sm:text-6xl md:text-7xl">
            A Stellar wallet for shops and users.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
            Lumapa is a non-custodial wallet and standards-based payment layer for Stellar. Customers keep their keys, review every transaction, and pay through standard Stellar wallet requests.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={openWalletHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white">
              Open Lumapa App <ArrowRight size={16} />
            </a>
            <a href="#plugins" className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-semibold text-neutral-950">
              Download shop plugins <Download size={16} />
            </a>
          </div>
          <p className="mt-4 text-sm text-neutral-500">Wallet app: {walletUrl}</p>
          <p className="mt-1 text-sm text-neutral-500">Future shop: {shopUrl}</p>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="rounded-[1.5rem] border border-neutral-100 bg-neutral-950 p-4 text-white">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/60">Lumapa Wallet</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-950">SEP-7</span>
            </div>
            <div className="mt-12 rounded-3xl bg-white p-4 text-neutral-950">
              <p className="text-sm font-medium text-neutral-500">Payment request</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">125.00 USDC</p>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between border-t border-neutral-100 pt-3"><span className="text-neutral-500">Shop</span><strong>Example Store</strong></div>
                <div className="flex justify-between border-t border-neutral-100 pt-3"><span className="text-neutral-500">Network</span><strong>Stellar</strong></div>
                <div className="flex justify-between border-t border-neutral-100 pt-3"><span className="text-neutral-500">Method</span><strong>Wallet request</strong></div>
              </div>
              <button type="button" className="mt-6 w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white">
                Review and approve
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-neutral-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-8 sm:grid-cols-3 sm:px-6">
          <div className="rounded-3xl border border-neutral-200 p-5">
            <ShieldCheck size={22} />
            <h2 className="mt-4 text-lg font-semibold">Non-custodial</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Secrets stay on the user's device. Signing happens inside the wallet after local approval.</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 p-5">
            <QrCode size={22} />
            <h2 className="mt-4 text-lg font-semibold">Standards-first</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Shop payments use Stellar SEP-7 requests, so compatible wallets can open the same payment flow.</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 p-5">
            <BadgeCheck size={22} />
            <h2 className="mt-4 text-lg font-semibold">Merchant ready</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Hosted checkout, payment sessions, order memo support, and plugin source for shop platforms.</p>
          </div>
        </div>
      </section>

      <section id="plugins" className="mx-auto max-w-6xl px-5 py-14 sm:px-6 md:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">For shops</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Accept Stellar payments without a proprietary wallet lock-in.</h2>
          <p className="mt-4 text-neutral-600 leading-7">
            The included plugins create standard Stellar payment requests. Customers can open them with Lumapa or another compatible Stellar wallet.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-neutral-200 bg-white p-5">
            <ShoppingBag size={22} />
            <h3 className="mt-4 text-lg font-semibold">WooCommerce</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Install the WordPress plugin and configure your merchant destination, asset, and checkout URL.</p>
            <a href="/downloads/woocommerce-lumapa-stellar-pay.zip" className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white">
              Download plugin <Download size={15} />
            </a>
          </article>

          <article className="rounded-3xl border border-neutral-200 bg-white p-5">
            <ShoppingBag size={22} />
            <h3 className="mt-4 text-lg font-semibold">nopCommerce</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Use the nopCommerce payment plugin source as a starting point for your shop deployment.</p>
            <a href="/downloads/nopcommerce-lumapa-stellar-pay.zip" className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white">
              Download plugin <Download size={15} />
            </a>
          </article>

          <article className="rounded-3xl border border-neutral-200 bg-white p-5">
            <Code2 size={22} />
            <h3 className="mt-4 text-lg font-semibold">Source code</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Publish the wallet and plugins on GitHub so developers can inspect and integrate them.</p>
            {githubHref ? (
              <a href={githubHref} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-950">
                View GitHub <ExternalLink size={15} />
              </a>
            ) : (
              <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-400">
                Add GitHub URL in env
              </span>
            )}
          </article>
        </div>
      </section>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Lumapa. Built for Stellar payments.</p>
          <p>Powered by <a href="https://badje.ir" className="font-medium text-neutral-700">badje.ir</a></p>
        </div>
      </footer>
    </main>
  );
}
