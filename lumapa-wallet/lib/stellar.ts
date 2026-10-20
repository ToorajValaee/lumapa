import { Buffer } from 'buffer';
import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import type { AssetBalance, NetworkProfile, TxHistoryItem } from './types';

/** Prevent accidentally using Stellar's Ed25519 signer on an unverified custom fork. */
export function assertStandardStellarSigning(network: NetworkProfile) {
  if (network.accountKeyAlgorithm === 'secp256k1') {
    throw new Error('This network requires a fork-specific secp256k1 signing adapter. Standard Stellar XDR signing is disabled until the fork format is verified.');
  }
}

export function horizonServer(network: NetworkProfile) {
  return new Horizon.Server(network.horizonUrl, { allowHttp: network.horizonUrl.startsWith('http://') });
}

export function nativeAssetLabel(network: NetworkProfile) {
  return `${network.nativeAssetSymbol || 'XLM'} native`;
}

export function parseAsset(code: string, issuer?: string, nativeSymbol?: string) {
  const normalizedCode = code.trim();
  const normalizedNative = nativeSymbol?.trim().toUpperCase();
  if (!normalizedCode || normalizedCode.toUpperCase() === 'XLM' || normalizedCode.toLowerCase() === 'native' || (normalizedNative && normalizedCode.toUpperCase() === normalizedNative)) return Asset.native();
  if (!issuer) throw new Error('Issuer is required for issued assets.');
  return new Asset(code.trim().toUpperCase(), issuer.trim());
}

export async function fetchBalances(network: NetworkProfile, publicKey: string): Promise<AssetBalance[]> {
  const server = horizonServer(network);
  const account = await server.loadAccount(publicKey);
  return account.balances.map((balance: Horizon.HorizonApi.BalanceLine) => {
    if (balance.asset_type === 'native') {
      return {
        code: network.nativeAssetSymbol || 'XLM',
        balance: balance.balance,
        isNative: true
      };
    }
    return {
      code: 'asset_code' in balance ? balance.asset_code : 'UNKNOWN',
      issuer: 'asset_issuer' in balance ? balance.asset_issuer : undefined,
      balance: balance.balance,
      limit: 'limit' in balance ? balance.limit : undefined,
      isNative: false
    };
  });
}

export async function fundWithFriendbot(network: NetworkProfile, publicKey: string) {
  if (!network.friendbotUrl) throw new Error('This network has no Friendbot URL configured.');
  const url = `${network.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Friendbot failed: ${res.status}`);
  return res.json();
}

export async function fetchHistory(network: NetworkProfile, publicKey: string): Promise<TxHistoryItem[]> {
  const server = horizonServer(network);
  const payments = await server.payments().forAccount(publicKey).order('desc').limit(30).call();
  return payments.records.map((record: any) => ({
    id: record.id,
    createdAt: record.created_at,
    type: record.type,
    asset: record.type === 'payment' && record.asset_type === 'native'
      ? network.nativeAssetSymbol
      : record.type === 'payment'
        ? record.asset_code ?? 'asset'
        : record.type,
    amount: 'amount' in record ? record.amount : undefined,
    from: 'from' in record ? record.from : undefined,
    to: 'to' in record ? record.to : undefined,
    transactionHash: record.transaction_hash
  }));
}

export async function sendPayment(input: {
  network: NetworkProfile;
  sourceSecret: string;
  destination: string;
  amount: string;
  assetCode: string;
  issuer?: string;
  memo?: string;
}) {
  assertStandardStellarSigning(input.network);
  const source = Keypair.fromSecret(input.sourceSecret.trim());
  const server = horizonServer(input.network);
  const account = await server.loadAccount(source.publicKey());
  const fee = String(await server.fetchBaseFee());
  let builder = new TransactionBuilder(account, {
    fee,
    networkPassphrase: input.network.networkPassphrase || Networks.PUBLIC
  }).addOperation(
    Operation.payment({
      destination: input.destination.trim(),
      asset: parseAsset(input.assetCode, input.issuer, input.network.nativeAssetSymbol),
      amount: input.amount.trim()
    })
  );
  if (input.memo?.trim()) builder = builder.addMemo(Memo.text(input.memo.trim().slice(0, 28)));
  const tx = builder.setTimeout(90).build();
  tx.sign(source);
  return server.submitTransaction(tx);
}

export async function changeTrust(input: {
  network: NetworkProfile;
  sourceSecret: string;
  assetCode: string;
  issuer: string;
  limit?: string;
}) {
  assertStandardStellarSigning(input.network);
  const source = Keypair.fromSecret(input.sourceSecret.trim());
  const server = horizonServer(input.network);
  const account = await server.loadAccount(source.publicKey());
  const fee = String(await server.fetchBaseFee());
  const tx = new TransactionBuilder(account, {
    fee,
    networkPassphrase: input.network.networkPassphrase
  })
    .addOperation(
      Operation.changeTrust({
        asset: parseAsset(input.assetCode, input.issuer, input.network.nativeAssetSymbol),
        limit: input.limit?.trim() || undefined
      })
    )
    .setTimeout(90)
    .build();
  tx.sign(source);
  return server.submitTransaction(tx);
}

export async function setHomeDomain(input: {
  network: NetworkProfile;
  sourceSecret: string;
  homeDomain: string;
}) {
  assertStandardStellarSigning(input.network);
  const source = Keypair.fromSecret(input.sourceSecret.trim());
  const server = horizonServer(input.network);
  const account = await server.loadAccount(source.publicKey());
  const fee = String(await server.fetchBaseFee());
  const tx = new TransactionBuilder(account, { fee, networkPassphrase: input.network.networkPassphrase })
    .addOperation(Operation.setOptions({ homeDomain: input.homeDomain.trim() }))
    .setTimeout(90)
    .build();
  tx.sign(source);
  return server.submitTransaction(tx);
}

export async function manageData(input: {
  network: NetworkProfile;
  sourceSecret: string;
  name: string;
  value?: string;
}) {
  assertStandardStellarSigning(input.network);
  const source = Keypair.fromSecret(input.sourceSecret.trim());
  const server = horizonServer(input.network);
  const account = await server.loadAccount(source.publicKey());
  const fee = String(await server.fetchBaseFee());
  const tx = new TransactionBuilder(account, { fee, networkPassphrase: input.network.networkPassphrase })
    .addOperation(Operation.manageData({ name: input.name.trim(), value: input.value ? Buffer.from(input.value) : null }))
    .setTimeout(90)
    .build();
  tx.sign(source);
  return server.submitTransaction(tx);
}

export async function addSigner(input: {
  network: NetworkProfile;
  sourceSecret: string;
  signerPublicKey: string;
  weight: number;
  lowThreshold?: number;
  medThreshold?: number;
  highThreshold?: number;
}) {
  assertStandardStellarSigning(input.network);
  const source = Keypair.fromSecret(input.sourceSecret.trim());
  const server = horizonServer(input.network);
  const account = await server.loadAccount(source.publicKey());
  const fee = String(await server.fetchBaseFee());
  const tx = new TransactionBuilder(account, { fee, networkPassphrase: input.network.networkPassphrase })
    .addOperation(Operation.setOptions({
      signer: { ed25519PublicKey: input.signerPublicKey.trim(), weight: input.weight },
      lowThreshold: input.lowThreshold,
      medThreshold: input.medThreshold,
      highThreshold: input.highThreshold
    }))
    .setTimeout(90)
    .build();
  tx.sign(source);
  return server.submitTransaction(tx);
}

export async function buildUnsignedPaymentXdr(input: {
  network: NetworkProfile;
  sourcePublicKey: string;
  destination: string;
  amount: string;
  assetCode: string;
  issuer?: string;
  memo?: string;
}) {
  assertStandardStellarSigning(input.network);
  const server = horizonServer(input.network);
  const account = await server.loadAccount(input.sourcePublicKey);
  const fee = String(await server.fetchBaseFee());
  let builder = new TransactionBuilder(account, { fee, networkPassphrase: input.network.networkPassphrase })
    .addOperation(Operation.payment({
      destination: input.destination.trim(),
      asset: parseAsset(input.assetCode, input.issuer, input.network.nativeAssetSymbol),
      amount: input.amount.trim()
    }));
  if (input.memo?.trim()) builder = builder.addMemo(Memo.text(input.memo.trim().slice(0, 28)));
  return builder.setTimeout(90).build().toXDR();
}

export function signXdr(input: { xdrEnvelope: string; networkPassphrase: string; secret: string }) {
  const tx = TransactionBuilder.fromXDR(input.xdrEnvelope, input.networkPassphrase);
  tx.sign(Keypair.fromSecret(input.secret.trim()));
  return tx.toXDR();
}

export async function submitSignedXdr(network: NetworkProfile, xdrEnvelope: string) {
  assertStandardStellarSigning(network);
  const tx = TransactionBuilder.fromXDR(xdrEnvelope, network.networkPassphrase);
  return horizonServer(network).submitTransaction(tx);
}

export function inspectXdr(xdrEnvelope: string, networkPassphrase: string) {
  const tx = TransactionBuilder.fromXDR(xdrEnvelope, networkPassphrase);
  const anyTx = tx as any;
  return {
    source: anyTx.source ?? anyTx.innerTransaction?.source ?? 'fee-bump',
    fee: anyTx.fee,
    sequence: anyTx.sequence ?? 'n/a',
    signatures: anyTx.signatures?.length ?? 0,
    operations: (anyTx.operations ?? anyTx.innerTransaction?.operations ?? []).map((op: any) => op.type),
    hash: anyTx.hash().toString('hex'),
    envelopeType: xdr.EnvelopeType.envelopeTypeTx().name
  };
}
