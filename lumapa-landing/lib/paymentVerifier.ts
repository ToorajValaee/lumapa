import type { PaymentSession } from './types';

function horizonBase(session: PaymentSession) {
  const base = session.horizonUrl || process.env.NEXT_PUBLIC_LUMAPA_HORIZON_URL || 'https://horizon.badje.ir';
  return base.replace(/\/+$/, '');
}

function decimalToUnits(value: string): bigint {
  const normalized = String(value || '').trim();
  if (!/^\d+(\.\d{1,7})?$/.test(normalized)) return -1n;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 10_000_000n + BigInt((fraction + '0000000').slice(0, 7));
}

function sameAmount(a: string, b: string) {
  return decimalToUnits(a) === decimalToUnits(b);
}

function paymentDestination(record: any) {
  return record.to || record.destination || record.account || '';
}

function paymentSource(record: any) {
  return record.from || record.source_account || record.funder || '';
}

function sameAsset(session: PaymentSession, record: any) {
  const expectedCode = session.assetCode.toUpperCase();
  const expectedIssuer = session.issuer?.trim();
  if (!expectedIssuer) {
    return record.asset_type === 'native';
  }
  return (
    record.asset_type !== 'native' &&
    String(record.asset_code || '').toUpperCase() === expectedCode &&
    String(record.asset_issuer || '') === expectedIssuer
  );
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Horizon request failed: ${res.status}`);
  return res.json();
}

async function transactionMemoMatches(base: string, txHash: string, expectedMemo?: string) {
  if (!expectedMemo) return true;
  const tx = await fetchJson(`${base}/transactions/${encodeURIComponent(txHash)}`);
  const memoType = String(tx.memo_type || '').toLowerCase();
  if (memoType === 'none') return false;
  return String(tx.memo || '') === expectedMemo;
}

export type VerifiedPayment = {
  transactionHash: string;
  payer?: string;
  paidAt?: string;
};

export async function findPaymentOnHorizon(session: PaymentSession): Promise<VerifiedPayment | undefined> {
  const base = horizonBase(session);
  const expectedMemo = session.memo || session.orderId;
  const url = `${base}/accounts/${encodeURIComponent(session.destination)}/payments?order=desc&limit=200`;
  const page = await fetchJson(url);
  const records: any[] = page?._embedded?.records || [];

  for (const record of records) {
    if (!['payment', 'path_payment_strict_receive', 'path_payment_strict_send'].includes(record.type)) continue;
    if (paymentDestination(record) !== session.destination) continue;
    if (!record.amount || !sameAmount(String(record.amount), session.amount)) continue;
    if (!sameAsset(session, record)) continue;
    const txHash = record.transaction_hash;
    if (!txHash) continue;
    if (!(await transactionMemoMatches(base, txHash, expectedMemo))) continue;
    return {
      transactionHash: txHash,
      payer: paymentSource(record) || undefined,
      paidAt: record.created_at,
    };
  }

  return undefined;
}
