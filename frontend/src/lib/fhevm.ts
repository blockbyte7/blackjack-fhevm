import { initSDK, createInstance, type FhevmInstance } from '@zama-fhe/relayer-sdk/web';
import { BrowserProvider, ethers } from 'ethers';

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_FHE_TARGET_CHAIN_ID ?? 11155111);
const GATEWAY_CHAIN_ID = Number(import.meta.env.VITE_FHE_GATEWAY_CHAIN_ID ?? 10901);
const RELAYER_URL = import.meta.env.VITE_FHE_RELAYER_URL ?? '';
const RPC_URL = import.meta.env.VITE_FHE_RPC_URL ?? '';
const ACL_CONTRACT_ADDRESS = import.meta.env.VITE_FHE_ACL_ADDRESS ?? '';
const KMS_CONTRACT_ADDRESS = import.meta.env.VITE_FHE_KMS_ADDRESS ?? '';
const INPUT_VERIFIER_CONTRACT_ADDRESS = import.meta.env.VITE_FHE_INPUT_VERIFIER_ADDRESS ?? '';
const INPUT_VERIFICATION_CONTRACT_ADDRESS = import.meta.env.VITE_FHE_INPUT_VERIFICATION_ADDRESS ?? '';
const DECRYPTION_ORACLE_ADDRESS = import.meta.env.VITE_FHE_DECRYPTION_ORACLE_ADDRESS ?? '';

export const BLACKJACK_CONTRACT_ADDRESS = import.meta.env.VITE_BLACKJACK_CONTRACT ?? '';

let instance: FhevmInstance | null = null;
let instancePromise: Promise<FhevmInstance> | null = null;

const ensureConfigured = () => {
  if (!ethers.isAddress(ACL_CONTRACT_ADDRESS)) {
    throw new Error('VITE_FHE_ACL_ADDRESS env var is missing or invalid.');
  }
  if (!ethers.isAddress(KMS_CONTRACT_ADDRESS)) {
    throw new Error('VITE_FHE_KMS_ADDRESS env var is missing or invalid.');
  }
  if (!ethers.isAddress(INPUT_VERIFIER_CONTRACT_ADDRESS)) {
    throw new Error('VITE_FHE_INPUT_VERIFIER_ADDRESS env var is missing or invalid.');
  }
  if (!ethers.isAddress(INPUT_VERIFICATION_CONTRACT_ADDRESS)) {
    throw new Error('VITE_FHE_INPUT_VERIFICATION_ADDRESS env var is missing or invalid.');
  }
  if (!ethers.isAddress(DECRYPTION_ORACLE_ADDRESS)) {
    throw new Error('VITE_FHE_DECRYPTION_ORACLE_ADDRESS env var is missing or invalid.');
  }
  if (!RELAYER_URL) {
    throw new Error('VITE_FHE_RELAYER_URL env var is required.');
  }
  if (!RPC_URL) {
    throw new Error('VITE_FHE_RPC_URL env var is required.');
  }
};

export const ensureFhevmInstance = async (): Promise<FhevmInstance> => {
  if (instance) return instance;
  if (instancePromise) return instancePromise;

  ensureConfigured();

  instancePromise = (async () => {
    await initSDK({ thread: 0 });
    const created = await createInstance({
      aclContractAddress: ACL_CONTRACT_ADDRESS,
      kmsContractAddress: KMS_CONTRACT_ADDRESS,
      inputVerifierContractAddress: INPUT_VERIFIER_CONTRACT_ADDRESS,
      verifyingContractAddressDecryption: DECRYPTION_ORACLE_ADDRESS,
      verifyingContractAddressInputVerification: INPUT_VERIFICATION_CONTRACT_ADDRESS,
      gatewayChainId: GATEWAY_CHAIN_ID,
      chainId: TARGET_CHAIN_ID,
      relayerUrl: RELAYER_URL,
      network: RPC_URL
    });
    instance = created;
    return created;
  })().catch((error) => {
    instancePromise = null;
    throw error;
  });

  return instancePromise;
};

export const getBrowserProvider = async (): Promise<BrowserProvider> => {
  const { ethereum } = window as typeof window & { ethereum?: ethers.Eip1193Provider };
  if (!ethereum) {
    throw new Error('A browser wallet is required for card decryption.');
  }
  return new BrowserProvider(ethereum);
};

export const hexlifyHandle = (value: string): string => ethers.hexlify(value as `0x${string}`);
