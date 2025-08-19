import { TabsContent } from "@/components/ui/tabs";
import { COIN_LIST, BITCOIN } from "@/lib/constants";
import { useEffect, useMemo, useState } from "react";

import { useLaserEyes } from "@omnisat/lasereyes";

import {
  formatCoinAmount,
  formatNumber,
  parseCoinAmount,
  cn,
} from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DepositOffer } from "@/lib/types";

import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";

import { Loader2 } from "lucide-react";

import {
  type Pool,
  useRee,
  usePoolInfo,
  useBtcBalance,
} from "@omnity/ree-ts-sdk";

export function DepositContent({
  pool,
  onSuccess,
}: {
  pool: Pool;
  onSuccess: (txid: string) => void;
}) {
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmiting, setIsSubmiting] = useState(false);

  const { exchange, createTransaction } = useRee();
  const { poolInfo } = usePoolInfo(pool.address);

  const { signPsbt, address } = useLaserEyes();

  const [coin, coinReserved, btcReserved] = useMemo(() => {
    if (!poolInfo) {
      return [null, BigInt(0), BigInt(0)];
    }
    const firstCoin = poolInfo.coin_reserved[0];
    if (!firstCoin) {
      return [null, BigInt(0), poolInfo.btc_reserved];
    }
    const coin = COIN_LIST.find((coin) => coin.id === firstCoin.id);

    return [coin, firstCoin.value, poolInfo.btc_reserved];
  }, [poolInfo]);

  const [inputAmount, setInputAmount] = useState("");
  const [depositOffer, setDepositOffer] = useState<DepositOffer>();

  const { balance: btcBalance } = useBtcBalance();

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
    if (!Number(debouncedInputAmount)) {
      return;
    }

    const btcAmount = parseCoinAmount(debouncedInputAmount, BITCOIN);
    setIsQuoting(true);
    exchange
      .pre_deposit?.(pool.address, {
        id: BITCOIN.id,
        value: BigInt(btcAmount),
      })
      .then((res: any) => {
        if (res.Ok) {
          setDepositOffer(res.Ok);
        } else {
          throw new Error(JSON.stringify(res.Err));
        }
      })
      .catch((err) => {
        console.log("pre deposit error:", err);
      })
      .finally(() => {
        setIsQuoting(false);
      });
  }, [debouncedInputAmount, coin]);

  const onSubmit = async () => {
    if (!depositOffer) {
      return;
    }
    setIsSubmiting(true);
    try {
      const depositBtcAmount = BigInt(
        parseCoinAmount(debouncedInputAmount, BITCOIN)
      );
      const tx = await createTransaction({
        poolAddress: pool.address,
        sendBtcAmount: depositBtcAmount,
        sendRuneAmount: BigInt(0),
        receiveBtcAmount: BigInt(0),
        receiveRuneAmount: BigInt(0),
      });

      const psbt = await tx.build("deposit", depositOffer.nonce, "");

      const res = await signPsbt(psbt.toBase64());
      const signedPsbtHex = res?.signedPsbtHex ?? "";

      if (!signedPsbtHex) {
        throw new Error("Sign Failed");
      }

      const txid = await tx.send(signedPsbtHex);

      onSuccess(txid);
    } catch (error: any) {
      if (error.code !== 4001) {
        console.log(error);
        toast(error.toString());
      }
    } finally {
      setIsSubmiting(false);
    }
  };

  return (
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
        <span className="text-sm">
          Balance: {btcBalance ? formatNumber(btcBalance) : "-"} BTC
        </span>
      </div>
      <div className="mt-8">
        <Button
          className="w-full"
          size="lg"
          disabled={!depositOffer || isSubmiting}
          onClick={onSubmit}
        >
          {isSubmiting && <Loader2 className="animate-spin" />}
          {!address ? "Connect Wallet" : "Deposit"}
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
  );
}
