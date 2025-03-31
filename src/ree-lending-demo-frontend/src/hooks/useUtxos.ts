import { UnspentOutput } from "@/lib/types";
import axios from "axios";
import { useEffect, useState, useMemo } from "react";
import { useLaserEyes } from "@omnisat/lasereyes";
import { UNISAT_API_URL } from "@/lib/constants";
import { atom, useAtom } from "jotai";
import { useSpentUtxos } from "./useSpentUtxos";

export const pendingBtcUtxosAtom = atom<UnspentOutput[]>([]);
export const pendingRuneUtxosAtom = atom<UnspentOutput[]>([]);

export function usePendingBtcUtxos() {
  return useAtom(pendingBtcUtxosAtom);
}

export function usePendingRuneUtxos() {
  return useAtom(pendingRuneUtxosAtom);
}

export function useBtcUtxos() {
  const [utxos, setUtxos] = useState<UnspentOutput[]>();
  const [pendingUtxos] = usePendingBtcUtxos();
  const spentUtxos = useSpentUtxos();

  const [timer, setTimer] = useState<number>();

  const { paymentAddress, paymentPublicKey } = useLaserEyes();

  useEffect(() => {
    setInterval(() => {
      setTimer(new Date().getTime());
    }, 30 * 1000);
  }, []);

  useEffect(() => {
    console.log("paymentAddress", paymentAddress);
    if (!paymentAddress || !paymentPublicKey) {
      return;
    }
    axios
      .get<{
        data: {
          addressType: number;
          height: number;
          pubkey: string;
          satoshis: number;
          scriptPk: string;
          txid: string;
          vout: number;
        }[];
      }>(`${UNISAT_API_URL}/v5/address/btc-utxo?address=${paymentAddress}`)
      .then((res) => res.data)
      .then(({ data }) => {
        setUtxos(
          data.map((utxo) => ({
            addressType: utxo.addressType,
            height: utxo.height,
            pubkey: paymentPublicKey,
            satoshis: utxo.satoshis.toString(),
            scriptPk: utxo.scriptPk,
            txid: utxo.txid,
            vout: utxo.vout,
            runes: [],
            address: paymentAddress,
          }))
        );
      });
  }, [timer, paymentAddress]);

  return useMemo(
    () =>
      utxos
        ? utxos
            .filter(
              (c) =>
                spentUtxos.findIndex(
                  (s) => s.txid === c.txid && s.vout === c.vout
                ) < 0
            )
            .concat(
              pendingUtxos.filter(
                (p) =>
                  !p.runes.length &&
                  utxos.findIndex(
                    (c) => c.txid === p.txid && c.vout === p.vout
                  ) < 0
              )
            )
        : undefined,
    [utxos, pendingUtxos, spentUtxos]
  );
}

export function useRuneUtxos(runeid: string | undefined) {
  const [utxos, setUtxos] = useState<UnspentOutput[]>();
  const [pendingUtxos] = usePendingRuneUtxos();
  const spentUtxos = useSpentUtxos();

  const [timer, setTimer] = useState<number>();

  const { address, publicKey } = useLaserEyes();

  useEffect(() => {
    setInterval(() => {
      setTimer(new Date().getTime());
    }, 30 * 1000);
  }, []);

  useEffect(() => {
    if (!address || !runeid || !publicKey) {
      return;
    }
    axios
      .get<{
        data: {
          addressType: number;
          height: number;
          pubkey: string;
          satoshis: number;
          scriptPk: string;
          txid: string;
          vout: number;
          runes: {
            amount: string;
            divisibility: number;
            rune: string;
            runeid: string;
            spacedRune: string;
            symbol: string;
          }[];
        }[];
      }>(`${UNISAT_API_URL}/v5/runes/utxos?address=${address}&runeid=${runeid}`)
      .then((res) => res.data)
      .then(({ data }) => {
        setUtxos(
          data.map((utxo) => ({
            addressType: utxo.addressType,
            satoshis: utxo.satoshis.toString(),
            scriptPk: utxo.scriptPk,
            txid: utxo.txid,
            vout: utxo.vout,
            pubkey: publicKey,
            runes: utxo.runes.map((rune) => ({
              id: rune.runeid,
              amount: rune.amount,
            })),
            address,
          }))
        );
      });
  }, [timer, address]);

  return useMemo(
    () =>
      utxos
        ? utxos
            .filter(
              (c) =>
                spentUtxos.findIndex(
                  (s) => s.txid === c.txid && s.vout === c.vout
                ) < 0
            )
            .concat(
              pendingUtxos.filter(
                (p) =>
                  p.runes.length &&
                  utxos.findIndex(
                    (c) => c.txid === p.txid && c.vout === p.vout
                  ) < 0
              )
            )
        : undefined,
    [utxos, pendingUtxos, spentUtxos]
  );
}
