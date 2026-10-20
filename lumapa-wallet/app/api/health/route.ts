import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, app: 'lumapa-wallet', poweredBy: 'badje.ir' });
}
