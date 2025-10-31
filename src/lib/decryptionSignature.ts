import type { FhevmInstance } from '@zama-fhe/relayer-sdk/web';
import { BrowserProvider, ethers } from 'ethers';

export type StoredDecryptionSignature = {
  publicKey: string;
  privateKey: string;
  signature: string;
  userAddress: `0x${string}`;
  contractAddresses: `0x${string}`[];
  startTimestamp: number;
  durationDays: number;
};

const STORAGE_PREFIX = 'fhevm-blackjack-signature';
const ONE_DAY_SECONDS = 24 * 60 * 60;

const memoryStore = new Map<string, string>();

type StorageProvider = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const resolveStorage = (): StorageProvider => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key) => memoryStore.get(key) ?? null,
    setItem: (key, value) => {
      memoryStore.set(key, value);
    },
    removeItem: (key) => {
      memoryStore.delete(key);
    }
  };
};

const signatureStorageKey = (userAddress: string, contractAddress: string) =>
  `${STORAGE_PREFIX}:${userAddress.toLowerCase()}:${contractAddress.toLowerCase()}`;

const isSignatureValid = (signature: StoredDecryptionSignature): boolean => {
  const expiresAt = signature.startTimestamp + signature.durationDays * ONE_DAY_SECONDS;
  return Math.floor(Date.now() / 1000) < expiresAt;
};

export const loadOrCreateSignature = async (
  instance: FhevmInstance,
  contractAddress: `0x${string}`,
  provider: BrowserProvider
): Promise<StoredDecryptionSignature> => {
  const signer = await provider.getSigner();
  const userAddress = (await signer.getAddress()) as `0x${string}`;
  const storage = resolveStorage();
  const storageKey = signatureStorageKey(userAddress, contractAddress);

  const cached = storage.getItem(storageKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as StoredDecryptionSignature;
      if (
        parsed.userAddress.toLowerCase() === userAddress.toLowerCase() &&
        parsed.contractAddresses[0]?.toLowerCase() === contractAddress.toLowerCase() &&
        isSignatureValid(parsed)
      ) {
        return parsed;
      }
      storage.removeItem(storageKey);
    } catch {
      storage.removeItem(storageKey);
    }
  }

  const { publicKey, privateKey } = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const durationDays = 365;
  const contractAddresses = [contractAddress];

  const eip712 = instance.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);

  const signature = await signer.signTypedData(
    eip712.domain as ethers.TypedDataDomain,
    {
      UserDecryptRequestVerification:
        eip712.types.UserDecryptRequestVerification as ethers.TypedDataField[]
    },
    eip712.message
  );

  const record: StoredDecryptionSignature = {
    publicKey,
    privateKey,
    signature,
    userAddress,
    contractAddresses,
    startTimestamp,
    durationDays
  };

  try {
    storage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // ignore persistence errors (private browsing, storage quotas)
  }

  return record;
};
