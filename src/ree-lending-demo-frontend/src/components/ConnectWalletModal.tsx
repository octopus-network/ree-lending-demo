import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Info, Loader2 } from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { WALLETS } from "@/lib/constants";
import {
  useLaserEyes,
  UNISAT,
  XVERSE,
  MAGIC_EDEN,
  ProviderType,
} from "@omnisat/lasereyes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function WalletRow({
  wallet,
  onConnected,
}: {
  wallet: string;
  onConnected: (wallet: string) => void;
}) {
  const {
    connect,
    isConnecting,
    hasOkx,
    hasUnisat,
    hasPhantom,
    hasXverse,
    hasMagicEden,
  } = useLaserEyes(
    ({
      connect,
      isConnecting,
      hasOkx,
      hasUnisat,
      hasPhantom,
      hasXverse,
      hasMagicEden,
    }) => ({
      connect,
      isConnecting,
      hasOkx,
      hasUnisat,
      hasPhantom,
      hasXverse,
      hasMagicEden,
    })
  );

  const [connectingWallet, setConnectingWallet] = useState<string>();

  const installed = useMemo(() => {
    const hasInstalled: Record<string, boolean> = {
      [UNISAT]: hasUnisat,
      [MAGIC_EDEN]: hasMagicEden,
      [XVERSE]: hasXverse,
    };

    return hasInstalled[wallet];
  }, [wallet, hasXverse, hasOkx, hasUnisat, hasPhantom, hasMagicEden]);

  const onConnectWallet = useCallback(async () => {
    if (!installed) {
      window.open(WALLETS[wallet].url, "_blank");
      return;
    }
    setConnectingWallet(wallet);

    try {
      await connect(wallet as ProviderType);

      setConnectingWallet(undefined);
      onConnected(wallet);
    } catch (err) {
      console.log(err);
      setConnectingWallet(undefined);
    }
  }, [setConnectingWallet, connect, wallet, installed, onConnected]);

  return (
    <div
      className={cn(
        "flex items-center justify-between bg-secondary/70 hover:bg-secondary px-3 py-2 cursor-pointer first:rounded-t-lg last:rounded-b-lg",
        isConnecting &&
          connectingWallet !== wallet &&
          "pointer-events-none opacity-50"
      )}
      onClick={onConnectWallet}
    >
      <div className="flex items-center">
        <div className="size-10 flex items-center justify-center">
          {connectingWallet === wallet ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <img
              src={WALLETS[wallet].icon}
              className="size-8 rounded-lg"
              alt={WALLETS[wallet].name}
              width={64}
              height={64}
            />
          )}
        </div>
        <span className="font-semibold text-lg ml-2">
          {WALLETS[wallet].name}
        </span>
      </div>
      {installed && (
        <span className="text-muted-foreground/80 text-xs">Detected</span>
      )}
    </div>
  );
}

export function ConnectWalletModal({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const onConnected = (wallet: string) => {
    toast(`Connected with ${WALLETS[wallet].name}`);
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
        </DialogHeader>
        <div>
          <div className="flex flex-col mt-3 gap-1">
            {Object.keys(WALLETS).map((wallet) => (
              <WalletRow
                wallet={wallet}
                key={wallet}
                onConnected={onConnected}
              />
            ))}
          </div>
          <div className="text-xs text-muted-foreground flex items-center mt-4">
            <Info className="size-4 mr-2" /> To use REE Lending, you need to
            connect a wallet
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
