export type NetworkProfile = {
  id: string;
  name: string;
  horizonUrl: string;
  rpcUrl?: string;
  networkPassphrase: string;
  nativeAssetSymbol: string;
  nativeAssetDisplayName: string;
  explorerUrl?: string;
  friendbotUrl?: string;
  isCustom?: boolean;
  walletConnectChainId?: string;
};

export type StoredAccount = {
  id: string;
  label: string;
  publicKey: string;
  networkId: string;
  derivationPath?: string;
  encryptedSecret?: string;
  encryptedMnemonic?: string;
  importedBy: 'mnemonic' | 'secret';
  createdAt: string;
  isMultisig?: boolean;
};

export type VaultState = {
  version: 1;
  networks: NetworkProfile[];
  accounts: StoredAccount[];
  activeNetworkId: string;
  activeAccountId?: string;
  webAuthnEnabled?: boolean;
  webAuthnCredentialId?: string;
  deviceVaultKey?: string;
  vaultMode?: 'passcode' | 'webauthn-device-key';
  autoLockMinutes: number;
};

export type AssetBalance = {
  code: string;
  issuer?: string;
  balance: string;
  limit?: string;
  isNative: boolean;
};

export type TxHistoryItem = {
  id: string;
  createdAt: string;
  type: string;
  asset: string;
  amount?: string;
  from?: string;
  to?: string;
  transactionHash?: string;
};

export type PaymentSession = {
  id: string;
  merchantId: string;
  orderId: string;
  network: string;
  networkName?: string;
  horizonUrl?: string;
  networkPassphrase?: string;
  nativeAssetCode?: string;
  destination: string;
  amount: string;
  assetCode: string;
  issuer?: string;
  memo?: string;
  expiresAt: string;
  callbackUrl?: string;
  returnUrl?: string;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  stellarUri: string;
  createdAt: string;
  paidAt?: string;
  transactionHash?: string;
  payer?: string;
  statusMessage?: string;
};
