import * as bitcoin from "bitcoinjs-lib";

import { TabsContent } from "@/components/ui/tabs";
import { COIN_LIST, BITCOIN, UTXO_DUST, EXCHANGE_ID } from "@/lib/constants";
import { useEffect, useMemo, useState } from "react";

import { useLaserEyes } from "@omnisat/lasereyes";
import { RuneId, Runestone, none, Edict } from "runelib";

import { UTXO_PROOF_SERVER } from "@/lib/constants";
import axios from "axios";
import { useAddSpentUtxos } from "@/hooks/useSpentUtxos";
import { Orchestrator } from "@/lib/orchestrator";
import {
  formatCoinAmount,
  formatNumber,
  parseCoinAmount,
  cn,
  utxoToInput,
  getP2trAressAndScript,
  addressTypeToString,
  getAddressType,
  selectBtcUtxos,
  hexToBytes,
  reverseBuffer,
} from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Pool,
  BorrowOffer,
  UnspentOutput,
  AddressType,
  ToSignInput,
  TxInput,
  InputCoin,
  OutputCoin,
} from "@/lib/types";

import { toast } from "sonner";
import { actor as lendingActor } from "@/lib/exchange/actor";
import { useDebounce } from "@/hooks/useDebounce";
import { useBtcUtxos, useRuneUtxos } from "@/hooks/useUtxos";
import { Loader2 } from "lucide-react";
import { useCoinBalance } from "@/hooks/useBalance";

export function BorrowContent({
  pool,
  onSuccess,
}: {
  pool: Pool;
  onSuccess: (txid: string) => void;
}) {
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmiting, setIsSubmiting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initiatorUtxoProof, setInitiatorUtxoProof] = useState<number[]>();

  const { paymentAddress, address, signPsbt } = useLaserEyes();
  const [coin, coinReserved, btcReserved] = useMemo(() => {
    const coin = COIN_LIST.find((coin) => coin.id === pool.coin_reserved[0].id);
    return [coin, pool.coin_reserved[0].value, pool.btc_reserved];
  }, [pool]);

  const [inputAmount, setInputAmount] = useState("");
  const [borrowOffer, setBorrowOffer] = useState<BorrowOffer>();
  const [toSpendUtxos, setToSpendUtxos] = useState<UnspentOutput[]>([]);
  const [fee, setFee] = useState(BigInt(1));

  const btcUtxos = useBtcUtxos();
  const runeUtxos = useRuneUtxos(coin?.id);

  const addSpentUtxos = useAddSpentUtxos();

  const debouncedInputAmount = useDebounce(inputAmount, 300);

  const [poolSpendOutpoints, setPoolSpendOutpoints] = useState<string[]>([]);
  const [poolReceiveOutpoints, setPoolReceiveOutpoints] = useState<string[]>(
    []
  );
  const [inputCoins, setInputCoins] = useState<InputCoin[]>([]);
  const [outputCoins, setOutputCoins] = useState<OutputCoin[]>([]);
  const [psbt, setPsbt] = useState<bitcoin.Psbt>();

  const btcAmount = useMemo(
    () => formatCoinAmount(btcReserved.toString(), BITCOIN),
    [btcReserved]
  );

  const coinAmount = useMemo(
    () => formatCoinAmount(coinReserved.toString(), coin),
    [coinReserved, coin]
  );

  const coinBalance = useCoinBalance(coin);

  useEffect(() => {
    if (!toSpendUtxos.length || !paymentAddress) {
      setInitiatorUtxoProof(undefined);
      return;
    }

    const utxos = toSpendUtxos.filter(
      (utxo) => utxo.address === paymentAddress
    );

    axios
      .post(`${UTXO_PROOF_SERVER}/get_proof`, {
        network: "Testnet",
        btc_address: paymentAddress,
        utxos: utxos.map(({ height, txid, satoshis, vout }: UnspentOutput) => ({
          outpoint: {
            txid: Array.from(reverseBuffer(hexToBytes(txid))),
            vout,
          },
          value: Number(satoshis),
          height,
        })),
      })
      .then((res) => res.data)
      .then((data) => {
        setInitiatorUtxoProof(data.Ok);
      })
      .catch((err) => {
        setInitiatorUtxoProof([]);
      });
  }, [toSpendUtxos, paymentAddress]);

  useEffect(() => {
    if (!Number(debouncedInputAmount)) {
      return;
    }

    const btcAmount = parseCoinAmount(debouncedInputAmount, BITCOIN);
    setIsQuoting(true);
    lendingActor
      .pre_borrow(pool.address, {
        id: BITCOIN.id,
        value: BigInt(btcAmount),
      })
      .then((res: any) => {
        if (res.Ok) {
          setBorrowOffer(res.Ok);
        }
      })
      .finally(() => {
        setIsQuoting(false);
      });
  }, [debouncedInputAmount, coin]);

  useEffect(() => {
    if (!borrowOffer || !btcUtxos?.length || !runeUtxos?.length || !coin) {
      return;
    }

    const genPsbt = async () => {
      setIsGenerating(true);
      const runeid = borrowOffer.input_runes.id;
      const runeAmount = borrowOffer.input_runes.value;

      const borrowBtcAmount = BigInt(
        parseCoinAmount(debouncedInputAmount, BITCOIN)
      );

      const poolAddress = pool.address;

      const { output } = getP2trAressAndScript(pool.key);

      const poolUtxo0 = borrowOffer.pool_utxo;
      const poolUtxo: UnspentOutput = {
        txid: poolUtxo0.txid,
        vout: poolUtxo0.vout,
        satoshis: poolUtxo0.sats.toString(),
        address: poolAddress,
        scriptPk: output,
        pubkey: "",
        addressType: AddressType.P2TR,
        runes: [
          {
            id: poolUtxo0.coins[0].id,
            amount: poolUtxo0.coins[0].value.toString(),
          },
        ],
      };

      let poolRuneAmount = poolUtxo0.coins[0].value,
        poolBtcAmount = poolUtxo0.sats;

      const _psbt = new bitcoin.Psbt({
        network: bitcoin.networks.testnet,
      });

      // inputs
      const txInputs: TxInput[] = [];
      txInputs.push(utxoToInput(poolUtxo));

      let inputUtxoDusts = BigInt(0);

      const _selectedRuneUtxos: UnspentOutput[] = [];

      for (let i = 0; i < runeUtxos.length; i++) {
        const v = runeUtxos[i];
        if (v.runes.length) {
          const balance = v.runes.find((r) => r.id == runeid);
          if (balance && BigInt(balance.amount) == runeAmount) {
            _selectedRuneUtxos.push(v);
            break;
          }
        }
      }

      if (_selectedRuneUtxos.length == 0) {
        let total = BigInt(0);
        for (let i = 0; i < runeUtxos.length; i++) {
          const v = runeUtxos[i];
          v.runes.forEach((r) => {
            if (r.id == runeid) {
              total = total + BigInt(r.amount);
            }
          });
          _selectedRuneUtxos.push(v);
          if (total >= runeAmount) {
            break;
          }
        }
      }

      // add assets
      _selectedRuneUtxos.forEach((v) => {
        txInputs.push(utxoToInput(v));
        inputUtxoDusts += BigInt(v.satoshis);
      });

      let fromRuneAmount = BigInt(0);
      let hasMultipleRunes = false;
      const runesMap: Record<string, boolean> = {};
      _selectedRuneUtxos.forEach((v) => {
        if (v.runes) {
          v.runes.forEach((w) => {
            runesMap[w.id] = true;
            if (w.id === runeid) {
              fromRuneAmount = fromRuneAmount + BigInt(w.amount);
            }
          });
        }
      });

      if (Object.keys(runesMap).length > 1) {
        hasMultipleRunes = true;
      }

      const changeRuneAmount = fromRuneAmount - runeAmount;

      const [runeBlock, runeIdx] = coin?.id.split(":");

      const needChange = hasMultipleRunes || changeRuneAmount > 0;

      const edicts = needChange
        ? [
            new Edict(
              new RuneId(Number(runeBlock), Number(runeIdx)),
              changeRuneAmount,
              0
            ),
            new Edict(
              new RuneId(Number(runeBlock), Number(runeIdx)),
              poolRuneAmount + runeAmount,
              1
            ),
          ]
        : [
            new Edict(
              new RuneId(Number(runeBlock), Number(runeIdx)),
              poolRuneAmount + runeAmount,
              0
            ),
          ];

      const runestone = new Runestone(edicts, none(), none(), none());

      const poolVouts: number[] = [];

      if (needChange) {
        _psbt.addOutput({
          address,
          value: Number(UTXO_DUST),
        });
        poolVouts.push(1);
      } else {
        poolVouts.push(0);
      }

      _psbt.addOutput({
        address: poolAddress,
        value: Number(poolBtcAmount - borrowBtcAmount),
      });

      _psbt.addOutput({
        address: paymentAddress,
        value: Number(borrowBtcAmount),
      });

      const opReturnScript = runestone.encipher();
      // OP_RETURN
      _psbt.addOutput({
        script: opReturnScript,
        value: 0,
      });

      let inputTypes = [
        addressTypeToString(getAddressType(poolAddress)),
        ..._selectedRuneUtxos.map((utxo) =>
          addressTypeToString(getAddressType(utxo.address))
        ),
      ];

      const outputTypes = [
        ...Array(needChange ? 1 : 0).fill(
          addressTypeToString(getAddressType(address))
        ),
        addressTypeToString(getAddressType(poolAddress)),
        addressTypeToString(getAddressType(paymentAddress)),
        { OpReturn: BigInt(opReturnScript.length) },
        addressTypeToString(getAddressType(paymentAddress)),
      ];

      let lastFee = BigInt(0);
      let currentFee = BigInt(0);
      let selectedUtxos: UnspentOutput[] = [];

      const utxoDust = needChange ? UTXO_DUST : BigInt(0);
      let leftFeeAmount = BigInt(0);

      do {
        lastFee = currentFee;

        currentFee = await Orchestrator.getEstimateMinTxFee({
          input_types: inputTypes,
          pool_address: [poolAddress],
          output_types: outputTypes,
        });
        currentFee += BigInt(1);

        leftFeeAmount = currentFee + utxoDust;

        if (currentFee > lastFee && leftFeeAmount > 0) {
          const { selectedUtxos: _selectedUtxos } = selectBtcUtxos(
            btcUtxos,
            leftFeeAmount
          );
          if (_selectedUtxos.length === 0) {
            throw new Error("INSUFFICIENT_BTC_UTXO");
          }

          inputTypes = [
            addressTypeToString(getAddressType(poolAddress)),
            ..._selectedRuneUtxos.map((utxo) =>
              addressTypeToString(getAddressType(utxo.address))
            ),
            ..._selectedUtxos.map(() =>
              addressTypeToString(getAddressType(paymentAddress))
            ),
          ];

          const totalBtcAmount = _selectedUtxos.reduce(
            (total, curr) => total + BigInt(curr.satoshis),
            BigInt(0)
          );

          const changeBtcAmount = totalBtcAmount - leftFeeAmount;
          if (changeBtcAmount > 0 && changeBtcAmount > UTXO_DUST) {
            outputTypes.pop();
            outputTypes.push(
              addressTypeToString(getAddressType(paymentAddress))
            );
          }
          selectedUtxos = _selectedUtxos;
        }
      } while (currentFee > lastFee && leftFeeAmount > 0);

      let totalBtcAmount = inputUtxoDusts - utxoDust;

      selectedUtxos.forEach((utxo) => {
        txInputs.push(utxoToInput(utxo));
        totalBtcAmount += BigInt(utxo.satoshis);
      });

      const changeBtcAmount = totalBtcAmount - currentFee;

      if (changeBtcAmount < 0) {
        throw new Error("Inssuficient UTXO(s)");
      }

      if (changeBtcAmount > UTXO_DUST) {
        _psbt.addOutput({
          address: paymentAddress,
          value: Number(changeBtcAmount),
        });
      }

      txInputs.forEach((input) => {
        _psbt.data.addInput(input.data);
      });

      //@ts-expect-error: todo
      const unsignedTx = _psbt.__CACHE.__TX;

      const toSignInputs: ToSignInput[] = [];

      const _toSpendUtxos = txInputs
        .filter(({ utxo }, index) => {
          const isUserInput =
            utxo.address === address || utxo.address === paymentAddress;
          const addressType = getAddressType(utxo.address);
          if (isUserInput) {
            toSignInputs.push({
              index,
              ...(addressType === AddressType.P2TR
                ? { address: utxo.address, disableTweakSigner: false }
                : { publicKey: utxo.pubkey, disableTweakSigner: true }),
            });
          }
          return isUserInput;
        })
        .map((input) => input.utxo);

      setToSpendUtxos(_toSpendUtxos);
      const unsignedTxClone = unsignedTx.clone();

      for (let i = 0; i < toSignInputs.length; i++) {
        const toSignInput = toSignInputs[i];

        const toSignIndex = toSignInput.index;
        const input = txInputs[toSignIndex];
        const inputAddress = input.utxo.address;
        if (!inputAddress) continue;
        const redeemScript = _psbt.data.inputs[toSignIndex].redeemScript;
        const addressType = getAddressType(inputAddress);

        if (redeemScript && addressType === AddressType.P2SH_P2WPKH) {
          const finalScriptSig = bitcoin.script.compile([redeemScript]);
          unsignedTxClone.setInputScript(toSignIndex, finalScriptSig);
        }
      }

      const txid = unsignedTxClone.getId();

      setPoolSpendOutpoints([`${poolUtxo.txid}:${poolUtxo.vout}`]);

      setPoolReceiveOutpoints(poolVouts.map((vout) => `${txid}:${vout}`));

      setInputCoins([
        {
          from: address,
          coin: {
            id: runeid,
            value: runeAmount,
          },
        },
      ]);

      setOutputCoins([
        {
          to: paymentAddress,
          coin: {
            id: BITCOIN.id,
            value: borrowBtcAmount,
          },
        },
      ]);

      setPsbt(_psbt);
      setIsGenerating(false);
      setFee(currentFee);
    };

    genPsbt();
  }, [borrowOffer, coin, debouncedInputAmount, pool, paymentAddress, address]);

  const onSubmit = async () => {
    if (!psbt || !borrowOffer || !initiatorUtxoProof) {
      return;
    }
    setIsSubmiting(true);
    try {
      const psbtBase64 = psbt.toBase64();
      const res = await signPsbt(psbtBase64);
      const signedPsbtHex = res?.signedPsbtHex ?? "";

      if (!signedPsbtHex) {
        throw new Error("Signed Failed");
      }

      const txid = await Orchestrator.invoke({
        initiator_utxo_proof: [],
        intention_set: {
          tx_fee_in_sats: fee,
          initiator_address: paymentAddress,
          intentions: [
            {
              action: "borrow",
              exchange_id: EXCHANGE_ID,
              input_coins: inputCoins,
              pool_utxo_spent: [],
              pool_utxo_received: [],
              output_coins: outputCoins,
              pool_address: pool.address,
              action_params: "",
              nonce: borrowOffer.nonce,
            },
          ],
        },
        psbt_hex: signedPsbtHex,
      });

      addSpentUtxos(toSpendUtxos);

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
            Balance: {coinBalance ? formatNumber(coinBalance) : "-"}{" "}
            {coin?.runeSymbol}
          </span>
        </div>
      </div>
      <div className="mt-8">
        <Button
          className="w-full"
          size="lg"
          disabled={!psbt || isSubmiting || isGenerating || !paymentAddress}
          onClick={onSubmit}
        >
          {(isSubmiting || isGenerating) && (
            <Loader2 className="animate-spin" />
          )}
          {!paymentAddress ? "Connect Wallet" : "Borrow"}
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
