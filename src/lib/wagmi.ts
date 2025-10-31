import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import type { Connector } from 'wagmi';

const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const walletConnectMetadata = {
  name: 'CipherJack Blackjack',
  description: 'Encrypted blackjack powered by FHEVM.',
  url: 'https://cipherjack.app',
  icons: ['https://cipherjack.app/icon.png'],
  redirect: {
    native: 'cipherjack://',
    universal: 'https://cipherjack.app'
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
        explorerRecommendedWalletIds: [
          'eip155:1:rainbow',
          'eip155:1:zerion',
          'eip155:1:coinbase',
          'eip155:1:metamask'
        ],
        mobileWallets: [
          {
            id: 'rainbow',
            name: 'Rainbow',
            links: {
              native: 'rainbow://wc',
              universal: 'https://rnbwapp.com/wc'
            }
          },
          {
            id: 'zerion',
            name: 'Zerion',
            links: {
              native: 'zerion://wc',
              universal: 'https://wallet.zerion.io/wallet-connect'
            }
          },
          {
            id: 'metamask',
            name: 'MetaMask',
            links: {
              native: 'metamask://',
              universal: 'https://metamask.app.link'
            }
          },
          {
            id: 'coinbase',
            name: 'Coinbase Wallet',
            links: {
              native: 'cbwallet://wc',
              universal: 'https://wallet.coinbase.com/wallet-connect'
            }
          }
        ],
        desktopWallets: [
          {
            id: 'metamask',
            name: 'MetaMask',
            links: {
              native: 'metamask://',
              universal: 'https://metamask.io/download/'
            }
          },
          {
            id: 'zerion',
            name: 'Zerion',
            links: {
              native: 'zerion://wc',
              universal: 'https://wallet.zerion.io/wallet-connect'
            }
          }
        ]
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
