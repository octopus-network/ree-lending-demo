import { useState, useEffect } from "react";
import { actor as lendingActor } from "@/lib/exchange/actor";
import { Pool } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { usePendingBtcUtxos, usePendingRuneUtxos } from "./hooks/useUtxos";
import { Orchestrator } from "./lib/orchestrator";
import { PoolRow } from "./components/PoolRow";
import { useLaserEyes } from "@omnisat/lasereyes";

export default function Home() {
  const [poolList, setPoolList] = useState<Pool[]>();
  const [timer, setTimer] = useState<number>();
  const { address, paymentAddress, publicKey, paymentPublicKey } =
    useLaserEyes();

  const [, setPendingBtcUtxos] = usePendingBtcUtxos();
  const [, setPendingRuneUtxos] = usePendingRuneUtxos();

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(new Date().getTime());
    }, 10 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (address && publicKey) {
      Orchestrator.getUnconfirmedUtxos(address, publicKey).then((_utxos) => {
        setPendingRuneUtxos(_utxos);
      });
    }
  }, [address, publicKey, setPendingRuneUtxos, timer]);

  useEffect(() => {
    if (paymentAddress && paymentPublicKey) {
      Orchestrator.getUnconfirmedUtxos(paymentAddress, paymentPublicKey).then(
        (_utxos) => {
          setPendingBtcUtxos(_utxos);
        }
      );
    }
  }, [paymentAddress, paymentPublicKey, setPendingBtcUtxos, timer]);

  useEffect(() => {
    lendingActor
      .get_pool_list({
        from: [],
        limit: 20,
      })
      .then((res: any) => {
        setPoolList(res);
      });
  }, [timer]);

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full flex-col">
      {poolList === undefined ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="text-[#e4ab00] animate-spin size-12" />
        </div>
      ) : (
        <>
          <div className="text-xl font-semibold">Pools</div>
          <div className="mt-4">
            <div className="grid grid-cols-11 text-xs text-muted-foreground px-4 mb-2">
              <div className="col-span-4">
                <span>Pool</span>
              </div>
              <div className="col-span-3">
                <span>BTC Reserved</span>
              </div>
              <div className="col-span-3">
                <span>Coin Reserved</span>
              </div>
            </div>
            {poolList.map((pool) => (
              <PoolRow pool={pool} key={pool.key} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
