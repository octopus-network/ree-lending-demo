export interface Coin {
  id: string;
  icon?: string;
  symbol?: string;
  name: string;
  runeId?: string;
  runeSymbol?: string;
  etching?: string;
  decimals: number;
  number?: number;
}

export interface UnspentOutput {
  txid: string;
  vout: number;
  satoshis: string;
  scriptPk: string;
  pubkey?: string;
  addressType: AddressType;
  address: string;
  runes: {
    id: string;
    amount: string;
  }[];
  rawtx?: string;
}

export enum AddressType {
  P2PKH,
  P2WPKH,
  P2TR,
  P2SH_P2WPKH,
  M44_P2WPKH, // deprecated
  M44_P2TR, // deprecated
  P2WSH,
  P2SH,
  UNKNOWN,
}

export interface Pool {
  key: string;
  address: string;
  name: string;
  btc_reserved: bigint;
  coin_reserved: [
    {
      id: string;
      value: bigint;
    }
  ];
}

export type CoinBalance = {
  id: string;
  value: bigint;
};

export type InputCoin = {
  coin: CoinBalance;
  from: string;
};

export type OutputCoin = {
  coin: CoinBalance;
  to: string;
};

export type Intention = {
  input_coins: InputCoin[];
  output_coins: OutputCoin[];
  action: string;
  exchange_id: string;
  action_params: string;
  pool_utxo_spend: string[];
  nonce: bigint;
  pool_utxo_receive: string[];
  pool_address: string;
};

export type IntentionSet = {
  tx_fee_in_sats: bigint;
  initiator_address: string;
  intentions: Intention[];
};

export type InvokeArgs = {
  intention_set: IntentionSet;
  psbt_hex: string;
};

export type TxOutputType =
  | { P2WPKH: null }
  | { P2TR: null }
  | { P2SH: null }
  | { OpReturn: bigint };

export type EstimateMinTxFeeArgs = {
  input_types: TxOutputType[];
  pool_address: string;
  output_types: TxOutputType[];
};

export type OutpointWithValue = {
  maybe_rune: [CoinBalance];
  value: bigint;
  script_pubkey_hex: string;
  outpoint: string;
};

export type DepositOffer = {
  nonce: bigint;
  pool_utxo: [
    {
      maybe_rune: [CoinBalance];
      sats: bigint;
      txid: string;
      vout: number;
    }
  ];
};

export type BorrowOffer = {
  nonce: bigint;
  pool_utxo: {
    maybe_rune: [CoinBalance];
    sats: bigint;
    txid: string;
    vout: number;
  };
  input_runes: CoinBalance;
  output_btc: CoinBalance;
};

export interface TxInput {
  data: {
    hash: string;
    index: number;
    witnessUtxo?: { value: number; script: Buffer };
    tapInternalKey?: Buffer;
    nonWitnessUtxo?: Buffer;
  };
  utxo: UnspentOutput;
}

export type ToSignInput = {
  publicKey?: string;
  address?: string;
  index: number;
};
