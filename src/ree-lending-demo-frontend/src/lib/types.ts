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

export interface Pool {
  key: string;
  address: string;
  name: string;
  btc_reserved: bigint;
  coin_reserved: {
    id: string;
    value: bigint;
  }[];
}

export type CoinBalance = {
  id: string;
  value: bigint;
};

export type DepositOffer = {
  nonce: bigint;
  pool_utxo: [
    {
      coins: [CoinBalance];
      sats: bigint;
      txid: string;
      vout: number;
    }
  ];
};

export type BorrowOffer = {
  nonce: bigint;
  pool_utxo: {
    coins: [CoinBalance];
    sats: bigint;
    txid: string;
    vout: number;
  };
  input_runes: CoinBalance;
  output_btc: CoinBalance;
};
