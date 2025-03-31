import { UnspentOutput } from "@/lib/types";
import { atom, useSetAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { produce } from "immer";

export const spentUtxosAtom = atomWithStorage<UnspentOutput[]>(
  "spent-utxos",
  []
);

export const addSpentUtxosAtom = atom(
  null,
  (get, set, utxos: UnspentOutput[]) => {
    const prev = get(spentUtxosAtom);

    const next = produce(prev, (draft) => {
      return draft.concat(utxos);
    });
    set(spentUtxosAtom, next);
  }
);

export const removeSpentUtxosAtom = atom(
  null,
  (get, set, utxos: UnspentOutput[]) => {
    const prev = get(spentUtxosAtom);
    const next = produce(prev, (draft) => {
      return draft.filter(
        (d) =>
          utxos.findIndex((u) => d.txid === u.txid && d.vout === u.vout) < 0
      );
    });
    set(spentUtxosAtom, next);
  }
);

export function useSpentUtxos() {
  return useAtomValue(spentUtxosAtom);
}

export function useAddSpentUtxos() {
  return useSetAtom(addSpentUtxosAtom);
}

export function useRemoveSpentUtxos() {
  return useSetAtom(removeSpentUtxosAtom);
}
