import { actor } from "./actor";
import {
  InvokeArgs,
  EstimateMinTxFeeArgs,
  OutpointWithValue,
  UnspentOutput,
} from "@/lib/types";
import { getAddressType } from "../utils";

export class Orchestrator {
  static async invoke(args: InvokeArgs) {
    console.log("invoke args", args);
    return actor
      .invoke(args)
      .then((data: any) => {
        console.log("invoke res", data);
        if (data?.Ok) {
          return data.Ok;
        } else {
          const error = data?.Err ?? {};
          const key = Object.keys(error)[0];
          const message = error[key];

          throw new Error(
            message
              ? key === "ErrorOccurredDuringExecution"
                ? `${key}: ${
                    message.execution_steps?.[0]?.result?.Err ?? "Unknown Error"
                  }`
                : `Invoke Error: ${JSON.stringify(data)}`
              : `Invoke Error: ${JSON.stringify(data)}`
          );
        }
      })
      .catch((err) => {
        console.log("invoke error", err);
        throw err;
      });
  }

  static async getTxSent(txid: string) {
    return actor.get_tx_sent(txid).then((res: any) => {
      const errorMessage = res[0]?.status?.[0].Rejected;
      if (errorMessage) {
        return {
          status: "Rejected",
          errorMessage,
        };
      }
      return undefined;
    });
  }

  static async getUnconfirmedUtxos(
    address: string,
    pubkey = ""
  ): Promise<UnspentOutput[]> {
    const res = (await actor.get_zero_confirmed_utxos_of_address(
      address
    )) as OutpointWithValue[];

    const addressType = getAddressType(address);

    return res.map(({ value, script_pubkey_hex, outpoint, maybe_rune }) => {
      const [txid, vout] = outpoint.split(":");
      const rune = maybe_rune[0];
      return {
        txid,
        vout: Number(vout),
        satoshis: value.toString(),
        scriptPk: script_pubkey_hex,
        pubkey,
        addressType,
        address,
        runes: rune
          ? [
              {
                id: rune.id,
                amount: rune.value.toString(),
              },
            ]
          : [],
      };
    });
  }

  static async getRecommendedFee() {
    const res = (await actor.get_mempool_tx_fee_rate()) as {
      low: bigint;
      high: bigint;
      update_time: string;
      medium: bigint;
    };
    return Number(res.medium);
  }

  static async getEstimateMinTxFee(args: EstimateMinTxFeeArgs) {
    const res = (await actor.estimate_min_tx_fee(args)) as { Ok: bigint };
    return BigInt(res.Ok);
  }
}
