"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  ClipboardEvent,
  Dispatch,
  SetStateAction,
  ReactNode,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Layers3,
  ListChecks,
  Lock,
  Network,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  UserPlus,
  WalletCards,
  Settings,
  PlugZap,
  Check,
  Link2,
  XCircle,
} from "lucide-react";
import {
  addOrReplaceAccount,
  createDefaultState,
  loadState,
  saveState,
  shortKey,
} from "@/lib/store";
import type {
  AssetBalance,
  NetworkProfile,
  StoredAccount,
  TxHistoryItem,
  VaultState,
} from "@/lib/types";
import {
  addSigner,
  buildUnsignedPaymentXdr,
  changeTrust,
  fetchBalances,
  fetchHistory,
  fundWithFriendbot,
  inspectXdr,
  manageData,
  sendPayment,
  setHomeDomain,
  signXdr,
  submitSignedXdr,
} from "@/lib/stellar";
import { decryptText, encryptText } from "@/lib/vaultCrypto";
import {
  deriveStellarKeypair,
  generateMnemonic,
  isValidMnemonic,
  keypairFromSecret,
  pickMnemonicChallenge,
} from "@/lib/walletKeys";
import {
  LUMAPA_NETWORK_ID,
  FUTURENET_CUSTOM_PRESET,
  loadNetworkFromHorizon,
  loadNetworkFromRpc,
} from "@/lib/networks";
import {
  isWebAuthnSupported,
  registerLocalPasskey,
  verifyLocalPasskey,
} from "@/lib/webauthn";

const TABS = ["Home", "Send", "Receive", "Assets", "More"] as const;
type Tab = (typeof TABS)[number];

type Notice = { type: "ok" | "error" | "info"; text: string };


type Html5QrCodeInstance = {
  start: (
    cameraConfig: { facingMode: string } | { deviceId: { exact: string } },
    configuration: {
      fps?: number;
      qrbox?:
        | number
        | { width: number; height: number }
        | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number });
      aspectRatio?: number;
    },
    qrCodeSuccessCallback: (decodedText: string) => void | Promise<void>,
    qrCodeErrorCallback?: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
};

type Html5QrCamera = { id: string; label: string };
type Html5QrCodeConstructor = {
  new (elementId: string, verbose?: boolean): Html5QrCodeInstance;
  getCameras?: () => Promise<Html5QrCamera[]>;
};

declare global {
  interface Window {
    Html5Qrcode?: Html5QrCodeConstructor;
  }
}

let html5QrCodeLoader: Promise<Html5QrCodeConstructor> | undefined;

function loadHtml5QrCode(): Promise<Html5QrCodeConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("QR scanning is only available in the browser."));
  }
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if (html5QrCodeLoader) return html5QrCodeLoader;

  html5QrCodeLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-lumapa-scanner="html5-qrcode"]',
    );
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Html5Qrcode) resolve(window.Html5Qrcode);
        else reject(new Error("QR scanner loaded but did not initialize."));
      });
      existing.addEventListener("error", () => reject(new Error("Could not load the QR scanner library.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.async = true;
    script.defer = true;
    script.dataset.lumapaScanner = "html5-qrcode";
    script.onload = () => {
      if (window.Html5Qrcode) resolve(window.Html5Qrcode);
      else reject(new Error("QR scanner loaded but did not initialize."));
    };
    script.onerror = () => reject(new Error("Could not load the QR scanner library. Check the internet connection or bundle the scanner locally."));
    document.head.appendChild(script);
  });

  return html5QrCodeLoader;
}

function makeScannerBox(width: number, height: number) {
  const size = Math.max(220, Math.floor(Math.min(width, height) * 0.82));
  return { width: size, height: size };
}

async function preferredCameraConfig(Html5Qrcode: Html5QrCodeConstructor) {
  const cameras = Html5Qrcode.getCameras ? await Html5Qrcode.getCameras().catch(() => []) : [];
  const backCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
  if (backCamera?.id) return { deviceId: { exact: backCamera.id } };
  return { facingMode: "environment" };
}

function scannerNeedsSecureContext() {
  return (
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  );
}


type Sep7Request =
  | {
      kind: "tx";
      raw: string;
      xdr: string;
      callback?: string;
      pubkey?: string;
      msg?: string;
      networkPassphrase?: string;
      originDomain?: string;
      sessionId?: string;
      paymentSessionUrl?: string;
      verifyUrl?: string;
      returnUrl?: string;
      hasSignature: boolean;
    }
  | {
      kind: "pay";
      raw: string;
      destination: string;
      amount: string;
      assetCode?: string;
      issuer?: string;
      memo?: string;
      msg?: string;
      networkPassphrase?: string;
      originDomain?: string;
      sessionId?: string;
      paymentSessionUrl?: string;
      verifyUrl?: string;
      returnUrl?: string;
      hasSignature: boolean;
    };

function normalizeStellarUri(rawInput: string) {
  let raw = rawInput.trim();
  if (!raw) throw new Error("Paste or scan a Stellar wallet request first.");
  if (raw.startsWith("web%2Bstellar") || raw.startsWith("web%2bstellar")) {
    raw = decodeURIComponent(raw);
  }
  return raw;
}

function parseSep7Request(rawInput: string): Sep7Request {
  const raw = normalizeStellarUri(rawInput);
  const url = new URL(raw);
  if (url.protocol !== "web+stellar:" && url.protocol !== "stellar:") {
    throw new Error("This is not a Stellar wallet request.");
  }
  const operation = url.pathname;
  const params = url.searchParams;
  const common = {
    raw,
    msg: params.get("msg") ?? undefined,
    networkPassphrase: params.get("network_passphrase") ?? undefined,
    originDomain: params.get("origin_domain") ?? undefined,
    sessionId: params.get("session_id") ?? undefined,
    paymentSessionUrl: params.get("payment_session_url") ?? undefined,
    verifyUrl: params.get("verify_url") ?? undefined,
    returnUrl: params.get("return_url") ?? undefined,
    hasSignature: Boolean(params.get("signature")),
  };
  if (operation === "tx") {
    const xdrEnvelope = params.get("xdr") ?? "";
    if (!xdrEnvelope) throw new Error("The Stellar tx request is missing XDR.");
    return {
      kind: "tx",
      ...common,
      xdr: xdrEnvelope,
      callback: params.get("callback") ?? undefined,
      pubkey: params.get("pubkey") ?? undefined,
    };
  }
  if (operation === "pay") {
    const destination = params.get("destination") ?? "";
    if (!destination) throw new Error("The Stellar pay request is missing destination.");
    return {
      kind: "pay",
      ...common,
      destination,
      amount: params.get("amount") ?? "",
      assetCode: params.get("asset_code") ?? undefined,
      issuer: params.get("asset_issuer") ?? undefined,
      memo: params.get("memo") ?? undefined,
    };
  }
  throw new Error(`Unsupported Stellar request: ${operation}`);
}

function networkForSep7Request(request: Sep7Request, networks: NetworkProfile[]) {
  if (request.networkPassphrase) {
    return networks.find(
      (network) => network.networkPassphrase === request.networkPassphrase,
    );
  }
  return networks.find((network) => network.id === "public") ?? networks[0];
}

function callbackUrl(rawCallback?: string) {
  if (!rawCallback) return undefined;
  if (rawCallback.startsWith("url:")) return rawCallback.slice(4);
  return undefined;
}

async function sendSep7Callback(rawCallback: string, signedXdr: string) {
  const url = callbackUrl(rawCallback);
  if (!url) throw new Error("Only SEP-7 url: callbacks are supported.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ xdr: signedXdr }),
  });
  if (!res.ok) throw new Error(`Callback failed: ${res.status}`);
}

function paidStorageKey(info?: { sessionId?: string; orderId?: string; source?: string }) {
  if (!info?.sessionId && !info?.orderId && !info?.source) return undefined;
  return `lumapa-paid-${info.sessionId || info.orderId || info.source}`;
}

function rememberPaid(info: { sessionId?: string; orderId?: string; source?: string }, transactionHash: string) {
  const key = paidStorageKey(info);
  if (key && typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify({ transactionHash, paidAt: new Date().toISOString() }));
  }
}

function getRememberedPayment(info?: { sessionId?: string; orderId?: string; source?: string }) {
  const key = paidStorageKey(info);
  if (!key || typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as { transactionHash?: string; paidAt?: string };
  } catch {
    return { transactionHash: raw };
  }
}

async function verifyPaymentRequest(verifyUrl?: string) {
  if (!verifyUrl) return undefined;
  const res = await fetch(verifyUrl, { method: "POST", cache: "no-store" });
  if (!res.ok) throw new Error(`Payment status check failed: ${res.status}`);
  return res.json() as Promise<{ status?: string; transactionHash?: string; statusMessage?: string }>;
}

async function waitForVerifiedPayment(verifyUrl: string, attempts = 10, delayMs = 2500) {
  let lastStatus: { status?: string; transactionHash?: string; statusMessage?: string } | undefined;
  for (let index = 0; index < attempts; index += 1) {
    lastStatus = await verifyPaymentRequest(verifyUrl).catch(() => undefined);
    if (lastStatus?.status === "paid") return lastStatus;
    if (lastStatus?.status === "expired" || lastStatus?.status === "failed") return lastStatus;
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  return lastStatus;
}


type AppSetState = Dispatch<SetStateAction<VaultState>>;

function useWalletState() {
  const [state, setState] = useState<VaultState>(createDefaultState());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) saveState(state);
  }, [state, ready]);
  return [state, setState, ready] as const;
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
  readOnly?: boolean;
}) {
  const base = "input-control";
  return (
    <label className="block space-y-2">
      <span className="field-label">{props.label}</span>
      {props.textarea ? (
        <textarea
          className={`${base} min-h-28 resize-y`}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          placeholder={props.placeholder}
          readOnly={props.readOnly}
        />
      ) : (
        <input
          className={base}
          value={props.value}
          type={props.type ?? "text"}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          placeholder={props.placeholder}
          readOnly={props.readOnly}
        />
      )}
    </label>
  );
}

function Button({
  strong,
  className,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { strong?: boolean }) {
  return (
    <button
      {...buttonProps}
      className={`app-button ${strong ? "primary" : ""} ${className ?? ""}`}
    />
  );
}

function NoticeBox({ notice }: { notice?: Notice }) {
  if (!notice) return null;
  const color =
    notice.type === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
      : notice.type === "ok"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
        : "border-sky-400/30 bg-sky-500/10 text-sky-100";
  return <div className={`notice-box ${color}`}>{notice.text}</div>;
}

function getIconForTab(item: Tab) {
  if (item === "Home") return <Layers3 size={18} />;
  if (item === "Send") return <Send size={18} />;
  if (item === "Receive") return <QrCode size={18} />;
  if (item === "Assets") return <Network size={18} />;
  if (item === "More") return <Settings size={18} />;
  return <KeyRound size={18} />;
}

function AppHeader(_: {
  activeNetwork?: NetworkProfile;
  accountCount: number;
  showNetworkBadge?: boolean;
}) {
  return (
    <header className="app-header mb-4 flex min-w-0 items-center justify-between md:mb-6">
      <h1 className="text-base font-semibold tracking-tight md:text-xl">
        Lumapa
      </h1>
    </header>
  );
}

export default function Page() {
  const [state, setState] = useWalletState();
  const [tab, setTab] = useState<Tab>("Home");
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [history, setHistory] = useState<TxHistoryItem[]>([]);
  const [connectInitialUri, setConnectInitialUri] = useState("");

  const activeNetwork = useMemo(
    () =>
      state.networks.find((n) => n.id === state.activeNetworkId) ??
      state.networks[0],
    [state],
  );
  const activeAccount = useMemo(
    () =>
      state.accounts.find((a) => a.id === state.activeAccountId) ??
      state.accounts.find((a) => a.networkId === activeNetwork?.id),
    [state, activeNetwork],
  );

  const vaultPasscode = useMemo(() => {
    if (passcode.length >= 8) return passcode;
    if (
      state.webAuthnEnabled &&
      state.webAuthnCredentialId &&
      state.deviceVaultKey
    )
      return state.deviceVaultKey;
    return "";
  }, [
    passcode,
    state.webAuthnEnabled,
    state.webAuthnCredentialId,
    state.deviceVaultKey,
  ]);

  async function guardApproval() {
    if (state.webAuthnEnabled && state.webAuthnCredentialId)
      await verifyLocalPasskey(state.webAuthnCredentialId);
  }

  async function loadAccountData() {
    if (!activeNetwork || !activeAccount) return;
    setBusy(true);
    try {
      const [bals, hist] = await Promise.all([
        fetchBalances(activeNetwork, activeAccount.publicKey),
        fetchHistory(activeNetwork, activeAccount.publicKey).catch(() => []),
      ]);
      setBalances(bals);
      setHistory(hist);
      setNotice({ type: "ok", text: "Account data refreshed." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not refresh account data.",
      });
    } finally {
      setBusy(false);
    }
  }

  function selectAccount(accountId: string) {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) return;
    setState((current) => ({
      ...current,
      activeAccountId: account.id,
      activeNetworkId: account.networkId,
    }));
  }

  useEffect(() => {
    setNotice(undefined);
  }, [tab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = window.localStorage.getItem("lumapa-stellar-pending-uri") || window.localStorage.getItem("lumapa-stellar-pending-uri");
    if (pending) {
      window.localStorage.removeItem("lumapa-stellar-pending-uri");
      window.localStorage.removeItem("lumapa-stellar-pending-uri");
      setConnectInitialUri(pending);
      setTab("More");
      setNotice({
        type: "info",
        text: "External Stellar request opened. Review it before signing.",
      });
    }
  }, []);

  useEffect(() => {
    setBalances([]);
    setHistory([]);
  }, [activeAccount?.id, activeNetwork?.id]);

  if (state.accounts.length === 0) {
    return (
      <main className="app-shell min-h-screen px-4 py-4 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[430px] md:max-w-5xl">
          <AppHeader
            activeNetwork={activeNetwork}
            accountCount={0}
            showNetworkBadge={false}
          />
          <NoticeBox notice={notice} />
          <div className="mt-5">
            <OnboardingFlow
              state={state}
              setState={setState}
              passcode={passcode}
              setPasscode={setPasscode}
              setNotice={setNotice}
              title="Set up your wallet"
            />
          </div>
          <footer className="pb-6 pt-8 text-center text-[11px] text-white/35">
            Powered by badje.ir
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell min-h-screen px-4 py-4 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[430px] md:max-w-6xl">
        <AppHeader
          activeNetwork={activeNetwork}
          accountCount={state.accounts.length}
        />
        <div className="grid min-w-0 gap-5 lg:grid-cols-[220px_1fr]">
          <aside className="hidden md:block">
            <nav className="spatial-card nav-panel p-1">
              {TABS.map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={`nav-item ${tab === item ? "active" : ""}`}
                >
                  {getIconForTab(item)}
                  {item}
                </button>
              ))}
            </nav>
          </aside>

          <section className="min-w-0 space-y-5">
            <NoticeBox notice={notice} />
            {tab === "Home" && (
              <HomePanel
                state={state}
                setState={setState}
                activeNetwork={activeNetwork}
                activeAccount={activeAccount}
                balances={balances}
                history={history}
                busy={busy}
                loadAccountData={loadAccountData}
                selectAccount={selectAccount}
              />
            )}
            {tab === "Send" && (
              <SendPanel
                activeNetwork={activeNetwork}
                activeAccount={activeAccount}
                balances={balances}
                passcode={vaultPasscode}
                setNotice={setNotice}
                setBusy={setBusy}
                guardApproval={guardApproval}
                loadAccountData={loadAccountData}
              />
            )}
            {tab === "Receive" && (
              <ReceivePanel
                activeNetwork={activeNetwork}
                activeAccount={activeAccount}
                balances={balances}
              />
            )}
            {tab === "Assets" && (
              <AssetsPanel
                activeNetwork={activeNetwork}
                activeAccount={activeAccount}
                balances={balances}
                passcode={vaultPasscode}
                setNotice={setNotice}
                setBusy={setBusy}
                guardApproval={guardApproval}
                loadAccountData={loadAccountData}
              />
            )}
            {tab === "More" && (
              <MorePanel
                state={state}
                setState={setState}
                passcode={vaultPasscode}
                rawPasscode={passcode}
                setPasscode={setPasscode}
                setNotice={setNotice}
                guardApproval={guardApproval}
                selectAccount={selectAccount}
                activeNetwork={activeNetwork}
                activeAccount={activeAccount}
                setBusy={setBusy}
                connectInitialUri={connectInitialUri}
                onConnectInitialUriConsumed={() => setConnectInitialUri("")}
              />
            )}
          </section>
        </div>
        <nav
          className="native-tabbar md:hidden"
          aria-label="Main wallet navigation"
        >
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={tab === item ? "active" : ""}
            >
              {getIconForTab(item)}
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <footer className="pb-24 pt-8 text-center text-[11px] text-white/35 md:pb-6">
          Powered by badje.ir
        </footer>
      </div>
    </main>
  );
}

function NetworkCard({
  network,
  selected,
  onClick,
  accountCount,
  compact = false,
}: {
  network: NetworkProfile;
  selected: boolean;
  onClick: () => void;
  accountCount?: number;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`network-tile ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
    >
      <span className="network-dot">
        {network.nativeAssetSymbol.slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {network.name}
        </span>
        <span className="mt-0.5 block text-xs text-white/45">
          {accountCount ?? 0} account{accountCount === 1 ? "" : "s"}
        </span>
      </span>
      {selected ? (
        <CheckCircle2 className="shrink-0 text-white" size={17} />
      ) : null}
    </button>
  );
}

function WizardStepFrame({
  heading,
  description,
  children,
  footer,
  hideBack,
  onBack,
  currentStepIndex,
  totalSteps,
}: {
  heading: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  hideBack?: boolean;
  onBack: () => void;
  currentStepIndex: number;
  totalSteps: number;
}) {
  return (
    <section className="mobile-wizard spatial-card mx-auto flex w-full flex-col p-4 md:p-5">
      <div className="wizard-head">
        {!hideBack ? (
          <button
            type="button"
            onClick={onBack}
            className="icon-button"
            aria-label="Go back"
          >
            ←
          </button>
        ) : (
          <span className="icon-spacer" />
        )}
        <div className="min-w-0 flex-1 text-center">
          <div className="step-label">
            {currentStepIndex} / {totalSteps}
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">
            {heading}
          </h2>
        </div>
        <span className="icon-spacer" />
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${Math.max(12, Math.min(100, (currentStepIndex / totalSteps) * 100))}%`,
          }}
        />
      </div>
      <p className="mt-4 text-center text-sm leading-6 text-white/55">
        {description}
      </p>
      <div className="wizard-step-body safe-scroll flex-1 overflow-y-auto py-4">
        {children}
      </div>
      <div className="wizard-footer grid gap-2 pt-2">{footer}</div>
    </section>
  );
}

function MnemonicWordsInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const initialWords = value.trim() ? value.trim().split(/\s+/) : [];
  const [wordCount, setWordCountState] = useState<12 | 24>(
    initialWords.length > 12 ? 24 : 12,
  );
  const [words, setWords] = useState<string[]>(() =>
    Array.from({ length: initialWords.length > 12 ? 24 : 12 }, (_, index) =>
      initialWords[index] ?? "",
    ),
  );

  function emit(nextWords: string[]) {
    onChange(nextWords.map((word) => word.trim().toLowerCase()).filter(Boolean).join(" "));
  }

  function setWordCount(nextCount: 12 | 24) {
    setWordCountState(nextCount);
    const nextWords = Array.from({ length: nextCount }, (_, index) => words[index] ?? "");
    setWords(nextWords);
    emit(nextWords);
  }

  function updateWord(index: number, nextValue: string) {
    const normalized = nextValue.replace(/\s+/g, "").toLowerCase();
    const nextWords = [...words];
    nextWords[index] = normalized;
    setWords(nextWords);
    emit(nextWords);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text").trim().toLowerCase();
    const pastedWords = text.split(/\s+/).filter(Boolean);
    if (pastedWords.length >= 12) {
      event.preventDefault();
      const nextCount = pastedWords.length > 12 ? 24 : 12;
      const nextWords = Array.from(
        { length: nextCount },
        (_, index) => pastedWords[index] ?? "",
      );
      setWordCountState(nextCount);
      setWords(nextWords);
      emit(nextWords);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => setWordCount(12)}
          className={wordCount === 12 ? "bg-white text-black" : ""}
        >
          12 words
        </Button>
        <Button
          type="button"
          onClick={() => setWordCount(24)}
          className={wordCount === 24 ? "bg-white text-black" : ""}
        >
          24 words
        </Button>
      </div>
      <div className="mnemonic-input-grid grid grid-cols-3 gap-2">
        {words.map((word, index) => (
          <label key={index} className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/30">
              {index + 1}
            </span>
            <input
              value={word}
              onPaste={handlePaste}
              onChange={(event) => updateWord(index, event.currentTarget.value)}
              placeholder={`word ${index + 1}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-8 pr-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/30"
            />
          </label>
        ))}
      </div>
      <p className="text-xs leading-5 text-white/45">
        Paste all words into any box, or fill each word separately.
      </p>
    </div>
  );
}

function OnboardingFlow(props: {
  state: VaultState;
  setState: AppSetState;
  passcode: string;
  setPasscode: (v: string) => void;
  setNotice: (n: Notice) => void;
  title?: string;
}) {
  type WizardStep =
    | "network"
    | "custom"
    | "method"
    | "backup"
    | "verify"
    | "recoverChoice"
    | "recoverMnemonic"
    | "recoverAccounts"
    | "recoverSecret";
  type RecoverType = "mnemonic" | "secret";

  const [step, setStep] = useState<WizardStep>("network");
  const [selectedNetworkId, setSelectedNetworkId] = useState(
    props.state.activeNetworkId || LUMAPA_NETWORK_ID,
  );
  const [method, setMethod] = useState<"create" | "recover">("create");
  const [recoverType, setRecoverType] = useState<RecoverType>("mnemonic");
  const [mnemonic, setMnemonic] = useState("");
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("Main account");
  const [challenge, setChallenge] = useState<
    Array<{ index: number; word: string }>
  >([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [customName, setCustomName] = useState("Custom Stellar Network");
  const [horizonUrl, setHorizonUrl] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [nativeSymbol, setNativeSymbol] = useState("XLM");
  const [customKeyAlgorithm, setCustomKeyAlgorithm] = useState<"ed25519" | "secp256k1">("ed25519");
  const [creating, setCreating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [derivedAccounts, setDerivedAccounts] = useState<Array<{ index: number; publicKey: string; funded: boolean; selected: boolean }>>([]);
  const [discoveryError, setDiscoveryError] = useState("");
  const [scanCursor, setScanCursor] = useState(0);
  const [scanLimit, setScanLimit] = useState(100);
  const [lastScanGap, setLastScanGap] = useState(0);
  const [showUnfunded, setShowUnfunded] = useState(false);

  const selectedNetwork =
    props.state.networks.find((network) => network.id === selectedNetworkId) ??
    props.state.networks[0];
  const canCreate = selectedNetwork?.id === LUMAPA_NETWORK_ID;
  const currentStepIndex = getStepIndex(step);
  const totalSteps = getTotalSteps();

  useEffect(() => {
    if (!canCreate && method === "create") setMethod("recover");
  }, [canCreate, method]);

  function getTotalSteps() {
    if (step === "custom") return 2;
    if (!canCreate) return 3;
    if (method === "create") return 4;
    return 4;
  }

  function getStepIndex(activeStep: WizardStep) {
    if (activeStep === "network") return 1;
    if (activeStep === "custom") return 2;
    if (activeStep === "method") return 2;
    if (activeStep === "backup") return 3;
    if (activeStep === "verify") return 4;
    if (activeStep === "recoverChoice") return canCreate ? 3 : 2;
    if (activeStep === "recoverMnemonic" || activeStep === "recoverAccounts" || activeStep === "recoverSecret")
      return canCreate ? 4 : 3;
    return 1;
  }

  function goBack() {
    if (step === "network") return;
    if (step === "custom") return setStep("network");
    if (step === "method") return setStep("network");
    if (step === "backup") return setStep("method");
    if (step === "verify") return setStep("backup");
    if (step === "recoverChoice")
      return setStep(canCreate ? "method" : "network");
    if (step === "recoverAccounts") return setStep("recoverMnemonic");
    if (step === "recoverMnemonic" || step === "recoverSecret")
      return setStep("recoverChoice");
  }

  function chooseNetwork(networkId: string) {
    setSelectedNetworkId(networkId);
    props.setState((current) => ({
      ...current,
      activeNetworkId: networkId,
      activeAccountId: undefined,
    }));
    const nextNetworkIsBadje = networkId === LUMAPA_NETWORK_ID;
    setMethod(nextNetworkIsBadje ? "create" : "recover");
    setRecoverType("mnemonic");
    setMnemonic("");
    setSecret("");
    setChallenge([]);
    setAnswers({});
    setConfirmed(false);
  }

  function continueFromNetwork() {
    if (!selectedNetwork)
      return props.setNotice({
        type: "error",
        text: "Choose a network first.",
      });
    setStep(canCreate ? "method" : "recoverChoice");
  }

  function continueFromMethod() {
    if (method === "create") {
      if (!mnemonic) generateForBadje();
      return setStep("backup");
    }
    return setStep("recoverChoice");
  }

  function continueFromBackup() {
    if (!mnemonic)
      return props.setNotice({
        type: "error",
        text: "Generate a mnemonic first.",
      });
    if (!confirmed)
      return props.setNotice({
        type: "error",
        text: "Confirm that you saved the mnemonic safely.",
      });
    setStep("verify");
  }

  function continueFromRecoverChoice() {
    setStep(recoverType === "mnemonic" ? "recoverMnemonic" : "recoverSecret");
  }

  async function autoDetectCustomNetwork() {
    try {
      if (!rpcUrl && !horizonUrl)
        throw new Error(
          "Enter Horizon URL or RPC URL first. Horizon-only networks are supported.",
        );
      const loaded = rpcUrl
        ? await loadNetworkFromRpc(rpcUrl)
        : await loadNetworkFromHorizon(horizonUrl);
      setPassphrase(loaded.networkPassphrase ?? "");
      props.setNotice({
        type: "ok",
        text: rpcUrl
          ? "Passphrase loaded from RPC getNetwork."
          : "Passphrase loaded from Horizon root.",
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not detect passphrase.",
      });
    }
  }

  function addCustomNetwork() {
    if (customKeyAlgorithm === "secp256k1") return props.setNotice({ type: "error", text: "This fork needs its account encoding and signing adapter. Please choose Ed25519 until native secp256k1 support is verified." });
    if (!horizonUrl || !passphrase)
      return props.setNotice({
        type: "error",
        text: "Horizon URL and network passphrase are required.",
      });
    const network: NetworkProfile = {
      id: `custom-${crypto.randomUUID()}`,
      name: customName || "Custom Stellar Network",
      horizonUrl,
      rpcUrl: rpcUrl || undefined,
      networkPassphrase: passphrase,
      nativeAssetSymbol: nativeSymbol || "XLM",
      nativeAssetDisplayName: `${nativeSymbol || "XLM"} native`,
      isCustom: true,
      accountKeyAlgorithm: customKeyAlgorithm,
    };
    props.setState((current) => ({
      ...current,
      networks: [...current.networks, network],
      activeNetworkId: network.id,
      activeAccountId: undefined,
    }));
    setSelectedNetworkId(network.id);
    setMethod("recover");
    setStep("recoverChoice");
    props.setNotice({
      type: "ok",
      text: "Custom network added. Recover an account on it now.",
    });
  }

  function useFuturenetPreset() {
    setCustomName(FUTURENET_CUSTOM_PRESET.name);
    setHorizonUrl(FUTURENET_CUSTOM_PRESET.horizonUrl);
    setRpcUrl(FUTURENET_CUSTOM_PRESET.rpcUrl ?? "");
    setPassphrase(FUTURENET_CUSTOM_PRESET.networkPassphrase);
    setNativeSymbol(FUTURENET_CUSTOM_PRESET.nativeAssetSymbol);
    setCustomKeyAlgorithm("ed25519");
    setStep("custom");
  }

  function generateForBadje() {
    if (!canCreate)
      return props.setNotice({
        type: "error",
        text: "New account creation is only enabled on Lumapa Network. Use recover for this network.",
      });
    const words = generateMnemonic(24);
    setMnemonic(words);
    setChallenge(pickMnemonicChallenge(words));
    setConfirmed(false);
    setAnswers({});
  }

  async function ensureVaultPasscode() {
    if (props.passcode && props.passcode.length >= 8) {
      if (props.state.webAuthnEnabled && props.state.webAuthnCredentialId)
        await verifyLocalPasskey(props.state.webAuthnCredentialId);
      return props.passcode;
    }
    if (!isWebAuthnSupported()) {
      throw new Error(
        "This browser/device does not support WebAuthn. Set a vault passcode in Security, then continue.",
      );
    }

    let credentialId = props.state.webAuthnCredentialId;
    let deviceVaultKey = props.state.deviceVaultKey;

    if (credentialId) {
      await verifyLocalPasskey(credentialId);
    } else {
      credentialId = await registerLocalPasskey("Lumapa user");
    }

    if (!deviceVaultKey) {
      deviceVaultKey = `${crypto.randomUUID()}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    }

    const finalCredentialId = credentialId;
    const finalDeviceVaultKey = deviceVaultKey;
    props.setState((current) => ({
      ...current,
      webAuthnEnabled: true,
      webAuthnCredentialId: finalCredentialId,
      deviceVaultKey: finalDeviceVaultKey,
      vaultMode: "webauthn-device-key",
    }));
    return finalDeviceVaultKey;
  }

  async function discoverMnemonicAccounts(continueFromLast = false) {
    if (!selectedNetwork) return;
    if (!isValidMnemonic(mnemonic)) {
      props.setNotice({ type: "error", text: "Enter a valid 12- or 24-word recovery phrase." });
      return;
    }
    if (selectedNetwork.accountKeyAlgorithm === "secp256k1") return props.setNotice({ type: "error", text: "This custom fork requires a dedicated secp256k1 account adapter. Ed25519 scanning cannot recover its addresses." });
    setDiscovering(true);
    setDiscoveryError("");
    const start = continueFromLast ? scanCursor : 0;
    const limit = Math.min(500, Math.max(1, scanLimit));
    const GAP_LIMIT = 5;
    try {
      const found = continueFromLast ? [...derivedAccounts] : [];
      let consecutiveUnused = 0;
      let nextIndex = start;
      while (nextIndex < start + limit && consecutiveUnused < GAP_LIMIT) {
        const index = nextIndex;
        const publicKey = deriveStellarKeypair(mnemonic, index).publicKey;
        const response = await fetch(`${selectedNetwork.horizonUrl.replace(/\/$/, "")}/accounts/${encodeURIComponent(publicKey)}`, { cache: "no-store" });
        if (response.status !== 404 && !response.ok) throw new Error(`Horizon error ${response.status} at account index ${index}. Verify network/Horizon configuration.`);
        const funded = response.ok;
        found.push({ index, publicKey, funded, selected: funded });
        consecutiveUnused = funded ? 0 : consecutiveUnused + 1;
        nextIndex += 1;
      }
      setDerivedAccounts(found);
      setScanCursor(nextIndex);
      setLastScanGap(consecutiveUnused);
      setStep("recoverAccounts");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not discover accounts.";
      setDiscoveryError(message);
      props.setNotice({ type: "error", text: message });
    } finally { setDiscovering(false); }
  }

  async function saveRecoveredAccount() {
    if (!selectedNetwork) return;
    if (recoverType === "mnemonic") return discoverMnemonicAccounts();
    if (!secret.trim()) return props.setNotice({ type: "error", text: "Enter the secret seed." });
    setCreating(true);
    try {
      const vaultKey = await ensureVaultPasscode();
      const recovered = keypairFromSecret(secret);
      const account: StoredAccount = {
        id: crypto.randomUUID(),
        label: label || `Recovered ${props.state.accounts.length + 1}`,
        publicKey: recovered.publicKey,
        networkId: selectedNetwork.id,
        encryptedSecret: await encryptText(recovered.secret, vaultKey),
        importedBy: "secret",
        createdAt: new Date().toISOString(),
      };
      props.setState((current) => addOrReplaceAccount({ ...current, activeNetworkId: selectedNetwork.id }, account));
      setSecret("");
      props.setNotice({ type: "ok", text: "Account recovered and encrypted locally." });
    } catch (error) {
      props.setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not recover account." });
    } finally { setCreating(false); }
  }

  async function importSelectedDerivedAccounts() {
    if (!selectedNetwork || !isValidMnemonic(mnemonic)) return;
    if (selectedNetwork.accountKeyAlgorithm === "secp256k1") return props.setNotice({ type: "error", text: "Legacy secp256k1 account import is not yet supported for this fork." });
    const selected = derivedAccounts.filter((item) => item.selected);
    if (!selected.length) return props.setNotice({ type: "error", text: "Select at least one derived account." });
    setCreating(true);
    try {
      const vaultKey = await ensureVaultPasscode();
      const encryptedMnemonic = await encryptText(mnemonic.trim().toLowerCase(), vaultKey);
      const accounts: StoredAccount[] = [];
      for (const item of selected) {
        const derived = deriveStellarKeypair(mnemonic, item.index);
        accounts.push({
          id: crypto.randomUUID(),
          label: selected.length === 1 ? label || `Account ${item.index + 1}` : `${label || "Recovered"} ${item.index + 1}`,
          publicKey: derived.publicKey,
          networkId: selectedNetwork.id,
          derivationPath: derived.derivationPath,
          encryptedSecret: await encryptText(derived.secret, vaultKey),
          encryptedMnemonic,
          importedBy: "mnemonic",
          createdAt: new Date().toISOString(),
        });
      }
      props.setState((current) => {
        let next = { ...current, activeNetworkId: selectedNetwork.id };
        for (const account of accounts) next = addOrReplaceAccount(next, account);
        return next;
      });
      setMnemonic("");
      setDerivedAccounts([]);
      props.setNotice({ type: "ok", text: `${accounts.length} account(s) recovered and encrypted locally.` });
    } catch (error) {
      props.setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not import accounts." });
    } finally { setCreating(false); }
  }

  async function createBadjeAccount() {
    if (!selectedNetwork || selectedNetwork.id !== LUMAPA_NETWORK_ID)
      return props.setNotice({
        type: "error",
        text: "Create is only available on Lumapa Network.",
      });
    if (!isValidMnemonic(mnemonic))
      return props.setNotice({
        type: "error",
        text: "Generate a valid mnemonic first.",
      });
    const ok = challenge.every(
      (item) =>
        answers[item.index]?.trim().toLowerCase() === item.word.toLowerCase(),
    );
    if (!ok || !confirmed)
      return props.setNotice({
        type: "error",
        text: "Answer all random mnemonic checks correctly.",
      });

    setCreating(true);
    try {
      const vaultKey = await ensureVaultPasscode();
      const derived = deriveStellarKeypair(mnemonic, 0);
      const response = await fetch("/api/lumapa/create-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: derived.publicKey }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Lumapa account funding failed.");
      const account: StoredAccount = {
        id: crypto.randomUUID(),
        label: label || `Lumapa account ${props.state.accounts.length + 1}`,
        publicKey: derived.publicKey,
        networkId: selectedNetwork.id,
        derivationPath: derived.derivationPath,
        encryptedSecret: await encryptText(derived.secret, vaultKey),
        encryptedMnemonic: await encryptText(mnemonic, vaultKey),
        importedBy: "mnemonic",
        createdAt: new Date().toISOString(),
      };
      props.setState((current) =>
        addOrReplaceAccount(
          { ...current, activeNetworkId: selectedNetwork.id },
          account,
        ),
      );
      setMnemonic("");
      setChallenge([]);
      setAnswers({});
      props.setNotice({
        type: "ok",
        text: `Lumapa account created on-chain and encrypted locally. Tx: ${result.hash}`,
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not create Lumapa account.",
      });
    } finally {
      setCreating(false);
    }
  }



  if (step === "network") {
    return (
      <WizardStepFrame
        heading={props.title ?? "Choose network"}
        description="First choose where this account belongs. Lumapa can create and fund a new account; other Stellar networks recover existing accounts only."
        hideBack
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button type="button" onClick={continueFromNetwork} strong>
            Continue
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="network-row flex gap-3 overflow-x-auto pb-1">
            {props.state.networks.map((network) => (
              <NetworkCard
                key={network.id}
                network={network}
                selected={selectedNetworkId === network.id}
                onClick={() => chooseNetwork(network.id)}
                accountCount={
                  props.state.accounts.filter(
                    (account) => account.networkId === network.id,
                  ).length
                }
                compact
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" onClick={() => setStep("custom")}>
              <Plus size={16} /> Custom
            </Button>
            <Button type="button" onClick={useFuturenetPreset}>
              <Network size={16} /> Futurenet
            </Button>
          </div>
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "custom") {
    return (
      <WizardStepFrame
        heading="Custom network"
        description="Add a Horizon-only or RPC-enabled Stellar network. RPC is optional; Horizon URL and exact passphrase are required."
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button type="button" onClick={addCustomNetwork} strong>
            Add network and recover
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Name" value={customName} onChange={setCustomName} />
          <Field
            label="Horizon URL"
            value={horizonUrl}
            onChange={setHorizonUrl}
            placeholder="https://horizon.example.com"
          />
          <Field
            label="RPC URL optional"
            value={rpcUrl}
            onChange={setRpcUrl}
            placeholder="Leave empty for Horizon-only networks"
          />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field
              label="Native symbol"
              value={nativeSymbol}
              onChange={setNativeSymbol}
            />
            <div className="flex items-end">
              <Button type="button" onClick={autoDetectCustomNetwork}>
                Auto
              </Button>
            </div>
          </div>
          <label className="block space-y-2 text-sm">
            <span>Account signature type</span>
            <select className="w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-3" value={customKeyAlgorithm} onChange={(event) => setCustomKeyAlgorithm(event.currentTarget.value as "ed25519" | "secp256k1")}>
              <option value="ed25519">Standard Stellar (Ed25519)</option>
              <option value="secp256k1">Custom fork (secp256k1 — not yet supported)</option>
            </select>
          </label>
          {customKeyAlgorithm === "secp256k1" && <p role="alert" className="text-xs text-amber-300">This algorithm requires fork-specific address derivation, Horizon parsing and transaction signing. Lumapa will not create an unusable account. See docs/legacy-secp256k1.md.</p>}
          <Field
            label="Network passphrase"
            value={passphrase}
            onChange={setPassphrase}
            textarea
            placeholder="Exact Stellar network passphrase"
          />
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "method") {
    return (
      <WizardStepFrame
        heading="Create or recover"
        description="Lumapa Network supports creating a new funded account. You can also recover an existing account on Lumapa."
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button type="button" onClick={continueFromMethod} strong>
            Continue
          </Button>
        }
      >
        <div className="grid gap-3">
          <Field
            label="Account name"
            value={label}
            onChange={setLabel}
            placeholder="Main account"
          />
          <button
            type="button"
            onClick={() => setMethod("create")}
            className={`rounded-[1.6rem] border p-5 text-left ${method === "create" ? "border-emerald-300/50 bg-emerald-500/20" : "border-white/10 bg-white/5"}`}
          >
            <div className="flex items-center gap-3 font-black">
              <Plus size={18} /> Create new Lumapa account
            </div>
            <p className="mt-2 text-sm text-white/55">
              Generate mnemonic, verify backup, then fund it from your
              configured Lumapa starter account.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMethod("recover")}
            className={`rounded-[1.6rem] border p-5 text-left ${method === "recover" ? "border-indigo-300/50 bg-indigo-500/20" : "border-white/10 bg-white/5"}`}
          >
            <div className="flex items-center gap-3 font-black">
              <KeyRound size={18} /> Recover existing account
            </div>
            <p className="mt-2 text-sm text-white/55">
              Import by mnemonic or Stellar secret seed. Nothing is sent to the
              server.
            </p>
          </button>
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "backup") {
    return (
      <WizardStepFrame
        heading="Write backup words"
        description="Write these words offline and keep them private. The app will ask random words on the next step."
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button type="button" onClick={continueFromBackup} strong>
            I saved them
          </Button>
        }
      >
        <div className="space-y-3">
          {!mnemonic ? (
            <Button type="button" onClick={generateForBadje} strong>
              <Plus size={16} /> Generate mnemonic
            </Button>
          ) : null}
          {mnemonic ? (
            <>
              <div className="mnemonic-grid grid grid-cols-2 gap-2 text-sm">
                {mnemonic.split(" ").map((word, index) => (
                  <div
                    key={`${word}-${index}`}
                    className="rounded-xl bg-black/25 px-3 py-2"
                  >
                    <span className="text-white/35">{index + 1}.</span> {word}
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) =>
                    setConfirmed(event.currentTarget.checked)
                  }
                />
                I wrote the mnemonic in a safe place.
              </label>
            </>
          ) : null}
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "verify") {
    return (
      <WizardStepFrame
        heading="Verify backup"
        description="Enter the requested words. This protects users from creating an account without saving the recovery phrase."
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button
            type="button"
            onClick={createBadjeAccount}
            strong
            disabled={creating}
          >
            {creating ? <RefreshCw size={16} /> : <Lock size={16} />} Create
            account
          </Button>
        }
      >
        <div className="space-y-3">
          {challenge.map((item) => (
            <Field
              key={item.index}
              label={`Word ${item.index + 1}`}
              value={answers[item.index] ?? ""}
              onChange={(value) =>
                setAnswers((current) => ({ ...current, [item.index]: value }))
              }
            />
          ))}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
            After verification, the server will create this account on Lumapa
            Network using your configured starter source account.
          </div>
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "recoverChoice") {
    return (
      <WizardStepFrame
        heading="Recover account"
        description={`Recover an account on ${selectedNetwork?.name}. This app stores it encrypted only on this device.`}
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button type="button" onClick={continueFromRecoverChoice} strong>
            Continue
          </Button>
        }
      >
        <div className="space-y-3">
          <Field
            label="Account name"
            value={label}
            onChange={setLabel}
            placeholder="Recovered account"
          />
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
            Security:{" "}
            {props.state.webAuthnEnabled
              ? "biometric/passkey approval"
              : props.passcode.length >= 8
                ? "manual vault passcode"
                : isWebAuthnSupported()
                  ? "biometric/passkey approval"
                  : "passcode required on this browser"}
            .
          </div>
          <button
            type="button"
            onClick={() => setRecoverType("mnemonic")}
            className={`w-full rounded-[1.6rem] border p-5 text-left ${recoverType === "mnemonic" ? "border-indigo-300/50 bg-indigo-500/20" : "border-white/10 bg-white/5"}`}
          >
            <div className="font-black">Recover by mnemonic</div>
            <p className="mt-2 text-sm text-white/55">
              Use 12 or 24 recovery words. The app finds the common Stellar
              account index automatically.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setRecoverType("secret")}
            className={`w-full rounded-[1.6rem] border p-5 text-left ${recoverType === "secret" ? "border-indigo-300/50 bg-indigo-500/20" : "border-white/10 bg-white/5"}`}
          >
            <div className="font-black">Recover by secret seed</div>
            <p className="mt-2 text-sm text-white/55">
              Use a Stellar secret seed that starts with S.
            </p>
          </button>
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "recoverAccounts") {
    const found = derivedAccounts.filter((account) => account.funded);
    const visible = showUnfunded ? derivedAccounts : found;
    return (
      <WizardStepFrame heading="Choose accounts"
        description={`Found ${found.length} funded account(s) on ${selectedNetwork?.name}. Scanned indexes 0–${Math.max(0, scanCursor - 1)}. Recovery uses standard Stellar SEP-5 derivation.`}
        onBack={goBack} currentStepIndex={currentStepIndex} totalSteps={totalSteps}
        footer={<Button type="button" onClick={importSelectedDerivedAccounts} disabled={creating || !derivedAccounts.some((account) => account.selected)} strong>{creating ? "Importing…" : `Import ${derivedAccounts.filter((account) => account.selected).length} account(s)`}</Button>}>
        <div className="space-y-3">
          {found.length === 0 && <p className="text-sm text-white/65">No funded accounts were found in the scanned range. Check that you selected the correct network and that the mnemonic belongs to a SEP-5 wallet. You can inspect an unfunded address or scan further.</p>}
          {visible.map((account) => (
            <label key={account.index} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
              <input type="checkbox" checked={account.selected} onChange={(event) => {
                const selected = event.currentTarget.checked;
                setDerivedAccounts((current) => current.map((item) => item.index === account.index ? { ...item, selected } : item));
              }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Account {account.index + 1} · {account.funded ? "Funded" : "Not funded"}</span>
                <span className="block truncate font-mono text-xs text-white/50">{account.publicKey}</span>
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showUnfunded} onChange={(event) => setShowUnfunded(event.currentTarget.checked)} />
            Show unfunded addresses
          </label>
          <label className="block text-sm">Maximum indexes per scan
            <select className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2" value={scanLimit}
              onChange={(event) => setScanLimit(Number(event.currentTarget.value))}>
              <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option>
            </select>
          </label>
          <Button type="button" onClick={() => discoverMnemonicAccounts(true)} disabled={discovering}>
            {discovering ? "Scanning…" : `Scan next indexes from ${scanCursor}`}
          </Button>
          <p className="text-xs text-white/50">{lastScanGap >= 5 ? "Stopped after 5 consecutive unused indexes. Later indexes may still contain accounts; scan further if needed." : "Reached the configured scan limit."} No private keys are sent to Horizon.</p>
        </div>
      </WizardStepFrame>
    );
  }

  if (step === "recoverMnemonic") {
    return (
      <WizardStepFrame
        heading="Enter mnemonic"
        description="Enter the recovery words. The app checks common Stellar derivation indexes automatically and encrypts the recovered account locally."
        onBack={goBack}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        footer={
          <Button type="button" onClick={() => discoverMnemonicAccounts(false)} disabled={discovering} strong>
            <KeyRound size={16} /> {discovering ? "Searching accounts…" : "Find derived accounts"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Account name" value={label} onChange={setLabel} />
          <MnemonicWordsInput value={mnemonic} onChange={setMnemonic} />
        </div>
      </WizardStepFrame>
    );
  }

  return (
    <WizardStepFrame
      heading="Enter secret seed"
      description="Paste the Stellar secret seed. It is encrypted locally and never sent to the server."
      onBack={goBack}
      currentStepIndex={currentStepIndex}
      totalSteps={totalSteps}
      footer={
        <Button type="button" onClick={saveRecoveredAccount} strong>
          <KeyRound size={16} /> Recover account
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Account name" value={label} onChange={setLabel} />
        <Field
          label="Secret seed"
          value={secret}
          onChange={setSecret}
          type="password"
          placeholder="S..."
        />
      </div>
    </WizardStepFrame>
  );
}

function HomePanel(props: {
  state: VaultState;
  setState: AppSetState;
  activeNetwork?: NetworkProfile;
  activeAccount?: StoredAccount;
  balances: AssetBalance[];
  history: TxHistoryItem[];
  busy: boolean;
  loadAccountData: () => Promise<void>;
  selectAccount: (accountId: string) => void;
}) {
  async function friendbot() {
    if (!props.activeNetwork || !props.activeAccount) return;
    try {
      await fundWithFriendbot(
        props.activeNetwork,
        props.activeAccount.publicKey,
      );
      props.setState((current) => ({ ...current }));
    } catch {
      // Friendbot is only a convenience for test-like networks.
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-hidden">
      <section className="spatial-card w-full min-w-0 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="screen-title">Home</h2>
          <Button
            onClick={props.loadAccountData}
            disabled={!props.activeAccount || props.busy}
            className="min-h-10 px-3 py-2 text-xs"
          >
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="field-label">Account</span>
          <select
            className="input-control font-medium"
            value={props.activeAccount?.id ?? ""}
            onChange={(event) => props.selectAccount(event.currentTarget.value)}
          >
            {props.state.accounts.map((account) => {
              const network = props.state.networks.find(
                (item) => item.id === account.networkId,
              );
              return (
                <option key={account.id} value={account.id}>
                  {account.label} · {network?.name ?? account.networkId}
                </option>
              );
            })}
          </select>
        </label>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.03] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-white/45">
                {props.activeNetwork?.name ?? "No network"}
              </div>
              <div className="mt-1 truncate font-mono text-xs text-white/75">
                {props.activeAccount?.publicKey ?? "No active account"}
              </div>
            </div>
            <Button
              onClick={() =>
                navigator.clipboard.writeText(
                  props.activeAccount?.publicKey ?? "",
                )
              }
              disabled={!props.activeAccount}
              className="h-9 min-h-9 shrink-0 rounded-xl px-3 py-1 text-xs"
            >
              <Copy size={13} />
              Copy
            </Button>
          </div>
          {props.activeNetwork?.friendbotUrl && props.activeAccount ? (
            <Button onClick={friendbot} className="mt-3 w-full text-xs">
              Fund test account
            </Button>
          ) : null}
        </div>
      </section>

      <section className="spatial-card w-full min-w-0 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="screen-title">Balances</h2>
          <span className="text-xs text-white/40">{props.balances.length}</span>
        </div>
        <div className="mt-3 divide-y divide-white/10">
          {props.balances.length === 0 ? (
            <p className="py-4 text-sm text-white/50">
              Refresh to load balances after the account exists on-chain.
            </p>
          ) : (
            props.balances.map((balance) => (
              <div
                className="flex items-center justify-between gap-3 py-3"
                key={`${balance.code}-${balance.issuer ?? "native"}`}
              >
                <div className="min-w-0">
                  <div className="font-semibold">{balance.code}</div>
                  <div className="truncate text-xs text-white/45">
                    {balance.isNative
                      ? props.activeNetwork?.nativeAssetDisplayName
                      : balance.issuer}
                  </div>
                </div>
                <div className="max-w-[50%] truncate text-right font-mono text-sm">
                  {balance.balance}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="spatial-card w-full min-w-0 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="screen-title">History</h2>
          <ListChecks className="text-white/30" size={18} />
        </div>
        <div className="mt-3 divide-y divide-white/10">
          {props.history.length === 0 ? (
            <p className="py-4 text-sm text-white/50">No history loaded.</p>
          ) : (
            props.history.map((item) => (
              <div key={item.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm font-semibold">{item.type}</strong>
                  <span className="shrink-0 text-xs text-white/40">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 text-sm text-white/65">
                  {item.amount ?? ""} {item.asset}
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-white/35">
                  {item.transactionHash}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SendPanel(props: {
  activeNetwork?: NetworkProfile;
  activeAccount?: StoredAccount;
  balances: AssetBalance[];
  passcode: string;
  setNotice: (n: Notice) => void;
  setBusy: (b: boolean) => void;
  guardApproval: () => Promise<void>;
  loadAccountData: () => Promise<void>;
}) {
  const scannerRef = useRef<Html5QrCodeInstance | null>(null);
  const [scannerElementId] = useState(() => `lumapa-pay-scanner-${Math.random().toString(36).slice(2)}`);
  const [scanning, setScanning] = useState(false);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState(
    props.activeNetwork?.nativeAssetSymbol ?? "XLM",
  );
  const [issuer, setIssuer] = useState("");
  const [memo, setMemo] = useState("");
  const [merchantInfo, setMerchantInfo] = useState<{
    orderId?: string;
    merchantId?: string;
    sessionId?: string;
    paymentSessionUrl?: string;
    verifyUrl?: string;
    returnUrl?: string;
    source?: string;
    paid?: boolean;
    submitted?: boolean;
    transactionHash?: string;
    statusMessage?: string;
  }>();
  const [sendPhase, setSendPhase] = useState<"idle" | "checking" | "approving" | "submitting" | "verifying" | "confirmed">("idle");

  const isSending = sendPhase !== "idle" && sendPhase !== "confirmed";

  const assetValue = `${assetCode}:${issuer}`;
  const issuedBalances = props.balances.filter((balance) => !balance.isNative);
  const hasSelectedIssuedAsset =
    issuer &&
    issuedBalances.some(
      (balance) => balance.code === assetCode && balance.issuer === issuer,
    );

  useEffect(() => {
    setAssetCode(props.activeNetwork?.nativeAssetSymbol ?? "XLM");
    setIssuer("");
  }, [props.activeNetwork?.id, props.activeNetwork?.nativeAssetSymbol]);

  useEffect(() => () => stopScanner(), []);

  function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      void scanner
        .stop()
        .catch(() => undefined)
        .then(() => scanner.clear().catch(() => undefined));
    }
    setScanning(false);
  }

  async function refreshMerchantPaymentStatus(info = merchantInfo) {
    if (!info?.verifyUrl) return undefined;
    setSendPhase((current) => current === "idle" ? "checking" : current);
    try {
      const status = await verifyPaymentRequest(info.verifyUrl);
      if (status?.status === "paid") {
        const transactionHash = status.transactionHash || info.transactionHash;
        setMerchantInfo((current) => current ? { ...current, paid: true, submitted: true, transactionHash, statusMessage: status.statusMessage } : current);
        setSendPhase("confirmed");
        if (transactionHash) rememberPaid(info, transactionHash);
      } else {
        setMerchantInfo((current) => current ? { ...current, statusMessage: status?.statusMessage || current.statusMessage } : current);
        setSendPhase((current) => current === "checking" ? "idle" : current);
      }
      return status;
    } catch {
      setSendPhase((current) => current === "checking" ? "idle" : current);
      return undefined;
    }
  }

  function applyPaymentRequest(request: ParsedPaymentRequest) {
    if (request.networkPassphrase && props.activeNetwork?.networkPassphrase !== request.networkPassphrase) {
      props.setNotice({
        type: "error",
        text: `This payment is for ${request.networkName || request.network || "another Stellar network"}. Choose or recover an account on that network before paying.`,
      });
      return;
    }
    if (
      !request.networkPassphrase &&
      request.network &&
      props.activeNetwork &&
      request.network !== props.activeNetwork.id &&
      request.network !== props.activeNetwork.name
    ) {
      props.setNotice({
        type: "error",
        text: `This QR is for ${request.network}. Choose an account on that network before paying.`,
      });
      return;
    }
    setDestination(request.destination);
    setAmount(request.amount);
    setAssetCode(
      request.assetCode || props.activeNetwork?.nativeAssetSymbol || "XLM",
    );
    setIssuer(request.issuer ?? "");
    setMemo(request.memo ?? "");
    const info = {
      orderId: request.orderId,
      merchantId: request.merchantId,
      sessionId: request.sessionId,
      paymentSessionUrl: request.paymentSessionUrl,
      verifyUrl: request.verifyUrl,
      returnUrl: request.returnUrl,
      source: request.sourceText,
    };
    const remembered = getRememberedPayment(info);
    const alreadyPaid = Boolean(request.paid || request.transactionHash || remembered?.transactionHash);
    const transactionHash = request.transactionHash || remembered?.transactionHash;
    setMerchantInfo({
      ...info,
      paid: alreadyPaid,
      submitted: alreadyPaid,
      transactionHash,
    });
    setSendPhase(alreadyPaid ? "confirmed" : "idle");
    props.setNotice({
      type: alreadyPaid ? "info" : "ok",
      text: alreadyPaid
        ? "This order is already paid. Do not send it again."
        : "Payment QR loaded. Review before signing.",
    });
    if (!alreadyPaid && info.verifyUrl) void refreshMerchantPaymentStatus(info);
    stopScanner();
  }

  async function parsePaymentPayload(
    rawInput: string,
  ): Promise<ParsedPaymentRequest> {
    const raw = rawInput.trim();
    if (!raw) throw new Error("QR payload is empty.");

    try {
      const json = JSON.parse(raw);
      if (json.stellarUri) return parsePaymentPayload(String(json.stellarUri));
      if (json.destination && json.amount) {
        return {
          destination: String(json.destination),
          amount: String(json.amount),
          assetCode: String(
            json.assetCode ??
              json.asset_code ??
              props.activeNetwork?.nativeAssetSymbol ??
              "XLM",
          ),
          issuer: json.issuer || json.asset_issuer || undefined,
          memo: json.memo || json.orderId || json.order_id || undefined,
          network: json.network,
          networkPassphrase: json.networkPassphrase || json.network_passphrase || undefined,
          networkName: json.networkName || json.network_name || undefined,
          orderId: json.orderId || json.order_id,
          merchantId: json.merchantId || json.merchant_id,
          sessionId: json.sessionId || json.session_id,
          paymentSessionUrl: json.paymentSessionUrl || json.payment_session_url,
          verifyUrl: json.verifyUrl || json.verify_url,
          returnUrl: json.returnUrl || json.return_url,
          sourceText: raw,
        };
      }
    } catch {
      // Continue with URI parsing.
    }

    let url: URL | undefined;
    try {
      url = new URL(raw);
    } catch {
      url = undefined;
    }

    if (
      url &&
      (url.protocol === "web+stellar:" || url.protocol === "stellar:")
    ) {
      const params = url.searchParams;
      const destinationValue =
        params.get("destination") ?? params.get("to") ?? "";
      const amountValue = params.get("amount") ?? "";
      if (!destinationValue)
        throw new Error("The payment QR is missing destination.");
      return {
        destination: destinationValue,
        amount: amountValue,
        assetCode:
          params.get("asset_code") ??
          params.get("assetCode") ??
          props.activeNetwork?.nativeAssetSymbol ??
          "XLM",
        issuer: params.get("asset_issuer") ?? params.get("issuer") ?? undefined,
        memo: params.get("memo") ?? undefined,
        network: params.get("network") ?? undefined,
        networkPassphrase: params.get("network_passphrase") ?? undefined,
        networkName: params.get("network_name") ?? undefined,
        orderId:
          params.get("order_id") ??
          params.get("orderId") ??
          params.get("memo") ??
          undefined,
        merchantId:
          params.get("merchant_id") ?? params.get("merchantId") ?? undefined,
        sessionId: params.get("session_id") ?? undefined,
        paymentSessionUrl: params.get("payment_session_url") ?? undefined,
        verifyUrl: params.get("verify_url") ?? undefined,
        returnUrl: params.get("return_url") ?? undefined,
        sourceText: raw,
      };
    }

    if (url && url.pathname.includes("/pay/")) {
      const id = url.pathname.split("/pay/")[1]?.split("/")[0];
      if (!id) throw new Error("Payment session URL is missing a session id.");
      const sessionApiUrl = `${url.origin}/api/payment-sessions/${encodeURIComponent(id)}`;
      const res = await fetch(
        url.origin === window.location.origin
          ? `/api/payment-sessions/${encodeURIComponent(id)}`
          : sessionApiUrl,
      );
      if (!res.ok)
        throw new Error(`Could not load payment session: ${res.status}`);
      const session = await res.json();
      if (session.stellarUri) {
        const parsed = await parsePaymentPayload(session.stellarUri);
        return {
          ...parsed,
          paymentSessionUrl: raw,
          verifyUrl: parsed.verifyUrl || `${url.origin}/api/payment-sessions/${encodeURIComponent(id)}/verify`,
          returnUrl: parsed.returnUrl || session.returnUrl,
          paid: session.status === "paid",
          transactionHash: session.transactionHash,
        };
      }
      if (session.destination) {
        return {
          destination: session.destination,
          amount: session.amount ?? "",
          assetCode:
            session.assetCode ??
            props.activeNetwork?.nativeAssetSymbol ??
            "XLM",
          issuer: session.issuer,
          memo: session.memo,
          network: session.network,
          networkPassphrase: session.networkPassphrase,
          networkName: session.networkName,
          orderId: session.orderId,
          merchantId: session.merchantId,
          sessionId: session.id,
          paymentSessionUrl: raw,
          verifyUrl: `${url.origin}/api/payment-sessions/${encodeURIComponent(id)}/verify`,
          returnUrl: session.returnUrl,
          paid: session.status === "paid",
          transactionHash: session.transactionHash,
          sourceText: raw,
        };
      }
    }

    throw new Error(
      "Unsupported QR. Use a Stellar URI, Lumapa payment URL, or JSON payment request.",
    );
  }

  async function loadPaymentPayload() {
    try {
      const parsed = await parsePaymentPayload(destination);
      applyPaymentRequest(parsed);
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not parse payment data.",
      });
    }
  }

  async function startScanner() {
    try {
      if (scannerNeedsSecureContext()) {
        throw new Error("Camera scanning requires HTTPS. Open the app from https://app.lumapa.ir or localhost.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot access the camera. Use Safari/Chrome on HTTPS or paste the QR text.");
      }
      const Html5Qrcode = await loadHtml5QrCode();
      setScanning(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const scanner = new Html5Qrcode(scannerElementId, false);
      scannerRef.current = scanner;
      const cameraConfig = await preferredCameraConfig(Html5Qrcode);
      props.setNotice({ type: "info", text: "Camera is ready. Hold the QR code inside the square." });
      await scanner.start(
        cameraConfig,
        { fps: 12, qrbox: makeScannerBox, aspectRatio: 1.333334 },
        async (decodedText) => {
          const value = decodedText.trim();
          if (!value) return;
          stopScanner();
          props.setNotice({ type: "info", text: "QR detected. Loading payment…" });
          try {
            applyPaymentRequest(await parsePaymentPayload(value));
          } catch (error) {
            props.setNotice({
              type: "error",
              text: error instanceof Error ? error.message : "Could not read this QR code.",
            });
          }
        },
      );
    } catch (error) {
      stopScanner();
      props.setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not start QR scanner.",
      });
    }
  }

  async function send() {
    if (!props.activeNetwork || !props.activeAccount?.encryptedSecret)
      return props.setNotice({ type: "error", text: "No active account." });
    if (merchantInfo?.paid) {
      setSendPhase("confirmed");
      return props.setNotice({
        type: "info",
        text: "This order is already marked as paid in this wallet. Do not send it again.",
      });
    }
    if (!destination.trim())
      return props.setNotice({
        type: "error",
        text: "Enter a destination address or scan a payment QR.",
      });
    if (!amount.trim())
      return props.setNotice({ type: "error", text: "Enter the amount." });
    if (!props.passcode || props.passcode.length < 8)
      return props.setNotice({
        type: "error",
        text: "Unlock the wallet first. Enable passkey/biometric security or set a vault passcode in Security.",
      });
    props.setBusy(true);
    setSendPhase("checking");
    try {
      if (merchantInfo?.verifyUrl) {
        const status = await verifyPaymentRequest(merchantInfo.verifyUrl).catch(() => undefined);
        if (status?.status === "paid") {
          setMerchantInfo((current) => current ? { ...current, paid: true, transactionHash: status.transactionHash } : current);
          setSendPhase("confirmed");
          if (status.transactionHash) rememberPaid(merchantInfo, status.transactionHash);
          props.setNotice({ type: "info", text: "This order is already paid. Payment was not sent again." });
          return;
        }
      }

      setSendPhase("approving");
      await props.guardApproval();
      setSendPhase("submitting");
      const sourceSecret = await decryptText(
        props.activeAccount.encryptedSecret,
        props.passcode,
      );
      const result = await sendPayment({
        network: props.activeNetwork,
        sourceSecret,
        destination,
        amount,
        assetCode,
        issuer,
        memo,
      });
      if (merchantInfo) {
        setMerchantInfo((current) => current ? { ...current, submitted: true, transactionHash: result.hash } : current);
      }
      setSendPhase("verifying");
      if (merchantInfo?.verifyUrl) {
        const status = await waitForVerifiedPayment(merchantInfo.verifyUrl);
        if (status?.status === "paid") {
          const transactionHash = status.transactionHash || result.hash;
          rememberPaid(merchantInfo, transactionHash);
          setMerchantInfo((current) => current ? { ...current, paid: true, submitted: true, transactionHash, statusMessage: status.statusMessage } : current);
          setSendPhase("confirmed");
          props.setNotice({ type: "ok", text: "Payment confirmed. This order is paid." });
        } else {
          rememberPaid(merchantInfo, result.hash);
          setMerchantInfo((current) => current ? { ...current, paid: true, submitted: true, transactionHash: result.hash, statusMessage: status?.statusMessage || "Payment was submitted. The checkout is still confirming the ledger." } : current);
          setSendPhase("confirmed");
          props.setNotice({ type: "info", text: "Payment submitted. Open the checkout status if confirmation is still pending." });
        }
      } else {
        if (merchantInfo) {
          rememberPaid(merchantInfo, result.hash);
          setMerchantInfo((current) => current ? { ...current, paid: true, submitted: true, transactionHash: result.hash } : current);
        }
        setSendPhase("confirmed");
        props.setNotice({ type: "ok", text: `Payment submitted: ${result.hash}` });
      }
      await props.loadAccountData();
    } catch (error) {
      setSendPhase("idle");
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Payment failed.",
      });
    } finally {
      props.setBusy(false);
    }
  }

  return (
    <section className="spatial-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="screen-title">Send / Pay</h2>
          <p className="mt-1 text-sm text-white/50">
            Send manually or scan a shop QR.
          </p>
        </div>
        <Button
          onClick={scanning ? stopScanner : startScanner}
          className="min-h-10 rounded-xl px-3 py-2 text-xs"
        >
          {scanning ? <EyeOff size={15} /> : <Camera size={15} />}
          {scanning ? "Stop" : "Scan"}
        </Button>
      </div>

      {scanning ? (
        <div
          id={scannerElementId}
          className="mt-4 min-h-[280px] overflow-hidden rounded-[1.25rem] border border-white/10 bg-black [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover"
        />
      ) : null}

      <div className="mt-4 grid gap-3">
        <Field
          label="Recipient or payment QR"
          value={destination}
          onChange={setDestination}
          placeholder="G... or web+stellar:pay?..."
        />
        <Button
          onClick={loadPaymentPayload}
          className="min-h-10 rounded-xl px-3 py-2 text-xs"
        >
          <QrCode size={15} /> Load QR / payment URI
        </Button>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Amount"
            value={amount}
            onChange={setAmount}
            placeholder="10.5"
          />
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-white/55">
              Asset
            </span>
            <select
              className="input-control"
              value={assetValue}
              onChange={(event) => {
                const [code, iss = ""] = event.currentTarget.value.split(":");
                setAssetCode(code);
                setIssuer(iss);
              }}
            >
              <option
                value={`${props.activeNetwork?.nativeAssetSymbol ?? "XLM"}:`}
              >
                Native {props.activeNetwork?.nativeAssetSymbol ?? "XLM"}
              </option>
              {hasSelectedIssuedAsset ? null : issuer ? (
                <option value={assetValue}>
                  {assetCode} · {shortKey(issuer)}
                </option>
              ) : null}
              {issuedBalances.map((balance) => (
                <option
                  key={`${balance.code}:${balance.issuer}`}
                  value={`${balance.code}:${balance.issuer}`}
                >
                  {balance.code} · {shortKey(balance.issuer ?? "")}
                </option>
              ))}
            </select>
          </label>
        </div>
        {issuer ? (
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white/50">
            Issuer:{" "}
            <span className="break-all font-mono text-white/70">{issuer}</span>
          </div>
        ) : null}
        <Field
          label="Memo / order id"
          value={memo}
          onChange={setMemo}
          placeholder="Optional, max 28 chars"
        />
      </div>

      {isSending ? (
        <div className="mt-4 rounded-[1.25rem] border border-sky-300/25 bg-sky-500/10 p-4 text-sm text-sky-50" role="status" aria-live="polite">
          <div className="flex items-center gap-2 font-semibold">
            <RefreshCw className="animate-spin" size={18} />
            {sendPhase === "checking" ? "Checking whether this order is already paid…" :
              sendPhase === "approving" ? "Waiting for your passkey / wallet approval…" :
              sendPhase === "submitting" ? "Submitting payment to Stellar. Please wait…" :
              "Confirming this order on the ledger. Please wait…"}
          </div>
          <p className="mt-2 text-xs leading-5 text-sky-100/75">Do not close the app and do not tap approve again. The button is locked until this payment finishes.</p>
        </div>
      ) : null}

      {sendPhase === "confirmed" && merchantInfo?.paid ? (
        <div className="mt-4 rounded-[1.25rem] border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-50" role="status" aria-live="polite">
          <strong className="block">Payment completed</strong>
          <p className="mt-1 text-xs leading-5 text-emerald-100/75">This order is marked as paid in this wallet. Do not send it again.</p>
          {merchantInfo.transactionHash ? (
            <div className="mt-2 break-all font-mono text-[11px] text-emerald-100/70">Tx: {merchantInfo.transactionHash}</div>
          ) : null}
          {merchantInfo.statusMessage ? (
            <p className="mt-2 text-xs leading-5 text-emerald-100/70">{merchantInfo.statusMessage}</p>
          ) : null}
          {merchantInfo.paymentSessionUrl ? (
            <a className="app-button mt-3 w-full" href={merchantInfo.paymentSessionUrl}>Open checkout status</a>
          ) : null}
          {merchantInfo.returnUrl ? (
            <a className="app-button mt-2 w-full" href={merchantInfo.returnUrl}>Return to shop</a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[.03] p-4 text-sm text-white/65">
        <div className="flex justify-between gap-3">
          <span className="text-white/45">Network</span>
          <strong>{props.activeNetwork?.name ?? "—"}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span className="text-white/45">From</span>
          <strong>
            {props.activeAccount ? props.activeAccount.label : "No account"}
          </strong>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span className="text-white/45">Asset</span>
          <strong>{assetCode}</strong>
        </div>
        {merchantInfo?.orderId ? (
          <div className="mt-2 flex justify-between gap-3">
            <span className="text-white/45">Order</span>
            <strong>{merchantInfo.orderId}</strong>
          </div>
        ) : null}
        {merchantInfo?.merchantId ? (
          <div className="mt-2 flex justify-between gap-3">
            <span className="text-white/45">Merchant</span>
            <strong>{merchantInfo.merchantId}</strong>
          </div>
        ) : null}
        {merchantInfo?.paid ? (
          <div className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-emerald-50">
            <strong className="block text-sm">Already paid</strong>
            <span className="mt-1 block text-xs text-emerald-100/75">Do not approve this order again.</span>
            {merchantInfo.transactionHash ? (
              <span className="mt-2 block break-all font-mono text-[11px] text-emerald-100/70">{merchantInfo.transactionHash}</span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2 break-all">
          <span className="text-white/45">To</span>
          <div className="mt-1 font-mono text-xs">
            {destination ? destination : "—"}
          </div>
        </div>
      </div>
      <Button
        onClick={send}
        strong
        className="mt-4 w-full"
        disabled={!props.activeAccount || Boolean(merchantInfo?.paid) || isSending}
      >
        {isSending ? <RefreshCw className="animate-spin" size={16} /> : merchantInfo?.paid ? <CheckCircle2 size={16} /> : <Send size={16} />}
        {sendPhase === "submitting" ? "Submitting…" : sendPhase === "verifying" ? "Confirming…" : isSending ? "Processing…" : merchantInfo?.paid ? "Paid" : "Approve and send"}
      </Button>
    </section>
  );
}

function ReceivePanel({
  activeNetwork,
  activeAccount,
  balances,
}: {
  activeNetwork?: NetworkProfile;
  activeAccount?: StoredAccount;
  balances: AssetBalance[];
}) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [assetCode, setAssetCode] = useState(
    activeNetwork?.nativeAssetSymbol ?? "XLM",
  );
  const [issuer, setIssuer] = useState("");
  const uri = useMemo(() => {
    if (!activeAccount) return "";
    const params = new URLSearchParams({
      destination: activeAccount.publicKey,
      asset_code: assetCode || activeNetwork?.nativeAssetSymbol || "XLM",
    });
    if (amount) params.set("amount", amount);
    if (memo) params.set("memo", memo);
    if (issuer) params.set("asset_issuer", issuer);
    params.set("network", activeNetwork?.id ?? "");
    params.set(
      "msg",
      `Lumapa receive on ${activeNetwork?.name ?? "Stellar"}`,
    );
    return `web+stellar:pay?${params.toString()}`;
  }, [
    activeAccount,
    activeNetwork?.id,
    activeNetwork?.name,
    activeNetwork?.nativeAssetSymbol,
    amount,
    memo,
    assetCode,
    issuer,
  ]);

  useEffect(() => {
    setAssetCode(activeNetwork?.nativeAssetSymbol ?? "XLM");
    setIssuer("");
  }, [activeNetwork?.id, activeNetwork?.nativeAssetSymbol]);

  return (
    <section className="spatial-card p-4 md:p-5">
      <h2 className="screen-title">Receive</h2>
      <p className="mt-1 text-white/55">
        Share address or QR. Use memo/order id for commerce-style payments when
        needed.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-[2rem] bg-white p-5 text-black">
          {uri ? (
            <QRCodeSVG value={uri} size={300} includeMargin />
          ) : (
            <div className="grid h-[300px] place-items-center text-black/50">
              No account
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Field
            label="Public address"
            value={activeAccount?.publicKey ?? ""}
            onChange={() => undefined}
            readOnly
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Amount"
              value={amount}
              onChange={setAmount}
              placeholder="Optional"
            />
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[.18em] text-white/55">
                Asset
              </span>
              <select
                className="input-control"
                value={`${assetCode}:${issuer}`}
                onChange={(event) => {
                  const [code, iss = ""] = event.currentTarget.value.split(":");
                  setAssetCode(code);
                  setIssuer(iss);
                }}
              >
                <option value={`${activeNetwork?.nativeAssetSymbol ?? "XLM"}:`}>
                  Native {activeNetwork?.nativeAssetSymbol ?? "XLM"}
                </option>
                {balances
                  .filter((b) => !b.isNative)
                  .map((b) => (
                    <option
                      key={`${b.code}:${b.issuer}`}
                      value={`${b.code}:${b.issuer}`}
                    >
                      {b.code} · {shortKey(b.issuer ?? "")}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <Field label="Memo / order id" value={memo} onChange={setMemo} />
          <Field
            label="Payment URI"
            value={uri}
            onChange={() => undefined}
            textarea
            readOnly
          />
          <Button
            onClick={() =>
              navigator.clipboard.writeText(activeAccount?.publicKey ?? "")
            }
          >
            <Copy size={16} /> Copy address
          </Button>
        </div>
      </div>
    </section>
  );
}

function AssetsPanel(props: {
  activeNetwork?: NetworkProfile;
  activeAccount?: StoredAccount;
  balances: AssetBalance[];
  passcode: string;
  setNotice: (n: Notice) => void;
  setBusy: (b: boolean) => void;
  guardApproval: () => Promise<void>;
  loadAccountData: () => Promise<void>;
}) {
  const [assetCode, setAssetCode] = useState("USDC");
  const [issuer, setIssuer] = useState("");
  const [limit, setLimit] = useState("");

  async function trust() {
    if (!props.activeNetwork || !props.activeAccount?.encryptedSecret)
      return props.setNotice({ type: "error", text: "No active account." });
    if (!props.passcode || props.passcode.length < 8)
      return props.setNotice({
        type: "error",
        text: "Unlock the wallet first. Enable passkey/biometric security or set a vault passcode in Security.",
      });
    props.setBusy(true);
    try {
      await props.guardApproval();
      const sourceSecret = await decryptText(
        props.activeAccount.encryptedSecret,
        props.passcode,
      );
      const result = await changeTrust({
        network: props.activeNetwork,
        sourceSecret,
        assetCode,
        issuer,
        limit,
      });
      props.setNotice({
        type: "ok",
        text: `Trustline updated: ${result.hash}`,
      });
      await props.loadAccountData();
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not update trustline.",
      });
    } finally {
      props.setBusy(false);
    }
  }

  return (
    <section className="spatial-card p-4 md:p-5">
      <h2 className="screen-title">Assets & trustlines</h2>
      <p className="mt-1 text-white/55">
        Stellar issued assets require a trustline before receiving them.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Field label="Asset code" value={assetCode} onChange={setAssetCode} />
        <Field
          label="Issuer"
          value={issuer}
          onChange={setIssuer}
          placeholder="G..."
        />
        <Field
          label="Limit"
          value={limit}
          onChange={setLimit}
          placeholder="Optional"
        />
      </div>
      <Button onClick={trust} strong className="mt-5">
        <Plus size={16} /> Create/update trustline
      </Button>
      <div className="mt-7 grid gap-3 md:grid-cols-2">
        {props.balances.map((balance) => (
          <div
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
            key={`${balance.code}-${balance.issuer ?? "native"}`}
          >
            <div className="text-xl font-black">
              {balance.balance} {balance.code}
            </div>
            <div className="break-all text-sm text-white/45">
              {balance.isNative ? "Native asset" : balance.issuer}
            </div>
            {balance.limit ? (
              <div className="mt-1 text-sm text-white/50">
                Limit: {balance.limit}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountsPanel(props: {
  state: VaultState;
  setState: AppSetState;
  passcode: string;
  setPasscode: (v: string) => void;
  setNotice: (n: Notice) => void;
  guardApproval: () => Promise<void>;
  selectAccount: (accountId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<
    Record<string, { secret?: string; mnemonic?: string }>
  >({});

  async function reveal(account: StoredAccount, kind: "secret" | "mnemonic") {
    if (!props.passcode || props.passcode.length < 8)
      return props.setNotice({
        type: "error",
        text: "Unlock the wallet first with passkey/biometric approval or a vault passcode.",
      });
    try {
      await props.guardApproval();
      const payload =
        kind === "secret" ? account.encryptedSecret : account.encryptedMnemonic;
      if (!payload)
        throw new Error(`${kind} is not available for this account.`);
      const text = await decryptText(payload, props.passcode);
      setRevealed((current) => ({
        ...current,
        [account.id]: { ...current[account.id], [kind]: text },
      }));
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error ? error.message : "Could not decrypt account.",
      });
    }
  }

  if (adding) {
    return (
      <div className="accounts-add-flow">
        <Button
          onClick={() => setAdding(false)}
          className="mb-3 min-h-10 rounded-xl px-3 py-2 text-xs"
        >
          ← Accounts
        </Button>
        <OnboardingFlow
          state={props.state}
          setState={props.setState}
          passcode={props.passcode}
          setPasscode={props.setPasscode}
          setNotice={props.setNotice}
          title="Add account"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="spatial-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="screen-title">Accounts</h2>
            <p className="text-white/55">
              Reveal backup details only when needed.
            </p>
          </div>
          <Button onClick={() => setAdding((value) => !value)} strong>
            <UserPlus size={16} />{" "}
            {adding ? "Close add account" : "Add account"}
          </Button>
        </div>
        <div className="mt-6 grid gap-4">
          {props.state.accounts.map((account) => {
            const network = props.state.networks.find(
              (item) => item.id === account.networkId,
            );
            const opened = revealed[account.id];
            return (
              <div
                key={account.id}
                className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-black">{account.label}</div>
                    <div className="mt-1 text-sm text-white/50">
                      {network?.name ?? account.networkId} ·{" "}
                      {account.importedBy}
                    </div>
                    <div className="mt-2 break-all font-mono text-xs text-white/70">
                      {account.publicKey}
                    </div>
                  </div>
                  <Button onClick={() => props.selectAccount(account.id)}>
                    Use account
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={() => reveal(account, "secret")}>
                    <Eye size={16} /> Reveal secret
                  </Button>
                  <Button
                    onClick={() => reveal(account, "mnemonic")}
                    disabled={!account.encryptedMnemonic}
                  >
                    <Eye size={16} /> Reveal mnemonic
                  </Button>
                  <Button
                    onClick={() =>
                      setRevealed((current) => ({
                        ...current,
                        [account.id]: {},
                      }))
                    }
                  >
                    <EyeOff size={16} /> Hide
                  </Button>
                </div>
                {opened?.secret ? (
                  <div className="mt-4 rounded-2xl border border-rose-300/30 bg-black/30 p-4">
                    <div className="text-sm text-rose-100">Secret seed</div>
                    <div className="break-all font-mono text-sm">
                      {opened.secret}
                    </div>
                  </div>
                ) : null}
                {opened?.mnemonic ? (
                  <div className="mt-4 rounded-2xl border border-rose-300/30 bg-black/30 p-4">
                    <div className="text-sm text-rose-100">Mnemonic</div>
                    <div className="break-words font-mono text-sm">
                      {opened.mnemonic}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      {adding ? (
        <OnboardingFlow
          state={props.state}
          setState={props.setState}
          passcode={props.passcode}
          setPasscode={props.setPasscode}
          setNotice={props.setNotice}
          title="Add another account"
        />
      ) : null}
    </div>
  );
}

function MorePanel(props: {
  state: VaultState;
  setState: AppSetState;
  passcode: string;
  rawPasscode: string;
  setPasscode: (v: string) => void;
  setNotice: (n: Notice) => void;
  guardApproval: () => Promise<void>;
  selectAccount: (accountId: string) => void;
  activeNetwork?: NetworkProfile;
  activeAccount?: StoredAccount;
  setBusy: (b: boolean) => void;
  connectInitialUri?: string;
  onConnectInitialUriConsumed?: () => void;
}) {
  const [view, setView] = useState<
    "menu" | "accounts" | "security" | "advanced" | "connect"
  >("menu");

  useEffect(() => {
    if (props.connectInitialUri) {
      setView("connect");
      props.onConnectInitialUriConsumed?.();
    }
  }, [props.connectInitialUri, props.onConnectInitialUriConsumed]);

  if (view === "accounts") {
    return (
      <PanelBack title="Accounts" onBack={() => setView("menu")}>
        <AccountsPanel
          state={props.state}
          setState={props.setState}
          passcode={props.passcode}
          setPasscode={props.setPasscode}
          setNotice={props.setNotice}
          guardApproval={props.guardApproval}
          selectAccount={props.selectAccount}
        />
      </PanelBack>
    );
  }
  if (view === "security") {
    return (
      <PanelBack title="Security" onBack={() => setView("menu")}>
        <SecurityPanel
          state={props.state}
          setState={props.setState}
          passcode={props.rawPasscode}
          setPasscode={props.setPasscode}
          setNotice={props.setNotice}
        />
      </PanelBack>
    );
  }
  if (view === "advanced") {
    return (
      <PanelBack title="Advanced" onBack={() => setView("menu")}>
        <AdvancedPanel
          state={props.state}
          setState={props.setState}
          activeNetwork={props.activeNetwork}
          activeAccount={props.activeAccount}
          passcode={props.passcode}
          setNotice={props.setNotice}
          setBusy={props.setBusy}
          guardApproval={props.guardApproval}
        />
      </PanelBack>
    );
  }

  if (view === "connect") {
    return (
      <PanelBack title="Lumapa Connect" onBack={() => setView("menu")}>
        <ConnectPanel
          state={props.state}
          setState={props.setState}
          passcode={props.passcode}
          setNotice={props.setNotice}
          guardApproval={props.guardApproval}
          setBusy={props.setBusy}
          initialUri={props.connectInitialUri}
        />
      </PanelBack>
    );
  }

  return (
    <section className="spatial-card p-4 md:p-5">
      <h2 className="screen-title">More</h2>
      <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
        <button
          type="button"
          onClick={() => setView("accounts")}
          className="menu-row"
        >
          <WalletCards size={18} />
          <span>
            <strong>Accounts</strong>
            <small>Add accounts and reveal backups</small>
          </span>
          <span>›</span>
        </button>
        <button
          type="button"
          onClick={() => setView("connect")}
          className="menu-row"
        >
          <PlugZap size={18} />
          <span>
            <strong>Lumapa Connect</strong>
            <small>Review Stellar URI payment and signing requests</small>
          </span>
          <span>›</span>
        </button>
        <button
          type="button"
          onClick={() => setView("security")}
          className="menu-row"
        >
          <ShieldCheck size={18} />
          <span>
            <strong>Security</strong>
            <small>Passkey, passcode and auto-lock</small>
          </span>
          <span>›</span>
        </button>
        <button
          type="button"
          onClick={() => setView("advanced")}
          className="menu-row"
        >
          <KeyRound size={18} />
          <span>
            <strong>Advanced</strong>
            <small>Home domain, data and multisig</small>
          </span>
          <span>›</span>
        </button>
      </div>
    </section>
  );
}



function ConnectPanel(props: {
  state: VaultState;
  setState: AppSetState;
  passcode: string;
  setNotice: (n: Notice) => void;
  guardApproval: () => Promise<void>;
  setBusy: (b: boolean) => void;
  initialUri?: string;
}) {
  const scannerRef = useRef<Html5QrCodeInstance | null>(null);
  const [scannerElementId] = useState(() => `lumapa-connect-scanner-${Math.random().toString(36).slice(2)}`);
  const [scanning, setScanning] = useState(false);
  const [rawUri, setRawUri] = useState(props.initialUri ?? "");
  const [request, setRequest] = useState<Sep7Request | undefined>();
  const [selectedAccountId, setSelectedAccountId] = useState(
    props.state.activeAccountId ?? props.state.accounts[0]?.id ?? "",
  );
  const [signedXdr, setSignedXdr] = useState("");
  const [completedPayment, setCompletedPayment] = useState<{ transactionHash?: string }>();
  const [submitMode, setSubmitMode] = useState<"auto" | "copy">("auto");
  const [approvalPhase, setApprovalPhase] = useState<"idle" | "approving" | "submitting" | "verifying" | "confirmed">("idle");
  const isApproving = approvalPhase !== "idle" && approvalPhase !== "confirmed";

  const requestNetwork = request
    ? networkForSep7Request(request, props.state.networks)
    : undefined;
  const compatibleAccounts = props.state.accounts.filter((account) =>
    requestNetwork ? account.networkId === requestNetwork.id : true,
  );
  const selectedAccount =
    props.state.accounts.find((account) => account.id === selectedAccountId) ??
    compatibleAccounts[0] ??
    props.state.accounts[0];
  const selectedNetwork = selectedAccount
    ? props.state.networks.find((network) => network.id === selectedAccount.networkId)
    : requestNetwork;

  useEffect(() => {
    if (props.initialUri) {
      setRawUri(props.initialUri);
      parseRequest(props.initialUri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialUri]);

  useEffect(() => () => stopScanner(), []);

  function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      void scanner
        .stop()
        .catch(() => undefined)
        .then(() => scanner.clear().catch(() => undefined));
    }
    setScanning(false);
  }

  function parseRequest(input = rawUri) {
    try {
      const parsed = parseSep7Request(input);
      const network = networkForSep7Request(parsed, props.state.networks);
      setRequest(parsed);
      setSignedXdr("");
      setCompletedPayment(undefined);
      if (network) {
        const first = props.state.accounts.find((account) => account.networkId === network.id);
        if (first) setSelectedAccountId(first.id);
      }
      props.setNotice({ type: "ok", text: "Request loaded. Review before approving." });
    } catch (error) {
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not parse request.",
      });
    }
  }

  async function startScanner() {
    try {
      if (scannerNeedsSecureContext()) {
        throw new Error("Camera scanning requires HTTPS. Open the app from https://app.lumapa.ir or localhost.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot access the camera. Use Safari/Chrome on HTTPS or paste the Stellar request.");
      }
      const Html5Qrcode = await loadHtml5QrCode();
      setScanning(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const scanner = new Html5Qrcode(scannerElementId, false);
      scannerRef.current = scanner;
      const cameraConfig = await preferredCameraConfig(Html5Qrcode);
      props.setNotice({ type: "info", text: "Camera is ready. Hold the QR code inside the square." });
      await scanner.start(
        cameraConfig,
        { fps: 12, qrbox: makeScannerBox, aspectRatio: 1.333334 },
        (decodedText) => {
          const value = decodedText.trim();
          if (!value) return;
          stopScanner();
          props.setNotice({ type: "info", text: "QR detected. Loading request…" });
          setRawUri(value);
          parseRequest(value);
        },
      );
    } catch (error) {
      stopScanner();
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not start QR scanner.",
      });
    }
  }

  async function registerHandler() {
    try {
      const nav = navigator as Navigator & {
        registerProtocolHandler?: (scheme: string, url: string) => void;
      };
      if (!nav.registerProtocolHandler)
        throw new Error("This browser does not support protocol handler registration.");
      nav.registerProtocolHandler("web+stellar", `${window.location.origin}/connect?uri=%s`);
      props.setNotice({ type: "ok", text: "Requested web+stellar handler registration." });
    } catch (error) {
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not register handler.",
      });
    }
  }

  function requestSummary() {
    if (!request) return undefined;
    if (request.kind === "pay") {
      return [
        ["Type", "Payment request"],
        ["Amount", request.amount || "User entered / missing"],
        ["Asset", request.assetCode || selectedNetwork?.nativeAssetSymbol || "native"],
        ["Destination", request.destination],
        ["Memo", request.memo || "—"],
      ];
    }
    try {
      const networkPassphrase =
        request.networkPassphrase ?? requestNetwork?.networkPassphrase ?? selectedNetwork?.networkPassphrase;
      if (!networkPassphrase) return [["Type", "Sign XDR"]];
      const info = inspectXdr(request.xdr, networkPassphrase);
      return [
        ["Type", "Sign transaction XDR"],
        ["Source", String(info.source)],
        ["Operations", info.operations.join(", ") || "—"],
        ["Signatures", String(info.signatures)],
        ["Hash", info.hash],
      ];
    } catch {
      return [["Type", "Sign transaction XDR"], ["XDR", "Could not inspect with selected network"]];
    }
  }

  async function approveRequest() {
    if (!request) return props.setNotice({ type: "error", text: "Load a request first." });
    if (!selectedAccount?.encryptedSecret || !selectedNetwork)
      return props.setNotice({ type: "error", text: "Choose an account for this request." });
    if (request.kind === "tx" && request.pubkey && request.pubkey !== selectedAccount.publicKey)
      return props.setNotice({ type: "error", text: "This request asks for a different signer public key." });
    if (!props.passcode || props.passcode.length < 8)
      return props.setNotice({
        type: "error",
        text: "Unlock the wallet first. Enable passkey/biometric security or set a vault passcode in Security.",
      });
    props.setBusy(true);
    try {
      setApprovalPhase("approving");
      await props.guardApproval();
      setApprovalPhase("submitting");
      const sourceSecret = await decryptText(selectedAccount.encryptedSecret, props.passcode);
      if (request.kind === "pay") {
        if (!request.amount.trim()) throw new Error("The payment request is missing amount.");
        const paymentInfo = { sessionId: request.sessionId, orderId: request.memo, source: request.raw };
        const remembered = getRememberedPayment(paymentInfo);
        if (remembered?.transactionHash) {
          setCompletedPayment({ transactionHash: remembered.transactionHash });
          props.setNotice({ type: "info", text: "This order was already paid from this device. Payment was not sent again." });
          return;
        }
        if (request.verifyUrl) {
          const status = await verifyPaymentRequest(request.verifyUrl).catch(() => undefined);
          if (status?.status === "paid") {
            if (status.transactionHash) rememberPaid(paymentInfo, status.transactionHash);
            setCompletedPayment({ transactionHash: status.transactionHash });
            props.setNotice({ type: "info", text: "This order is already paid. Payment was not sent again." });
            return;
          }
        }
        const result = await sendPayment({
          network: selectedNetwork,
          sourceSecret,
          destination: request.destination,
          amount: request.amount,
          assetCode: request.assetCode || selectedNetwork.nativeAssetSymbol,
          issuer: request.issuer,
          memo: request.memo,
        });
        rememberPaid(paymentInfo, result.hash);
        setApprovalPhase("verifying");
        setCompletedPayment({ transactionHash: result.hash });
        if (request.verifyUrl) await verifyPaymentRequest(request.verifyUrl).catch(() => undefined);
        setApprovalPhase("confirmed");
        props.setNotice({ type: "ok", text: `Payment submitted and saved: ${result.hash}` });
        return;
      }
      const networkPassphrase = request.networkPassphrase ?? selectedNetwork.networkPassphrase;
      const nextSignedXdr = signXdr({
        xdrEnvelope: request.xdr,
        networkPassphrase,
        secret: sourceSecret,
      });
      setSignedXdr(nextSignedXdr);
      if (request.callback && submitMode === "auto") {
        await sendSep7Callback(request.callback, nextSignedXdr);
        props.setNotice({ type: "ok", text: "Signed XDR returned to the requesting app." });
      } else if (!request.callback && submitMode === "auto") {
        const result = await submitSignedXdr(selectedNetwork, nextSignedXdr);
        props.setNotice({ type: "ok", text: `Signed and submitted: ${result.hash}` });
      } else {
        props.setNotice({ type: "ok", text: "Transaction signed. Copy the signed XDR." });
      }
    } catch (error) {
      setApprovalPhase("idle");
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not approve request.",
      });
    } finally {
      props.setBusy(false);
    }
  }

  const rows = requestSummary();

  return (
    <section className="spatial-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="screen-title">Lumapa Connect</h2>
          <p className="mt-1 text-sm text-white/50">
            Scan or paste a standard Stellar SEP-7 request from a shop, Stellar Lab, or dApp.
          </p>
        </div>
        <Button onClick={scanning ? stopScanner : startScanner} className="min-h-10 rounded-xl px-3 py-2 text-xs">
          <Camera size={15} /> {scanning ? "Stop" : "Scan"}
        </Button>
      </div>

      {scanning ? (
        <div
          id={scannerElementId}
          className="mt-4 min-h-[280px] overflow-hidden rounded-2xl border border-white/10 bg-black [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover"
        />
      ) : null}

      <div className="mt-4 space-y-3">
        <Field
          label="Stellar request URI"
          value={rawUri}
          onChange={setRawUri}
          textarea
          placeholder="web+stellar:tx?... or web+stellar:pay?..."
        />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => parseRequest()}>
            <Check size={15} /> Review
          </Button>
          <Button type="button" onClick={registerHandler}>
            <PlugZap size={15} /> Register
          </Button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-sm leading-6 text-white/55">
          This is standards-based. Lumapa does not require a private SDK for merchants: any wallet that supports SEP-7 can open the same request.
        </div>

        {request ? (
          <div className="mt-4 space-y-3">
            <label className="block space-y-2">
              <span className="field-label">Signing account</span>
              <select
                className="input-control"
                value={selectedAccount?.id ?? ""}
                onChange={(event) => setSelectedAccountId(event.currentTarget.value)}
              >
                {(compatibleAccounts.length ? compatibleAccounts : props.state.accounts).map((account) => {
                  const network = props.state.networks.find((item) => item.id === account.networkId);
                  return (
                    <option key={account.id} value={account.id}>
                      {account.label} · {network?.name ?? "Network"} · {shortKey(account.publicKey)}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-sm text-white/70">
              <div className="flex justify-between gap-3">
                <span className="text-white/45">Network</span>
                <strong>{requestNetwork?.name ?? selectedNetwork?.name ?? "Unknown"}</strong>
              </div>
              {request.originDomain ? (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-white/45">Origin</span>
                  <strong>{request.originDomain}</strong>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between gap-3">
                <span className="text-white/45">Signed origin</span>
                <strong>{request.hasSignature ? "present" : "not present"}</strong>
              </div>
              {request.kind === "tx" && request.callback ? (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-white/45">Return method</span>
                  <strong>{callbackUrl(request.callback) ? "callback" : "copy only"}</strong>
                </div>
              ) : null}
              {request.msg ? <p className="mt-3 text-white/55">{request.msg}</p> : null}
            </div>

            {rows ? (
              <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-sm text-white/70">
                {rows.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 py-1">
                    <span className="shrink-0 text-white/45">{key}</span>
                    <span className="min-w-0 break-all text-right font-mono text-xs text-white/75">{value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {request.kind === "tx" ? (
              <label className="block space-y-2">
                <span className="field-label">After signing</span>
                <select
                  className="input-control"
                  value={submitMode}
                  onChange={(event) => setSubmitMode(event.currentTarget.value as "auto" | "copy")}
                >
                  <option value="auto">Return to app or submit if no callback</option>
                  <option value="copy">Only sign and copy XDR</option>
                </select>
              </label>
            ) : null}

            {!request.hasSignature && request.originDomain ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                This request names an origin domain but has no SEP-7 signature. Only approve if you trust the source.
              </div>
            ) : null}

            {isApproving ? (
              <div className="rounded-2xl border border-sky-300/25 bg-sky-500/10 p-3 text-sm text-sky-50" role="status" aria-live="polite">
                <div className="flex items-center gap-2 font-semibold">
                  <RefreshCw className="animate-spin" size={16} />
                  {approvalPhase === "approving" ? "Waiting for your approval…" :
                    approvalPhase === "submitting" ? "Submitting payment to Stellar…" :
                    "Confirming payment on the ledger…"}
                </div>
                <p className="mt-2 text-xs leading-5 text-sky-100/75">Keep the app open. Do not approve this request again while it finishes.</p>
              </div>
            ) : null}

            {completedPayment ? (
              <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm text-emerald-50">
                <strong className="block">Payment completed</strong>
                <span className="mt-1 block text-xs text-emerald-100/75">Do not approve this request again.</span>
                {completedPayment.transactionHash ? (
                  <span className="mt-2 block break-all font-mono text-[11px] text-emerald-100/70">{completedPayment.transactionHash}</span>
                ) : null}
              </div>
            ) : null}

            <Button type="button" onClick={approveRequest} strong className="w-full" disabled={Boolean(completedPayment) || isApproving}>
              {isApproving ? <RefreshCw className="animate-spin" size={16} /> : completedPayment ? <CheckCircle2 size={16} /> : <Fingerprint size={16} />}
              {isApproving ? "Processing…" : completedPayment ? "Paid" : "Approve request"}
            </Button>
          </div>
        ) : null}
      </div>

      {signedXdr ? (
        <div className="mt-4 space-y-2">
          <Field label="Signed XDR" value={signedXdr} onChange={() => undefined} textarea readOnly />
          <Button type="button" onClick={() => navigator.clipboard.writeText(signedXdr)}>
            <Copy size={16} /> Copy signed XDR
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function PanelBack({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="icon-button"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="screen-title">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SecurityPanel(props: {
  state: VaultState;
  setState: AppSetState;
  passcode: string;
  setPasscode: (v: string) => void;
  setNotice: (n: Notice) => void;
}) {
  const [autoLockMinutes, setAutoLockMinutes] = useState(
    String(props.state.autoLockMinutes ?? 5),
  );

  async function enableWebAuthn() {
    try {
      const credentialId = await registerLocalPasskey("Lumapa user");
      props.setState((current) => ({
        ...current,
        webAuthnEnabled: true,
        webAuthnCredentialId: credentialId,
      }));
      props.setNotice({
        type: "ok",
        text: "Passkey approval enabled on this browser/device.",
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error ? error.message : "Could not enable WebAuthn.",
      });
    }
  }

  function saveAutoLock() {
    const minutes = Math.max(1, Number(autoLockMinutes || 5));
    props.setState((current) => ({ ...current, autoLockMinutes: minutes }));
    props.setNotice({ type: "ok", text: "Security settings saved." });
  }

  return (
    <section className="spatial-card p-4 md:p-5">
      <h2 className="screen-title">Security</h2>
      <p className="mt-1 text-white/55">
        Security controls only. Account backup reveal is now in the Accounts
        page.
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <h3 className="font-bold">Vault unlock</h3>
          <div className="mt-4">
            <Field
              label="Passcode"
              value={props.passcode}
              onChange={props.setPasscode}
              type="password"
            />
          </div>
          <p className="mt-3 text-sm text-white/50">
            This passcode decrypts the local device vault. It is never sent to
            the server.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <h3 className="font-bold">Biometric / passkey approval</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={enableWebAuthn} disabled={!isWebAuthnSupported()}>
              <Fingerprint size={16} /> Enable passkey/biometric
            </Button>
            <Button
              onClick={() =>
                props.setState((current) => ({
                  ...current,
                  webAuthnEnabled: false,
                  webAuthnCredentialId: undefined,
                }))
              }
            >
              <EyeOff size={16} /> Disable passkey
            </Button>
          </div>
          <p className="mt-3 text-sm text-white/50">
            Status:{" "}
            {props.state.webAuthnEnabled ? "Passkey enabled" : "Passcode only"}
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 lg:col-span-2">
          <h3 className="font-bold">Auto-lock</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <Field
              label="Auto-lock minutes"
              value={autoLockMinutes}
              onChange={setAutoLockMinutes}
              type="number"
            />
            <Button onClick={saveAutoLock}>Save security settings</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdvancedPanel(props: {
  state: VaultState;
  setState: AppSetState;
  activeNetwork?: NetworkProfile;
  activeAccount?: StoredAccount;
  passcode: string;
  setNotice: (n: Notice) => void;
  setBusy: (b: boolean) => void;
  guardApproval: () => Promise<void>;
}) {
  const [customName, setCustomName] = useState("Custom Stellar Network");
  const [horizonUrl, setHorizonUrl] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [nativeSymbol, setNativeSymbol] = useState("XLM");
  const [homeDomain, setHomeDomainValue] = useState("");
  const [dataName, setDataName] = useState("");
  const [dataValue, setDataValue] = useState("");
  const [signer, setSigner] = useState("");
  const [weight, setWeight] = useState("1");
  const [thresholds, setThresholds] = useState({ low: "", med: "", high: "" });
  const [xdrEnvelope, setXdrEnvelope] = useState("");
  const [xdrInfo, setXdrInfo] = useState("");

  async function autodetectNetwork() {
    try {
      if (!rpcUrl && !horizonUrl)
        throw new Error(
          "Enter Horizon URL or RPC URL first. Horizon-only networks are supported.",
        );
      const loaded = rpcUrl
        ? await loadNetworkFromRpc(rpcUrl)
        : await loadNetworkFromHorizon(horizonUrl);
      setPassphrase(loaded.networkPassphrase ?? "");
      props.setNotice({
        type: "ok",
        text: rpcUrl
          ? "Network passphrase loaded from RPC getNetwork."
          : "Network passphrase loaded from Horizon root.",
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not autodetect network.",
      });
    }
  }

  function useFuturenetPreset() {
    setCustomName(FUTURENET_CUSTOM_PRESET.name);
    setHorizonUrl(FUTURENET_CUSTOM_PRESET.horizonUrl);
    setRpcUrl(FUTURENET_CUSTOM_PRESET.rpcUrl ?? "");
    setPassphrase(FUTURENET_CUSTOM_PRESET.networkPassphrase);
    setNativeSymbol(FUTURENET_CUSTOM_PRESET.nativeAssetSymbol);
    props.setNotice({
      type: "info",
      text: "Futurenet is treated as a custom network preset. Review the values, then add it.",
    });
  }

  function addCustomNetwork() {
    if (!horizonUrl || !passphrase)
      return props.setNotice({
        type: "error",
        text: "Horizon URL and network passphrase are required.",
      });
    const network: NetworkProfile = {
      id: `custom-${crypto.randomUUID()}`,
      name: customName,
      horizonUrl,
      rpcUrl: rpcUrl || undefined,
      networkPassphrase: passphrase,
      nativeAssetSymbol: nativeSymbol || "XLM",
      nativeAssetDisplayName: `${nativeSymbol || "XLM"} native`,
      isCustom: true,
    };
    props.setState((current) => ({
      ...current,
      networks: [...current.networks, network],
      activeNetworkId: network.id,
      activeAccountId: undefined,
    }));
    props.setNotice({
      type: "ok",
      text: "Custom network added. Go to Accounts to recover an account on it.",
    });
  }

  async function decryptSecret() {
    if (!props.passcode || props.passcode.length < 8)
      throw new Error(
        "Unlock the wallet first. Enable passkey/biometric security or set a vault passcode in Security.",
      );
    if (!props.activeAccount?.encryptedSecret)
      throw new Error("No encrypted secret for active account.");
    await props.guardApproval();
    return decryptText(props.activeAccount.encryptedSecret, props.passcode);
  }

  async function submitHomeDomain() {
    if (!props.activeNetwork) return;
    props.setBusy(true);
    try {
      const result = await setHomeDomain({
        network: props.activeNetwork,
        sourceSecret: await decryptSecret(),
        homeDomain,
      });
      props.setNotice({
        type: "ok",
        text: `Home domain changed: ${result.hash}`,
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error ? error.message : "Could not set home domain.",
      });
    } finally {
      props.setBusy(false);
    }
  }

  async function submitManageData() {
    if (!props.activeNetwork) return;
    props.setBusy(true);
    try {
      const result = await manageData({
        network: props.activeNetwork,
        sourceSecret: await decryptSecret(),
        name: dataName,
        value: dataValue,
      });
      props.setNotice({
        type: "ok",
        text: `Manage data submitted: ${result.hash}`,
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not manage data.",
      });
    } finally {
      props.setBusy(false);
    }
  }

  async function submitSigner() {
    if (!props.activeNetwork) return;
    props.setBusy(true);
    try {
      const result = await addSigner({
        network: props.activeNetwork,
        sourceSecret: await decryptSecret(),
        signerPublicKey: signer,
        weight: Number(weight || 1),
        lowThreshold: thresholds.low ? Number(thresholds.low) : undefined,
        medThreshold: thresholds.med ? Number(thresholds.med) : undefined,
        highThreshold: thresholds.high ? Number(thresholds.high) : undefined,
      });
      props.setNotice({
        type: "ok",
        text: `Signer options submitted: ${result.hash}`,
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text:
          error instanceof Error ? error.message : "Could not update signer.",
      });
    } finally {
      props.setBusy(false);
    }
  }

  async function signCurrentXdr() {
    if (!props.activeNetwork) return;
    try {
      const signed = signXdr({
        xdrEnvelope,
        networkPassphrase: props.activeNetwork.networkPassphrase,
        secret: await decryptSecret(),
      });
      setXdrEnvelope(signed);
      setXdrInfo(
        JSON.stringify(
          inspectXdr(signed, props.activeNetwork.networkPassphrase),
          null,
          2,
        ),
      );
      props.setNotice({
        type: "ok",
        text: "XDR signed locally. Share it with other signers or submit it.",
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not sign XDR.",
      });
    }
  }

  async function submitXdr() {
    if (!props.activeNetwork) return;
    try {
      const result = await submitSignedXdr(props.activeNetwork, xdrEnvelope);
      props.setNotice({
        type: "ok",
        text: `Signed XDR submitted: ${result.hash}`,
      });
    } catch (error) {
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not submit XDR.",
      });
    }
  }

  async function buildSampleXdr() {
    if (!props.activeNetwork || !props.activeAccount) return;
    try {
      const destination = prompt(
        "Destination public key for unsigned payment XDR",
      );
      const amount = prompt("Amount");
      if (!destination || !amount) return;
      const xdr = await buildUnsignedPaymentXdr({
        network: props.activeNetwork,
        sourcePublicKey: props.activeAccount.publicKey,
        destination,
        amount,
        assetCode: props.activeNetwork.nativeAssetSymbol,
      });
      setXdrEnvelope(xdr);
      setXdrInfo(
        JSON.stringify(
          inspectXdr(xdr, props.activeNetwork.networkPassphrase),
          null,
          2,
        ),
      );
    } catch (error) {
      props.setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not build XDR.",
      });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="spatial-card p-4 md:p-5">
        <h2 className="screen-title">Account options</h2>
        <div className="mt-5 space-y-4">
          <Field
            label="Home domain"
            value={homeDomain}
            onChange={setHomeDomainValue}
            placeholder="example.com"
          />
          <Button onClick={submitHomeDomain}>Set home domain</Button>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Data name" value={dataName} onChange={setDataName} />
            <Field
              label="Data value"
              value={dataValue}
              onChange={setDataValue}
            />
          </div>
          <Button onClick={submitManageData}>Manage data</Button>
        </div>
      </section>
      <section className="spatial-card p-4 md:p-5">
        <h2 className="screen-title">Multisig signers</h2>
        <div className="mt-5 space-y-4">
          <Field
            label="Signer public key"
            value={signer}
            onChange={setSigner}
          />
          <Field
            label="Signer weight"
            value={weight}
            onChange={setWeight}
            type="number"
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Low threshold"
              value={thresholds.low}
              onChange={(v) => setThresholds((t) => ({ ...t, low: v }))}
            />
            <Field
              label="Medium threshold"
              value={thresholds.med}
              onChange={(v) => setThresholds((t) => ({ ...t, med: v }))}
            />
            <Field
              label="High threshold"
              value={thresholds.high}
              onChange={(v) => setThresholds((t) => ({ ...t, high: v }))}
            />
          </div>
          <Button onClick={submitSigner}>
            Submit signer/threshold changes
          </Button>
        </div>
      </section>
      <section className="spatial-card p-4 md:p-5">
        <h2 className="screen-title">XDR co-signing</h2>
        <div className="mt-5 space-y-4">
          <Field
            label="Transaction XDR"
            value={xdrEnvelope}
            onChange={setXdrEnvelope}
            textarea
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={buildSampleXdr}>
              Build unsigned native payment XDR
            </Button>
            <Button
              onClick={() =>
                props.activeNetwork &&
                setXdrInfo(
                  JSON.stringify(
                    inspectXdr(
                      xdrEnvelope,
                      props.activeNetwork.networkPassphrase,
                    ),
                    null,
                    2,
                  ),
                )
              }
            >
              Inspect
            </Button>
            <Button onClick={signCurrentXdr}>Sign</Button>
            <Button onClick={submitXdr} strong>
              Submit
            </Button>
          </div>
          {xdrInfo ? (
            <pre className="safe-scroll max-h-64 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/70">
              {xdrInfo}
            </pre>
          ) : null}
        </div>
      </section>
    </div>
  );
}

type ParsedPaymentRequest = {
  destination: string;
  amount: string;
  assetCode: string;
  issuer?: string;
  memo?: string;
  network?: string;
  networkPassphrase?: string;
  networkName?: string;
  orderId?: string;
  merchantId?: string;
  sessionId?: string;
  paymentSessionUrl?: string;
  verifyUrl?: string;
  returnUrl?: string;
  paid?: boolean;
  transactionHash?: string;
  sourceText: string;
};
