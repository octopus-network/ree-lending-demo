import { Dialog, DialogContent } from "@/components/ui/dialog";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pool } from "@/lib/types";
import { useState } from "react";
import { DepositContent } from "./DepositContent";
import { BorrowContent } from "./BorrowContent";
import { toast } from "sonner";

export function ManagePoolModal({
  open,
  setOpen,
  pool,
}: {
  open: boolean;
  pool: Pool;
  setOpen: (open: boolean) => void;
}) {
  const [tab, setTab] = useState("deposit");

  const onDepositSuccess = (txid: string) => {
    setOpen(false);
    toast(`Tx sent: ${txid}`);
  };

  const onBorrowSuccess = (txid: string) => {
    setOpen(false);
    toast(`Tx sent: ${txid}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideCloseButton className="p-4">
        <div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full bg-secondary/50 rounded-md">
              <TabsTrigger
                value="deposit"
                className="font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground"
              >
                Deposit
              </TabsTrigger>
              <TabsTrigger
                value="borrow"
                className="font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground"
              >
                Borrow
              </TabsTrigger>
            </TabsList>
            <div className="mt-2">
              <DepositContent pool={pool} onSuccess={onDepositSuccess} />
              <BorrowContent pool={pool} onSuccess={onBorrowSuccess} />
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
