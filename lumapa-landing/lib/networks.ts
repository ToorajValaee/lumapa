import { Networks } from '@stellar/stellar-sdk';
import type { NetworkProfile } from './types';

export const LUMAPA_NETWORK_ID = 'lumapa';

export const LUMAPA_NETWORK: NetworkProfile = {
  id: LUMAPA_NETWORK_ID,
  name: 'Lumapa Network',
  horizonUrl: process.env.NEXT_PUBLIC_LUMAPA_HORIZON_URL || 'https://horizon.badje.ir',
  networkPassphrase: process.env.NEXT_PUBLIC_LUMAPA_NETWORK_PASSPHRASE || 'Lumapa Network ; July 2026',
  nativeAssetSymbol: process.env.NEXT_PUBLIC_LUMAPA_NATIVE_SYMBOL || 'BADJ',
  nativeAssetDisplayName: process.env.NEXT_PUBLIC_LUMAPA_NATIVE_NAME || 'Lumapa native',
  explorerUrl: process.env.NEXT_PUBLIC_LUMAPA_EXPLORER_URL || undefined,
  isCustom: false
};

export const DEFAULT_NETWORKS: NetworkProfile[] = [
  LUMAPA_NETWORK,
  {
    id: 'public',
    name: 'Stellar Mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    networkPassphrase: Networks.PUBLIC,
    nativeAssetSymbol: 'XLM',
    nativeAssetDisplayName: 'Lumen',
    explorerUrl: 'https://stellar.expert/explorer/public'
  },
  {
    id: 'testnet',
    name: 'Stellar Testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    nativeAssetSymbol: 'XLM',
    nativeAssetDisplayName: 'Test Lumen',
    explorerUrl: 'https://stellar.expert/explorer/testnet',
    friendbotUrl: 'https://friendbot.stellar.org'
  }
];

export const FUTURENET_CUSTOM_PRESET: NetworkProfile = {
  id: 'custom-futurenet',
  name: 'Stellar Futurenet (custom)',
  horizonUrl: 'https://horizon-futurenet.stellar.org',
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  networkPassphrase: 'Test SDF Future Network ; October 2022',
  nativeAssetSymbol: 'XLM',
  nativeAssetDisplayName: 'Future Lumen',
  explorerUrl: 'https://stellar.expert/explorer/futurenet',
  friendbotUrl: 'https://friendbot-futurenet.stellar.org',
  isCustom: true
};

export async function loadNetworkFromRpc(rpcUrl: string): Promise<Partial<NetworkProfile>> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getNetwork' })
  });
  if (!res.ok) throw new Error(`RPC getNetwork failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'RPC getNetwork returned an error');
  const result = json.result ?? {};
  return {
    networkPassphrase: result.passphrase,
    friendbotUrl: result.friendbotUrl
  };
}

export async function loadNetworkFromHorizon(horizonUrl: string): Promise<Partial<NetworkProfile>> {
  const base = horizonUrl.replace(/\/+$/, '');
  const res = await fetch(base, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Horizon root failed: ${res.status}`);
  const json = await res.json();
  const networkPassphrase = json.network_passphrase ?? json.networkPassphrase;
  if (!networkPassphrase) throw new Error('This Horizon endpoint did not expose network_passphrase. Enter the passphrase manually.');
  return { networkPassphrase };
}
