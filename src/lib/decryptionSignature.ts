import type { FhevmInstance } from '@zama-fhe/relayer-sdk/web';
import type { WalletClient, Address } from 'viem';
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

type SignatureContext =
  | { browserProvider: BrowserProvider; walletClient?: never }
  | { browserProvider?: never; walletClient: WalletClient };

export const loadOrCreateSignature = async (
  instance: FhevmInstance,
  contractAddress: `0x${string}`,
  context: SignatureContext
): Promise<StoredDecryptionSignature> => {
  let userAddress: `0x${string}`;
  let signTypedData: (
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    message: Record<string, unknown>
  ) => Promise<string>;

  if ('browserProvider' in context && context.browserProvider) {
    const signer = await context.browserProvider.getSigner();
    userAddress = (await signer.getAddress()) as `0x${string}`;
    signTypedData = (domain, types, message) =>
      signer.signTypedData(
        domain as ethers.TypedDataDomain,
        types as Record<string, ethers.TypedDataField[]>,
        message
      );
  } else if ('walletClient' in context && context.walletClient) {
    const client = context.walletClient;
    let accountAddress: Address | undefined = client.account?.address;
    if (!accountAddress) {
      const addresses = await client.getAddresses();
      accountAddress = addresses[0];
    }
    if (!accountAddress) {
      throw new Error('Wallet client does not have an active account to sign typed data.');
    }
    userAddress = accountAddress as `0x${string}`;
    signTypedData = async (domain, types, message) => {
      const { EIP712Domain, ...viemTypes } = types;
      return client.signTypedData({
        account: accountAddress,
        domain,
        primaryType: 'UserDecryptRequestVerification',
        types: viemTypes,
        message
      }) as unknown as Promise<string>;
    };
  } else {
    throw new Error('No signing context available for FHE decryption.');
  }

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

  const signature = await signTypedData(
    eip712.domain as Record<string, unknown>,
    eip712.types as Record<string, Array<{ name: string; type: string }>>,
    eip712.message as Record<string, unknown>
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
