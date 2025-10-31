import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const walletConnectMetadata = {
  name: 'CipherJack Blackjack',
  description: 'Encrypted blackjack powered by FHEVM.',
  url: 'https://cipherjack.app',
  icons: ['https://cipherjack.app/icon.png']
} as const;

const connectors = [
  injected({
    shimDisconnect: true
  })
];

if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      metadata: walletConnectMetadata,
      showQrModal: true
    })
  );
}

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
  transports: {
    [sepolia.id]: sepoliaRpcUrl ? http(sepoliaRpcUrl) : http()
  },
  ssr: false
});

export const supportedChains = [sepolia];
