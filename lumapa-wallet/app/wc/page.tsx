"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

function LegacyConnectRedirectInner() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <main className="app-shell grid min-h-screen place-items-center px-4 text-center text-white">
      <div className="spatial-card max-w-sm p-5">
        <h1 className="text-base font-semibold">Opening Lumapa…</h1>
        <p className="mt-2 text-sm text-white/55">Use Lumapa Connect with a standard web+stellar request.</p>
      </div>
    </main>
  );
}

export default function LegacyConnectRedirectPage() {
  return (
    <Suspense fallback={<main className="app-shell grid min-h-screen place-items-center px-4 text-center text-white"><div className="spatial-card max-w-sm p-5">Opening Lumapa…</div></main>}>
      <LegacyConnectRedirectInner />
    </Suspense>
  );
}
