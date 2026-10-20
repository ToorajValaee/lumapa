import { NextRequest, NextResponse } from 'next/server';
import { Keypair, Operation, Networks, TransactionBuilder, BASE_FEE, Horizon } from '@stellar/stellar-sdk';

async function getNetworkPassphrase(horizonUrl: string) {
  if (process.env.LUMAPA_NETWORK_PASSPHRASE) return process.env.LUMAPA_NETWORK_PASSPHRASE;
  const response = await fetch(horizonUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Could not read Lumapa Horizon network passphrase: ${response.status}`);
  const json = await response.json();
  const passphrase = json.network_passphrase || json.networkPassphrase || Networks.PUBLIC;
  if (!passphrase) throw new Error('LUMAPA_NETWORK_PASSPHRASE is missing and Horizon did not expose network_passphrase.');
  return passphrase;
}

function getHorizonUrl() {
  return process.env.LUMAPA_HORIZON_URL || process.env.NEXT_PUBLIC_LUMAPA_HORIZON_URL || 'https://horizon.badje.ir';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { publicKey?: string } | null;
    const publicKey = body?.publicKey?.trim();
    if (!publicKey || !publicKey.startsWith('G')) {
      return NextResponse.json({ error: 'A valid destination public key is required.' }, { status: 400 });
    }
    const sourceSecret = process.env.LUMAPA_STARTER_SECRET;
    if (!sourceSecret) {
      return NextResponse.json({ error: 'LUMAPA_STARTER_SECRET is not configured on the server.' }, { status: 500 });
    }
    const horizonUrl = getHorizonUrl();
    const startingBalance = process.env.LUMAPA_STARTING_BALANCE || '10';
    const networkPassphrase = await getNetworkPassphrase(horizonUrl);
    const server = new Horizon.Server(horizonUrl);
    const source = Keypair.fromSecret(sourceSecret);
    const account = await server.loadAccount(source.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase
    })
      .addOperation(Operation.createAccount({ destination: publicKey, startingBalance }))
      .setTimeout(60)
      .build();
    transaction.sign(source);
    const result = await server.submitTransaction(transaction);
    return NextResponse.json({ hash: result.hash, successful: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create Lumapa account.' }, { status: 500 });
  }
}
