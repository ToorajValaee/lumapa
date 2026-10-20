"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ConnectRedirectInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const uri = params.get("uri") ?? "";
    if (uri) {
      window.localStorage.setItem("lumapa-stellar-pending-uri", uri);
    }
    router.replace("/");
  }, [params, router]);

  return (
    <main className="app-shell grid min-h-screen place-items-center px-4 text-center text-white">
      <div className="spatial-card max-w-sm p-5">
        <h1 className="text-base font-semibold">Opening Lumapa…</h1>
        <p className="mt-2 text-sm text-white/55">Review the Stellar request before approving.</p>
      </div>
    </main>
  );
}

export default function ConnectRedirectPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell grid min-h-screen place-items-center px-4 text-center text-white">
          <div className="spatial-card max-w-sm p-5">Opening Lumapa…</div>
        </main>
      }
    >
      <ConnectRedirectInner />
    </Suspense>
  );
}
