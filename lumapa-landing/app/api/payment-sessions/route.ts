import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPaymentSession, listPaymentSessions } from '@/lib/paymentSessions';

const blankToUndefined = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return value;
};

const OptionalString = (max = 2048) => z.preprocess(blankToUndefined, z.string().max(max).optional());
const OptionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const OptionalIssuer = z.preprocess(
  blankToUndefined,
  z.string().regex(/^G[A-Z2-7]{55}$/, 'Issuer must be a Stellar public key or empty.').optional(),
);
const ExpiryInput = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), 'Invalid datetime')
    .optional(),
);

const SessionInput = z.object({
  merchantId: z.string().min(1).transform((value) => value.trim()),
  orderId: z.string().min(1).transform((value) => value.trim()),
  network: z.string().min(1).default('public').transform((value) => value.trim()),
  networkName: OptionalString(120),
  horizonUrl: OptionalUrl,
  networkPassphrase: OptionalString(512),
  nativeAssetCode: OptionalString(12).transform((value) => value?.toUpperCase()),
  destination: z.string().regex(/^G[A-Z2-7]{55}$/, 'Destination must be a Stellar public key.'),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/),
  assetCode: z.string().min(1).max(12).default('XLM').transform((value) => value.trim().toUpperCase()),
  issuer: OptionalIssuer,
  memo: OptionalString(28),
  expiresAt: ExpiryInput,
  // The callback URL is optional and not required for QR/SEP-7 checkout. Some shop platforms
  // generate callback URLs differently in local/staging, so it must not block QR creation.
  callbackUrl: OptionalString(2048),
  returnUrl: OptionalString(2048),
});

export async function GET() {
  return NextResponse.json({ sessions: await listPaymentSessions() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = SessionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt).toISOString() : new Date(Date.now() + 15 * 60_000).toISOString();
  const session = await createPaymentSession({
    ...data,
    expiresAt,
    issuer: data.issuer || undefined,
    callbackUrl: data.callbackUrl || undefined,
    returnUrl: data.returnUrl || undefined,
    horizonUrl: data.horizonUrl || undefined,
  });
  return NextResponse.json(session, { status: 201 });
}
