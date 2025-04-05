import { UNISAT, MAGIC_EDEN, XVERSE } from "@omnisat/lasereyes";
import { Coin } from "./types";

export const UNISAT_API_URL = "https://wallet-api-testnet4.unisat.io";

export const UTXO_DUST = BigInt(546);

export const EXCHANGE_ID = "LENDING_DEMO";

export const WALLETS: Record<
  string,
  {
    name: string;
    icon: string;
    url: string;
  }
> = {
  [UNISAT]: {
    name: "Unisat",
    icon: "/unisat.png",
    url: "https://unisat.io/download",
  },
  [MAGIC_EDEN]: {
    name: "Magic Eden Wallet",
    icon: "/magic_eden.png",
    url: "https://wallet.magiceden.io/download",
  },
  [XVERSE]: {
    name: "Xverse",
    icon: "/xverse.png",
    url: "https://www.xverse.app",
  },
};

export const BITCOIN: Coin = {
  id: "0:0",
  symbol: "BTC",
  icon: "/btc.png",
  name: "Bitcoin",
  decimals: 8,
};

export const RICH: Coin = {
  id: "72798:1058",
  name: "HOPE•YOU•GET•RICH",
  runeId: "HOPEYOUGETRICH",
  runeSymbol: "🧧",
  decimals: 0,
  icon: "/rich.png",
  number: 431,
};

export const COIN_LIST: Coin[] = [BITCOIN, RICH];
