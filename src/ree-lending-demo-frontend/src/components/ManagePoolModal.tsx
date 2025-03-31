import { Dialog, DialogContent } from "@/components/ui/dialog";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COIN_LIST, BITCOIN, UTXO_DUST, EXCHANGE_ID } from "@/lib/constants";
import { useEffect, useMemo, useState } from "react";
import * as bitcoin from "bitcoinjs-lib";
import { useLaserEyes } from "@omnisat/lasereyes";
import { RuneId, Runestone, none, Edict } from "runelib";

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
} from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Button } from "./ui/button";
import {
  Pool,
  DepositQuote,
  UnspentOutput,
  AddressType,
  ToSignInput,
  TxInput,
  InputCoin,
} from "@/lib/types";

import { toast } from "sonner";
import { ree_lending_demo_backend } from "declarations/ree-lending-demo-backend";
import { useDebounce } from "@/hooks/useDebounce";
import { useBtcUtxos, useRuneUtxos } from "@/hooks/useUtxos";
import { Loader2 } from "lucide-react";

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
  const [isSubmiting, setIsSubmiting] = useState(false);

  const { paymentAddress, address, signPsbt } = useLaserEyes();
  const [coin, coinReserved, btcReserved] = useMemo(() => {
    const coin = COIN_LIST.find((coin) => coin.id === pool.coin_reserved[0].id);
    return [coin, pool.coin_reserved[0].value, pool.btc_reserved];
  }, [pool]);

  const [inputAmount, setInputAmount] = useState("");
  const [depositQuote, setDepositQuote] = useState<DepositQuote>();

  const [borrowQuote, setBorrowQuote] = useState<any>();

  const btcUtxos = useBtcUtxos();

  console.log("btcUtxos", btcUtxos);

  const runeUtxos = useRuneUtxos(coin?.id);
  const debouncedInputAmount = useDebounce(inputAmount, 300);

  const [poolSpendOutpoints, setPoolSpendOutpoints] = useState<string[]>([]);
  const [poolReceiveOutpoints, setPoolReceiveOutpoints] = useState<string[]>(
    []
  );
  const [inputCoins, setInputCoins] = useState<InputCoin[]>([]);
  const [psbt, setPsbt] = useState<bitcoin.Psbt>();

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
    setIsSubmiting(false);
    setPsbt(undefined);
  }, [tab, open]);

  useEffect(() => {
    if (!Number(debouncedInputAmount)) {
      return;
    }
    if (tab === "deposit") {
      const btcAmount = parseCoinAmount(debouncedInputAmount, BITCOIN);
      setIsQuoting(true);
      ree_lending_demo_backend
        .pre_deposit(pool.address, {
          id: BITCOIN.id,
          value: BigInt(btcAmount),
        })
        .then((res: { Ok: DepositQuote }) => {
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
    if (!depositQuote || !btcUtxos?.length || !coin) {
      return;
    }

    const genPsbt = async () => {
      console.log("genPsbt");
      const depositBtcAmount = BigInt(
        parseCoinAmount(debouncedInputAmount, BITCOIN)
      );

      const poolAddress = pool.address;

      const { output } = getP2trAressAndScript(pool.key);

      const poolUtxo0 = depositQuote.pool_utxo[0];
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
            id: poolUtxo0.maybe_rune[0].id,
            amount: poolUtxo0.maybe_rune[0].value.toString(),
          },
        ],
      };

      let poolRuneAmount = poolUtxo0.maybe_rune[0].value,
        poolBtcAmount = poolUtxo0.sats;

      const _psbt = new bitcoin.Psbt({
        network: bitcoin.networks.testnet,
      });

      // inputs
      const txInputs: TxInput[] = [];
      txInputs.push(utxoToInput(poolUtxo));

      const [runeBlock, runeIdx] = coin?.id.split(":");

      const edicts = [
        new Edict(
          new RuneId(Number(runeBlock), Number(runeIdx)),
          poolRuneAmount,
          0
        ),
      ];

      const runestone = new Runestone(edicts, none(), none(), none());

      const poolVouts: number[] = [];

      poolVouts.push(0);

      _psbt.addOutput({
        address: poolAddress,
        value: poolBtcAmount + depositBtcAmount,
      });

      const opReturnScript = runestone.encipher();
      // OP_RETURN
      _psbt.addOutput({
        script: opReturnScript,
        value: BigInt(0),
      });

      let inputTypes = [addressTypeToString(getAddressType(poolAddress))];

      const outputTypes = [
        addressTypeToString(getAddressType(poolAddress)),
        { OpReturn: BigInt(opReturnScript.length) },
        addressTypeToString(getAddressType(paymentAddress)),
      ];

      let lastFee = BigInt(0);
      let currentFee = BigInt(0);
      let selectedUtxos: UnspentOutput[] = [];
      let targetBtcAmount = BigInt(0);

      do {
        lastFee = currentFee;

        currentFee = await Orchestrator.getEstimateMinTxFee({
          input_types: inputTypes,
          pool_address: poolAddress,
          output_types: outputTypes,
        });
        currentFee += BigInt(1);
        targetBtcAmount = depositBtcAmount + currentFee;

        if (currentFee > lastFee && targetBtcAmount > 0) {
          const { selectedUtxos: _selectedUtxos } = selectBtcUtxos(
            btcUtxos,
            targetBtcAmount
          );
          if (_selectedUtxos.length === 0) {
            throw new Error("INSUFFICIENT_BTC_UTXO");
          }

          inputTypes = [
            addressTypeToString(getAddressType(poolAddress)),
            ..._selectedUtxos.map(() =>
              addressTypeToString(getAddressType(paymentAddress))
            ),
          ];

          const totalBtcAmount = _selectedUtxos.reduce(
            (total, curr) => total + BigInt(curr.satoshis),
            BigInt(0)
          );

          if (
            totalBtcAmount - targetBtcAmount > 0 &&
            totalBtcAmount - targetBtcAmount > UTXO_DUST
          ) {
            outputTypes.pop();
            outputTypes.push(
              addressTypeToString(getAddressType(paymentAddress))
            );
          }

          selectedUtxos = _selectedUtxos;
        }
      } while (currentFee > lastFee && targetBtcAmount > 0);

      console.log("fee", currentFee);
      console.log("inputTypes", inputTypes);
      console.log("outputTypes", outputTypes);

      let totalBtcAmount = BigInt(0);

      selectedUtxos.forEach((utxo) => {
        txInputs.push(utxoToInput(utxo));
        totalBtcAmount += BigInt(utxo.satoshis);
      });

      const changeBtcAmount = totalBtcAmount - targetBtcAmount;

      if (changeBtcAmount < 0) {
        throw new Error("Inssuficient UTXO(s)");
      }

      if (changeBtcAmount > UTXO_DUST) {
        _psbt.addOutput({
          address: paymentAddress,
          value: changeBtcAmount,
        });
      }

      txInputs.forEach((input) => {
        _psbt.data.addInput(input.data);
      });

      //@ts-expect-error: todo
      const unsignedTx = _psbt.__CACHE.__TX;

      const toSignInputs: ToSignInput[] = [];

      const toSpendUtxos = txInputs
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
          from: paymentAddress,
          coin: {
            id: BITCOIN.id,
            value: depositBtcAmount,
          },
        },
      ]);

      setPsbt(_psbt);
    };

    genPsbt();
  }, [depositQuote, coin, debouncedInputAmount, pool, paymentAddress, address]);

  const onSubmit = async () => {
    if (!psbt || !depositQuote) {
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

      await Orchestrator.invoke({
        intention_set: {
          initiator_address: paymentAddress,
          intentions: [
            {
              action: "deposit",
              exchange_id: EXCHANGE_ID,
              input_coins: inputCoins,
              pool_utxo_spend: poolSpendOutpoints,
              pool_utxo_receive: poolReceiveOutpoints,
              output_coins: [],
              pool_address: pool.address,
              action_params: "",
              nonce: depositQuote.nonce,
            },
          ],
        },
        psbt_hex: signedPsbtHex,
      });
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
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!psbt || isSubmiting}
                    onClick={onSubmit}
                  >
                    {isSubmiting && <Loader2 className="animate-spin" />}
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
