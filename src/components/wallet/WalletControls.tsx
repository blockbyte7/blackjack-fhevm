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
  const primaryConnector = useMemo(
    () => connectors.find((connector) => connector.ready) ?? connectors[0],
    [connectors]
  );

  const disablePanelActions = Boolean(panel?.pending || isClaiming);

  const handleConnect = useCallback((connectorId?: string) => {
    const connector = connectorId
      ? connectors.find((item) => item.id === connectorId)
      : primaryConnector;

    if (!connector) {
      toast({
        title: 'No wallet connector available',
        description: 'Install a browser wallet like MetaMask to connect.',
        variant: 'destructive'
      });
      return;
    }

    connect({ connector });
  }, [connect, connectors, primaryConnector, toast]);

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
              {connectors.map((connector) => (
                <Button
                  key={connector.id}
                  onClick={() => handleConnect(connector.id)}
                  disabled={isConnectPending || connector.id === undefined}
                  className="justify-start gap-3 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  {isConnectPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  {connector.name}
                </Button>
              ))}
              {!connectors.length && (
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
