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
import { BorrowOffer } from "@/lib/types";

import { toast } from "sonner";

import { useDebounce } from "@/hooks/useDebounce";

import { Loader2 } from "lucide-react";

import {
  type Pool,
  useRee,
  usePoolInfo,
  useRuneBalance,
  utils as reeUtils,
  Network,
} from "@omnity/ree-client-ts-sdk";

export function BorrowContent({
  pool,
  onSuccess,
}: {
  pool: Pool;
  onSuccess: (txid: string) => void;
}) {
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmiting, setIsSubmiting] = useState(false);

  const { createTransaction, exchange } = useRee();
  const { poolInfo } = usePoolInfo(pool.address);
  const { signPsbt, address, paymentAddress } = useLaserEyes();

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
  const [borrowOffer, setBorrowOffer] = useState<BorrowOffer>();

  const debouncedInputAmount = useDebounce(inputAmount, 300);

  const btcAmount = useMemo(
    () => formatCoinAmount(btcReserved.toString(), BITCOIN),
    [btcReserved]
  );

  const coinAmount = useMemo(
    () => formatCoinAmount(coinReserved.toString(), coin),
    [coinReserved, coin]
  );

  const { balance: runeBalance } = useRuneBalance(coin?.id);

  useEffect(() => {
    if (!Number(debouncedInputAmount)) {
      return;
    }

    const btcAmount = parseCoinAmount(debouncedInputAmount, BITCOIN);
    setIsQuoting(true);
    exchange
      .pre_borrow?.(pool.address, {
        id: BITCOIN.id,
        value: BigInt(btcAmount),
      })
      .then((res: any) => {
        if (res.Ok) {
          setBorrowOffer(res.Ok);
        } else {
          throw new Error(JSON.stringify(res.Err));
        }
      })
      .catch((err) => {
        console.log("pre borrow error:", err);
      })
      .finally(() => {
        setIsQuoting(false);
      });
  }, [debouncedInputAmount, coin]);

  const onSubmit = async () => {
    if (!borrowOffer || !coin) {
      return;
    }
    setIsSubmiting(true);
    try {
      const runeAmount = borrowOffer.input_runes.value;

      const borrowBtcAmount = BigInt(
        parseCoinAmount(debouncedInputAmount, BITCOIN)
      );

      const tx = await createTransaction();

      tx.addIntention({
        poolAddress: pool.address,
        action: "borrow",
        poolUtxos: [
          reeUtils.formatPoolUtxo(
            pool.address,
            borrowOffer.pool_utxo,
            Network.Testnet
          ),
        ],
        inputCoins: [
          {
            coin: {
              id: coin.id,
              value: runeAmount,
            },
            from: address,
          },
        ],
        outputCoins: [
          {
            coin: {
              id: BITCOIN.id,
              value: borrowBtcAmount,
            },
            to: paymentAddress,
          },
        ],
        nonce: borrowOffer.nonce,
      });

      const psbt = await tx.build();
      const res = await signPsbt(psbt.toBase64());
      const signedPsbtHex = res?.signedPsbtHex ?? "";

      if (!signedPsbtHex) {
        throw new Error("Signed Failed");
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
    <TabsContent value="borrow">
      <div className="text-md font-semibold">You Borrow</div>
      <div
        className={cn(
          "gap-2 focus-within:border-primary border flex rounded-md items-center px-3 py-2 mt-2",
          isQuoting && "animate-pulse"
        )}
      >
        <Input
          placeholder="0.00"
          type="number"
          value={inputAmount}
          onChange={(e) => setInputAmount(e.target.value)}
          className="text-right font-semibold text-xl! flex-1 border-none p-0 focus-visible:outline-none focus-visible:ring-0"
        />
        <span className="text-lg">BTC</span>
      </div>
      <div className="mt-3">
        <div className="text-md font-semibold">Need Coin</div>
        <div
          className={cn(
            "h-13 mt-2 gap-2 flex items-center bg-secondary/40 rounded-md px-3",
            isQuoting && "animate-pulse"
          )}
        >
          <span className="text-right flex-1 text-lg font-semibold">
            {borrowOffer
              ? formatNumber(
                  formatCoinAmount(
                    borrowOffer.input_runes.value.toString(),
                    coin
                  )
                )
              : "-"}
          </span>
          <span className="text-lg">{coin?.runeSymbol}</span>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-sm">
            Balance: {runeBalance ? formatNumber(runeBalance) : "-"}{" "}
            {coin?.runeSymbol}
          </span>
        </div>
      </div>
      <div className="mt-8">
        <Button
          className="w-full"
          size="lg"
          disabled={!borrowOffer || isSubmiting}
          onClick={onSubmit}
        >
          {isSubmiting && <Loader2 className="animate-spin" />}
          {!address ? "Connect Wallet" : "Borrow"}
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
