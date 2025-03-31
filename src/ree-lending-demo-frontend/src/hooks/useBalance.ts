import { useMemo } from "react";
import { BITCOIN } from "@/lib/constants";

import { useBtcUtxos, useRuneUtxos } from "./useUtxos";
import { formatCoinAmount } from "@/lib/utils";
import { Coin, UnspentOutput } from "@/lib/types";

function getBalanceByUtxos(coin: Coin, utxos: UnspentOutput[]): string {
  const isBitcoin = coin.id === BITCOIN.id;
  const filteredUtxos = utxos.filter((utxo) =>
    isBitcoin
      ? !utxo.runes.length
      : utxo.runes.findIndex((rune) => rune.id === coin.id) >= 0
  );

  if (!filteredUtxos.length) {
    return "0";
  }

  let amount = BigInt(0);
  for (let i = 0; i < filteredUtxos.length; i++) {
    const utxo = filteredUtxos[i];

    amount += isBitcoin
      ? BigInt(utxo.satoshis)
      : BigInt(utxo.runes.find((rune) => rune.id === coin.id)?.amount ?? 0);
  }

  return formatCoinAmount(amount.toString(), coin);
}

export function useCoinBalance(coin: Coin | null | undefined) {
  const btcUtxos = useBtcUtxos();
  const runeUtxos = useRuneUtxos(coin?.id);
 
  return useMemo(
    () =>
      coin
        ? coin.id === BITCOIN.id
          ? btcUtxos
            ? getBalanceByUtxos(coin, btcUtxos)
            : undefined
          : runeUtxos
          ? getBalanceByUtxos(coin, runeUtxos)
          : undefined
        : undefined,
    [btcUtxos, runeUtxos, coin]
  );
}
