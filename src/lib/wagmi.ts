import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import type { Connector } from 'wagmi';

const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const walletConnectMetadata = {
  name: 'CipherJack Blackjack',
  description: 'Encrypted blackjack powered by FHEVM.',
  url: 'https://cipherjack.xyz',
  icons: ['https://cipherjack.xyz/assets/cipherjack-logo-DyVLB6l4.jpeg'],
  redirect: {
    native: 'cipherjack://',
    universal: 'https://cipherjack.xyz'
  }
} as const;

export const injectedConnector = injected({
  shimDisconnect: true
});

export const walletConnectConnector = walletConnectProjectId
  ? walletConnect({
      projectId: walletConnectProjectId,
      metadata: walletConnectMetadata,
      showQrModal: true,
      qrModalOptions: {
        themeMode: 'dark',
        enableExplorer: true,
        explorerRecommendedWalletIds: 'NONE'
      }
    })
  : null;

const configuredConnectors: readonly Connector[] = [
  injectedConnector,
  ...(walletConnectConnector ? [walletConnectConnector] : [])
];

export const hasWalletConnect = Boolean(walletConnectConnector);

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: configuredConnectors,
  transports: {
    [sepolia.id]: sepoliaRpcUrl ? http(sepoliaRpcUrl) : http()
  },
  ssr: false
});

export const supportedChains = [sepolia];
