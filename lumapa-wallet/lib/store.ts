import { DEFAULT_NETWORKS, FUTURENET_CUSTOM_PRESET } from './networks';
import type { StoredAccount, VaultState } from './types';

const STORAGE_KEY = 'lumapa-wallet-state-v1';

export function createDefaultState(): VaultState {
  return {
    version: 1,
    networks: DEFAULT_NETWORKS,
    accounts: [],
    activeNetworkId: 'lumapa',
    autoLockMinutes: 5
  };
}

export function loadState(): VaultState {
  if (typeof window === 'undefined') return createDefaultState();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultState();
  try {
    const parsed = JSON.parse(raw) as VaultState;
    const accounts = (parsed.accounts ?? []).map((account) => (
      account.networkId === 'futurenet' ? { ...account, networkId: FUTURENET_CUSTOM_PRESET.id } : account
    ));
    const networks = [...DEFAULT_NETWORKS];
    let shouldAddFuturenetPreset = accounts.some((account) => account.networkId === FUTURENET_CUSTOM_PRESET.id);

    for (const network of parsed.networks ?? []) {
      if (network.id === 'futurenet') {
        shouldAddFuturenetPreset = true;
        continue;
      }
      if (!networks.some((n) => n.id === network.id)) networks.push(network);
    }

    if (shouldAddFuturenetPreset && !networks.some((n) => n.id === FUTURENET_CUSTOM_PRESET.id)) {
      networks.push(FUTURENET_CUSTOM_PRESET);
    }

    const activeNetworkId = parsed.activeNetworkId === 'futurenet' ? FUTURENET_CUSTOM_PRESET.id : parsed.activeNetworkId;
    return {
      ...createDefaultState(),
      ...parsed,
      accounts,
      networks,
      activeNetworkId: networks.some((network) => network.id === activeNetworkId) ? activeNetworkId : createDefaultState().activeNetworkId
    };
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: VaultState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function shortKey(key: string) {
  if (!key) return '';
  return `${key.slice(0, 5)}…${key.slice(-5)}`;
}

export function addOrReplaceAccount(state: VaultState, account: StoredAccount): VaultState {
  const accounts = state.accounts.filter((a) => !(a.publicKey === account.publicKey && a.networkId === account.networkId));
  accounts.push(account);
  return { ...state, accounts, activeAccountId: account.id };
}
