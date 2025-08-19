import { COIN_LIST, BITCOIN } from "@/lib/constants";
import { useMemo, useState } from "react";
import { CoinIcon } from "./CoinIcon";
import { formatCoinAmount, formatNumber } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { ManagePoolModal } from "./ManagePoolModal";
import { type Pool, usePoolInfo } from "@omnity/ree-ts-sdk";

export function PoolRow({ pool }: { pool: Pool }) {
  const { poolInfo } = usePoolInfo(pool.address);

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

  const [managePoolModalOpen, setManagePoolModalOpen] = useState(false);

  const btcAmount = useMemo(
    () => formatCoinAmount(btcReserved.toString(), BITCOIN),
    [btcReserved]
  );

  const coinAmount = useMemo(
    () => formatCoinAmount(coinReserved.toString(), coin || undefined),
    [coinReserved, coin]
  );

  return (
    <>
      <div
        className="grid grid-cols-11 border bg-card px-4 py-3 rounded-md items-center cursor-pointer hover:bg-card/60"
        onClick={() => {
          setManagePoolModalOpen(true);
        }}
      >
        <div className="col-span-4">
          <div className="flex items-center">
            {coin && <CoinIcon coin={coin} className="size-9" />}
            <div className="flex flex-col ml-2 gap-1">
              <span className="text-md">{pool.name}</span>
              <span className="text-xs text-muted-foreground">
                {coin?.id || "No coin"}
              </span>
            </div>
          </div>
        </div>
        <div className="col-span-3">
          <span className="text-lg">{formatNumber(btcAmount)} ₿</span>
        </div>
        <div className="col-span-3">
          <span className="text-lg">
            {formatNumber(coinAmount)} {coin?.runeSymbol}
          </span>
        </div>
        <div className="col-span-1 flex justify-end">
          <ChevronRight className="text-muted-foreground size-5" />
        </div>
      </div>
      <ManagePoolModal
        open={managePoolModalOpen}
        pool={pool}
        setOpen={setManagePoolModalOpen}
      />
    </>
  );
}
