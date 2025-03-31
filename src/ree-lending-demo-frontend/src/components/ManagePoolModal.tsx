import { Dialog, DialogContent } from "@/components/ui/dialog";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COIN_LIST, BITCOIN } from "@/lib/constants";
import { useEffect, useMemo, useState } from "react";
import {
  formatCoinAmount,
  formatNumber,
  parseCoinAmount,
  cn,
} from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "./ui/button";
import { Pool } from "@/lib/types";
import { ree_lending_demo_backend } from "declarations/ree-lending-demo-backend";
import { useDebounce } from "@/hooks/useDebounce";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [isQuoting, setIsQuoting] = useState(false);

  const [coin, coinReserved, btcReserved] = useMemo(() => {
    const coin = COIN_LIST.find((coin) => coin.id === pool.coin_reserved[0].id);
    return [coin, pool.coin_reserved[0].value, pool.btc_reserved];
  }, [pool]);

  const [inputAmount, setInputAmount] = useState("");
  const [depositQuote, setDepositQuote] = useState<any>();
  
  const [borrowQuote, setBorrowQuote] = useState<any>();

  const debouncedInputAmount = useDebounce(inputAmount, 300);

  const btcAmount = useMemo(
    () => formatCoinAmount(btcReserved.toString(), BITCOIN),
    [btcReserved]
  );

  const coinAmount = useMemo(
    () => formatCoinAmount(coinReserved.toString(), coin),
    [coinReserved, coin]
  );

  useEffect(() => {
    setInputAmount("");
    setDepositQuote(undefined);
    setBorrowQuote(undefined);
    setIsQuoting(false);
  }, [tab, open]);

  useEffect(() => {
    if (!Number(debouncedInputAmount)) {
      return;
    }
    if (tab === "deposit") {
      const runeAmount = parseCoinAmount(debouncedInputAmount, BITCOIN);
      setIsQuoting(true);
      ree_lending_demo_backend
        .pre_deposit(pool.address, {
          id: BITCOIN.id,
          value: BigInt(runeAmount),
        })
        .then((res: any) => {
          if (res.Ok) {
            setDepositQuote(res.Ok);
          }
        })
        .finally(() => {
          setIsQuoting(false);
        });
    }
  }, [tab, debouncedInputAmount, coin]);

  useEffect(() => {
    if (!depositQuote) {
      return;
    }
    
  }, [depositQuote]);

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
              <TabsContent value="deposit">
                <div
                  className={cn(
                    "gap-2 focus-within:border-primary border flex rounded-md items-center px-3 py-2",
                    isQuoting && "animate-pulse"
                  )}
                >
                  <Button variant="outline">Max</Button>
                  <Input
                    placeholder="0.00"
                    type="number"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="text-right font-semibold text-xl! flex-1 border-none p-0 focus-visible:outline-none focus-visible:ring-0"
                  />
                  <span className="text-lg">BTC</span>
                </div>
                <div className="flex justify-between my-2">
                  <span className="text-sm">Balance: 0.00 BTC</span>
                </div>
                <div className="mt-8">
                  <Button className="w-full" size="lg" disabled={!depositQuote}>
                    Deposit
                  </Button>
                </div>
                <div className="mt-2 text-xs flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BTC Reserved</span>
                    <span>{formatNumber(btcAmount)} ₿</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coin Reserved</span>
                    <span>
                      {formatNumber(coinAmount)} {coin?.runeSymbol}
                    </span>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="borrow">
                <div className="gap-2 focus-within:border-primary border flex rounded-md items-center px-3 py-2">
                  <Button variant="outline">Max</Button>
                  <Input
                    placeholder="0.00"
                    type="number"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="text-right font-semibold text-xl! flex-1 border-none p-0 focus-visible:outline-none focus-visible:ring-0"
                  />
                  <span className="text-lg">BTC</span>
                </div>
                <div className="flex justify-between my-2">
                  <span className="text-sm">Balance: 0.00 BTC</span>
                </div>
                <div className="mt-8">
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!Number(inputAmount)}
                  >
                    Borrow
                  </Button>
                </div>
                <div className="mt-2 text-xs flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BTC Reserved</span>
                    <span>{formatNumber(btcAmount)} ₿</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coin Reserved</span>
                    <span>
                      {formatNumber(coinAmount)} {coin?.runeSymbol}
                    </span>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
