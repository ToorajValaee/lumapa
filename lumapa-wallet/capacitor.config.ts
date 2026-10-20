import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.lumapa.wallet',
  appName: 'Lumapa Wallet',
  webDir: 'out',
  server: {
    // For production native builds, point this to your hosted wallet.
    // url: 'https://app.lumapa.ir',
    cleartext: false,
  },
};

export default config;
