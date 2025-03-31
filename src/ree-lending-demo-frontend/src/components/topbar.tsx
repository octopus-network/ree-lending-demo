import { Button } from "./ui/button";
import { useState } from "react";
import { ConnectWalletModal } from "./ConnectWalletModal";
import { useLaserEyes } from "@omnisat/lasereyes";
import { ellipseMiddle } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Topbar() {
  const [connectWalletModalOpen, setConnectWalletModalOpen] = useState(false);
  const { address, disconnect, isInitializing } = useLaserEyes();

  const onDisconnect = () => {
    disconnect();
  };

  return (
    <>
      <div className="bg-card border-b">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center">
            <img src="/logo.png" alt="REE" width={256} className="w-12" />
            <span className="font-semibold ml-2">Lending</span>
          </div>
          {isInitializing ? (
            <div className="h-9 flex items-center">
              <Loader2 className="animate-spin text-white/30" />
            </div>
          ) : !address ? (
            <Button onClick={() => setConnectWalletModalOpen(true)}>
              Connect Wallet
            </Button>
          ) : (
            <Button variant="secondary" onClick={onDisconnect}>
              <span>{ellipseMiddle(address)}</span>
            </Button>
          )}
        </div>
      </div>
      <ConnectWalletModal
        open={connectWalletModalOpen}
        setOpen={setConnectWalletModalOpen}
      />
    </>
  );
}
