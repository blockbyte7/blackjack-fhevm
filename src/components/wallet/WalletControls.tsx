import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { Copy, Loader2, Power, Wallet, Zap } from 'lucide-react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain
} from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { hasWalletConnect, walletConnectConnector } from '@/lib/wagmi';

export interface WalletPanelConfig {
  walletBalance: string;
  tableStack?: string;
  availableForBet?: string;
  pending?: boolean;
  onBuyChips?: (ethAmount: string) => Promise<boolean>;
  onWithdrawChips?: (chipAmount: string) => Promise<boolean>;
  onClaimFreeChips?: () => Promise<boolean>;
  hasClaimedFreeChips?: boolean;
}

interface WalletControlsProps {
  panel?: WalletPanelConfig;
}

const formatAddress = (address?: string | null) => {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

export const WalletControls = ({ panel }: WalletControlsProps) => {
  const { toast } = useToast();
  const { address, chain, status: accountStatus } = useAccount();
  const {
    connectors,
    connect,
    error: connectError,
    isPending: isConnectPending
  } = useConnect();
  const {
    disconnect,
    isPending: isDisconnectPending
  } = useDisconnect();
  const {
    switchChain,
    isPending: isSwitchPending,
    error: switchError
  } = useSwitchChain();

  const [open, setOpen] = useState(false);
  const [buyValue, setBuyValue] = useState('');
  const [withdrawValue, setWithdrawValue] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  const isConnected = accountStatus === 'connected';
  const isOnSepolia = chain?.id === sepolia.id;
  const connectorMap = useMemo(() => {
    const map = new Map<string, (typeof connectors)[number]>();
    connectors.forEach((connector) => {
      if (connector?.id) {
        map.set(connector.id, connector);
      }
    });
    if (hasWalletConnect && walletConnectConnector && !map.has(walletConnectConnector.id)) {
      map.set(walletConnectConnector.id, walletConnectConnector);
    }
    return map;
  }, [connectors]);

  const orderedConnectors = useMemo(() => {
    const list = Array.from(connectorMap.values());
    list.sort((a, b) => {
      if (a.id === b.id) return 0;
      if (a.id === 'walletConnect') return -1;
      if (b.id === 'walletConnect') return 1;
      if (a.id === 'injected' && b.id !== 'injected') return 1;
      if (b.id === 'injected' && a.id !== 'injected') return -1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [connectorMap]);

  const disablePanelActions = Boolean(panel?.pending || isClaiming);

  const handleConnect = useCallback((connectorId?: string) => {
    const selected = connectorId
      ? connectorMap.get(connectorId)
      : orderedConnectors[0];

    if (!selected) {
      toast({
        title: 'No wallet connector available',
        description: 'Install a browser wallet like MetaMask or use WalletConnect to continue.',
        variant: 'destructive'
      });
      return;
    }

    if (selected.id === 'injected' && !selected.ready) {
      toast({
        title: 'No browser wallet detected',
        description: 'Install MetaMask or choose WalletConnect to link a mobile wallet.',
        variant: 'destructive'
      });
      return;
    }

    connect({ connector: selected });
  }, [connect, connectorMap, orderedConnectors, toast]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setOpen(false);
  }, [disconnect]);

  const handleCopyAddress = useCallback(() => {
    if (!address) return;
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        toast({ title: 'Address copied', description: address });
      })
      .catch(() => {
        toast({
          title: 'Failed to copy address',
          description: 'Select and copy the address manually.',
          variant: 'destructive'
        });
      });
  }, [address, toast]);

  const handleBuySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!panel?.onBuyChips || !buyValue) return;
    await panel.onBuyChips(buyValue);
    setBuyValue('');
  };

  const handleWithdrawSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!panel?.onWithdrawChips || !withdrawValue) return;
    await panel.onWithdrawChips(withdrawValue);
    setWithdrawValue('');
  };

  const handleClaimFreeChips = async () => {
    if (!panel?.onClaimFreeChips) return;
    setIsClaiming(true);
    await panel.onClaimFreeChips();
    setIsClaiming(false);
  };

  const wasConnectedRef = useRef(isConnected);

  useEffect(() => {
    if (!wasConnectedRef.current && isConnected) {
      setOpen(false);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  const wrongNetworkMessage = useMemo(() => {
    if (!isConnected || isOnSepolia) return '';
    if (!switchChain) return 'Switch networks manually in your wallet.';
    return chain?.name ? `Connected to ${chain.name}` : 'Unsupported network';
  }, [chain?.name, isConnected, isOnSepolia, switchChain]);

  const triggerLabel = isConnected ? formatAddress(address) : 'Connect Wallet';
  const showInjectedWarning = orderedConnectors.some(
    (connector) => connector.id === 'injected' && !connector.ready
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          className="gap-2 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
          onClick={() => {
            if (!isConnected) setOpen(true);
          }}
        >
          <Wallet className="h-4 w-4" />
          {triggerLabel || 'Wallet'}
          {isConnected && panel?.walletBalance && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.32em] text-white/75">
              {panel.walletBalance}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4 border border-white/10 bg-slate-950/95 p-4 text-white shadow-xl backdrop-blur" align="end">
        {isConnected ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[0.55rem] uppercase tracking-[0.32em] text-white/45">Connected Wallet</span>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  {formatAddress(address)}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-white/70 hover:text-white" onClick={handleCopyAddress}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Badge variant={isOnSepolia ? 'secondary' : 'destructive'}>
                {isOnSepolia ? chain?.name ?? 'Sepolia' : 'Wrong Network'}
              </Badge>
            </div>

            <div className="space-y-1 text-[0.58rem] uppercase tracking-[0.3em] text-white/45">
              {panel?.walletBalance && (
                <div className="flex items-center justify-between text-sm text-white">
                  <span>Wallet Chips</span>
                  <span className="font-semibold">{panel.walletBalance}</span>
                </div>
              )}
              {panel?.tableStack && (
                <div className="flex items-center justify-between text-sm text-white">
                  <span>Table Stack</span>
                  <span className="font-semibold">{panel.tableStack}</span>
                </div>
              )}
              {/* {panel?.availableForBet && (
                <div className="flex items-center justify-between text-sm text-white">
                  <span>Available</span>
                  <span className="font-semibold">{panel.availableForBet}</span>
                </div>
              )} */}
            </div>

            <Separator className="bg-white/10" />

            <div className="grid gap-3 text-[0.58rem] uppercase tracking-[0.3em] text-white/45">
              <div className="space-y-2">
                <span>Buy Chips</span>
                <form onSubmit={handleBuySubmit} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={buyValue}
                    onChange={(event) => setBuyValue(event.target.value)}
                    placeholder="Buy chips (ETH)"
                    className="bg-black/40 text-white"
                    disabled={!panel?.onBuyChips || disablePanelActions}
                  />
                  <Button type="submit" disabled={!panel?.onBuyChips || disablePanelActions} className="sm:w-auto">
                    {panel?.onBuyChips ? 'Buy' : 'Disabled'}
                  </Button>
                </form>
              </div>

              <div className="space-y-2">
                <span>Withdraw Chips</span>
                <form onSubmit={handleWithdrawSubmit} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={withdrawValue}
                    onChange={(event) => setWithdrawValue(event.target.value)}
                    placeholder="Withdraw chips"
                    className="bg-black/40 text-white"
                    disabled={!panel?.onWithdrawChips || disablePanelActions}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={!panel?.onWithdrawChips || disablePanelActions}
                    className="sm:w-auto"
                  >
                    {panel?.onWithdrawChips ? 'Withdraw' : 'Disabled'}
                  </Button>
                </form>
              </div>
            </div>

            {panel?.onClaimFreeChips && (
              <Button
                onClick={handleClaimFreeChips}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={panel.hasClaimedFreeChips || disablePanelActions}
              >
                {panel.hasClaimedFreeChips ? 'Already Claimed' : isClaiming ? 'Claiming…' : 'Claim Free Chips'}
              </Button>
            )}

            {!isOnSepolia && (
              <Button
                variant="outline"
                className="flex w-full items-center justify-center gap-2 border-amber-300/60 text-amber-200 hover:bg-amber-400/10"
                onClick={() => switchChain?.({ chainId: sepolia.id })}
                disabled={isSwitchPending || !switchChain}
              >
                <Zap className="h-4 w-4" />
                {isSwitchPending ? 'Switching…' : 'Switch to Sepolia'}
              </Button>
            )}

            {(switchError || wrongNetworkMessage) && (
              <p className="text-xs text-amber-300/80">{switchError?.shortMessage || wrongNetworkMessage}</p>
            )}

            <div className="flex justify-end">
              <Button
                variant="ghost"
                className="gap-2 text-white/70 hover:text-red-400"
                onClick={handleDisconnect}
                disabled={isDisconnectPending}
              >
                <Power className="h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1 text-[0.58rem] uppercase tracking-[0.3em] text-white/45">
              <span>Connect Wallet</span>
              <p className="text-sm text-white/70">
                Select a wallet provider to start encrypted blackjack.
              </p>
            </div>
            <div className="grid gap-2">
              {orderedConnectors.map((connector) => (
                <Button
                  key={connector.id}
                  onClick={() => handleConnect(connector.id)}
                  disabled={
                    isConnectPending ||
                    connector.id === undefined ||
                    (connector.id === 'injected' && !connector.ready)
                  }
                  className="justify-start gap-3 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  {isConnectPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  {connector.name}
                </Button>
              ))}
              {!orderedConnectors.length && (
                <Button
                  onClick={() => handleConnect()}
                  disabled={isConnectPending}
                  className="justify-start gap-3 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  {isConnectPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Connect
                </Button>
              )}
            </div>
            {showInjectedWarning && (
              <p className="text-xs text-amber-300/80">
                No injected browser wallet detected. Use WalletConnect to pair a mobile wallet.
              </p>
            )}
            {connectError && (
              <p className="text-xs text-red-400">
                {connectError.shortMessage || connectError.message}
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
