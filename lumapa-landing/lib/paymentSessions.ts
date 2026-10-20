import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Networks } from '@stellar/stellar-sdk';
import type { PaymentSession } from './types';
import { findPaymentOnHorizon } from './paymentVerifier';

const DATA_DIR = process.env.LUMAPA_DATA_DIR || '/tmp/lumapa-wallet';
const STORE = path.join(DATA_DIR, 'payment-sessions.json');
const PUBLIC_BASE_URL = (
  process.env.NEXT_PUBLIC_LUMAPA_BASE_URL ||
  process.env.LUMAPA_BASE_URL ||
  process.env.LUMAPA_PUBLIC_BASE_URL ||
  'https://lumapa.ir'
).replace(/\/+$/, '');

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(STORE, 'utf8');
  } catch {
    await writeFile(STORE, JSON.stringify({ sessions: [] }, null, 2));
  }
}

async function readSessions(): Promise<PaymentSession[]> {
  await ensureStore();
  const raw = await readFile(STORE, 'utf8');
  const parsed = JSON.parse(raw) as { sessions?: PaymentSession[] };
  return parsed.sessions ?? [];
}

async function writeSessions(sessions: PaymentSession[]) {
  await ensureStore();
  await writeFile(STORE, JSON.stringify({ sessions }, null, 2));
}

async function notifyMerchant(session: PaymentSession) {
  if (!session.callbackUrl || session.status !== 'paid') return undefined;
  try {
    const response = await fetch(session.callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        merchantId: session.merchantId,
        orderId: session.orderId,
        status: session.status,
        transactionHash: session.transactionHash,
        paidAt: session.paidAt,
        payer: session.payer,
        returnUrl: session.returnUrl,
      }),
    });
    if (!response.ok) return `Merchant callback failed with HTTP ${response.status}.`;
    return undefined;
  } catch (error) {
    return error instanceof Error ? `Merchant callback failed: ${error.message}` : 'Merchant callback failed.';
  }
}

export async function createPaymentSession(input: Omit<PaymentSession, 'id' | 'createdAt' | 'status' | 'stellarUri'>) {
  const id = `ps_${crypto.randomBytes(12).toString('hex')}`;
  const networkPassphrase = input.networkPassphrase ||
    (input.network === 'lumapa' ? process.env.LUMAPA_NETWORK_PASSPHRASE : undefined) ||
    (input.network === 'public' ? Networks.PUBLIC : undefined) ||
    (input.network === 'testnet' ? Networks.TESTNET : undefined);
  const paymentUrl = `${PUBLIC_BASE_URL}/pay/${encodeURIComponent(id)}`;
  const verifyUrl = `${PUBLIC_BASE_URL}/api/payment-sessions/${encodeURIComponent(id)}/verify`;
  const params = new URLSearchParams({
    destination: input.destination,
    amount: input.amount,
    asset_code: input.assetCode,
    memo: input.memo || input.orderId,
    msg: `Lumapa order ${input.orderId}`,
    origin_domain: 'lumapa.ir',
    network: input.network,
    session_id: id,
    payment_session_url: paymentUrl,
    verify_url: verifyUrl,
  });
  if (input.returnUrl) params.set('return_url', input.returnUrl);
  if (networkPassphrase) params.set('network_passphrase', networkPassphrase);
  if (input.networkName) params.set('network_name', input.networkName);
  if (input.horizonUrl) params.set('horizon_url', input.horizonUrl);
  if (input.nativeAssetCode) params.set('native_asset_code', input.nativeAssetCode);
  if (input.issuer) params.set('asset_issuer', input.issuer);
  const stellarUri = `web+stellar:pay?${params.toString()}`;
  const session: PaymentSession = {
    ...input,
    id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    stellarUri,
  };
  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);
  return session;
}

export async function getPaymentSession(id: string) {
  const sessions = await readSessions();
  const session = sessions.find((s) => s.id === id);
  if (!session) return undefined;
  if (session.status === 'pending' && Date.parse(session.expiresAt) < Date.now()) {
    session.status = 'expired';
    session.statusMessage = 'Payment session expired.';
    await writeSessions(sessions);
  }
  return session;
}

export async function verifyPaymentSession(id: string) {
  const sessions = await readSessions();
  const session = sessions.find((s) => s.id === id);
  if (!session) return undefined;

  if (session.status === 'paid') {
    const callbackError = await notifyMerchant(session);
    if (callbackError) {
      session.statusMessage = `Payment verified on Stellar. ${callbackError}`;
      await writeSessions(sessions);
    }
    return session;
  }
  if (Date.parse(session.expiresAt) < Date.now()) {
    session.status = 'expired';
    session.statusMessage = 'Payment session expired.';
    await writeSessions(sessions);
    return session;
  }

  try {
    const payment = await findPaymentOnHorizon(session);
    if (payment) {
      session.status = 'paid';
      session.transactionHash = payment.transactionHash;
      session.payer = payment.payer;
      session.paidAt = payment.paidAt || new Date().toISOString();
      session.statusMessage = 'Payment verified on Stellar.';
      const callbackError = await notifyMerchant(session);
      if (callbackError) session.statusMessage = `Payment verified on Stellar. ${callbackError}`;
      await writeSessions(sessions);
    } else {
      session.statusMessage = 'Waiting for a matching Stellar payment.';
      await writeSessions(sessions);
    }
  } catch (error) {
    session.statusMessage = error instanceof Error ? error.message : 'Could not verify payment.';
    await writeSessions(sessions);
  }
  return session;
}

export async function listPaymentSessions() {
  return readSessions();
}
