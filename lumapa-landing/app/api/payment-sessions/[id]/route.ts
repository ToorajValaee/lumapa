import { NextResponse } from 'next/server';
import { getPaymentSession } from '@/lib/paymentSessions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getPaymentSession(id);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  return NextResponse.json(session, { headers: corsHeaders });
}
