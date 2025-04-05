import * as bitcoin from "bitcoinjs-lib";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Coin } from "./types";
import Decimal from "decimal.js";

import { AddressType, TxOutputType, UnspentOutput, TxInput } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ellipseMiddle(
  target: string | null,
  charsStart = 5,
  charsEnd = 5
): string {
  if (!target) {
    return "";
  }
  return `${target.slice(0, charsStart)}...${target.slice(
    target.length - charsEnd
  )}`;
}

function getFormatterRule(input: number) {
  const rules = [
    {
      exact: 0,
      formatterOptions: {
        notation: "standard",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      },
    },
    {
      upperBound: 0.0001,
      hardCodedInput: { input: 0.0001, prefix: "<" },
      formatterOptions: {
        notation: "standard",
        maximumFractionDigits: 5,
        minimumFractionDigits: 5,
      },
    },
    {
      upperBound: 1,
      formatterOptions: {
        notation: "standard",
        maximumFractionDigits: 5,
        minimumFractionDigits: 3,
      },
    },
    {
      upperBound: 1e6,
      formatterOptions: {
        notation: "standard",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      },
    },
    {
      upperBound: 1e15,
      formatterOptions: {
        notation: "compact",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    },
    {
      upperBound: Infinity,
      hardCodedInput: { input: 999_000_000_000_000, prefix: ">" },
      formatterOptions: {
        notation: "compact",
        maximumFractionDigits: 2,
      },
    },
  ];
  for (const rule of rules) {
    if (
      (rule.exact !== undefined && input === rule.exact) ||
      (rule.upperBound !== undefined && input < rule.upperBound)
    ) {
      return rule;
    }
  }

  return { hardCodedInput: undefined, formatterOptions: undefined };
}

export function formatNumber(
  input: number | string | undefined,
  noDecimals = false,
  placeholder = "-"
): string {
  const locale = "en-US";

  if (input === null || input === undefined) {
    return placeholder;
  }

  if (typeof input === "string") {
    input = parseFloat(input);
  }

  const { hardCodedInput, formatterOptions } = getFormatterRule(input);

  if (!formatterOptions) {
    return placeholder;
  }

  if (!hardCodedInput) {
    // eslint-disable-next-line
    return new Intl.NumberFormat(
      locale,
      noDecimals
        ? { notation: "compact", maximumFractionDigits: 0 }
        : (formatterOptions as any)
    ).format(input);
  }

  const { input: hardCodedInputValue, prefix } = hardCodedInput;
  if (hardCodedInputValue === undefined) return placeholder;

  return (
    (prefix ?? "") +
    // eslint-disable-next-line
    new Intl.NumberFormat(
      locale,
      noDecimals
        ? { notation: "compact", maximumFractionDigits: 0 }
        : (formatterOptions as any)
    ).format(hardCodedInputValue)
  );
}

export function parseCoinAmount(value: string, coin: Coin | undefined) {
  if (!coin || !value) {
    return "";
  }

  return new Decimal(value).mul(Math.pow(10, coin.decimals)).toFixed();
}

export function formatCoinAmount(value: string, coin: Coin | undefined) {
  if (!coin || !value) {
    return "";
  }

  return new Decimal(value).div(Math.pow(10, coin.decimals)).toFixed();
}

export function getP2trAressAndScript(pubkey: string) {
  const { address, output } = bitcoin.payments.p2tr({
    internalPubkey: Buffer.from(pubkey, "hex"),
    network: bitcoin.networks.testnet,
  });

  return { address, output: output ? bytesToHex(output) : "" };
}

export function decodeAddress(address: string) {
  const mainnet = bitcoin.networks.bitcoin;
  const testnet = bitcoin.networks.testnet;
  const regtest = bitcoin.networks.regtest;
  let decodeBase58: bitcoin.address.Base58CheckResult;
  let decodeBech32: bitcoin.address.Bech32Result;

  let addressType: AddressType;
  if (
    address.startsWith("bc1") ||
    address.startsWith("tb1") ||
    address.startsWith("bcrt1")
  ) {
    try {
      decodeBech32 = bitcoin.address.fromBech32(address);

      if (decodeBech32.version === 0) {
        if (decodeBech32.data.length === 20) {
          addressType = AddressType.P2WPKH;
        } else {
          addressType = AddressType.P2WSH;
        }
      } else {
        addressType = AddressType.P2TR;
      }
      return {
        addressType,
      };
    } catch {}
  } else {
    try {
      decodeBase58 = bitcoin.address.fromBase58Check(address);
      if (decodeBase58.version === mainnet.pubKeyHash) {
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === testnet.pubKeyHash) {
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === regtest.pubKeyHash) {
        // do not work

        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === mainnet.scriptHash) {
        addressType = AddressType.P2SH_P2WPKH;
      } else if (decodeBase58.version === testnet.scriptHash) {
        addressType = AddressType.P2SH_P2WPKH;
      } else {
        // do not work

        addressType = AddressType.P2SH_P2WPKH;
      }
      return {
        addressType,
      };
    } catch {}
  }

  return {
    addressType: AddressType.UNKNOWN,
    dust: 546,
  };
}

export function getAddressType(address: string): AddressType {
  return decodeAddress(address).addressType;
}

export function addressTypeToString(addressType: AddressType): TxOutputType {
  if (addressType === AddressType.P2WPKH) {
    return { P2WPKH: null };
  } else if (addressType === AddressType.P2SH_P2WPKH) {
    return { P2SH: null };
  } else {
    return { P2TR: null };
  }
}

export function hexToBytes(hex: string) {
  const cleanHex = hex.replace(/^0x/, "").replace(/\s/g, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${cleanHex.length}`);
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(cleanHex.substr(i * 2, 2), 16);
    if (isNaN(byte)) {
      throw new Error(`Invalid hex string at position ${i * 2}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array) {
  const hexes = Array.from({ length: 256 }, (_, i) =>
    i.toString(16).padStart(2, "0")
  );
  // pre-caching improves the speed 6x
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}

export function utxoToInput(utxo: UnspentOutput, estimate?: boolean): TxInput {
  let data: any = {
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      value: Number(utxo.satoshis),
      script: Buffer.from(utxo.scriptPk, "hex"),
    },
  };
  if (
    (utxo.addressType === AddressType.P2TR ||
      utxo.addressType === AddressType.M44_P2TR) &&
    utxo.pubkey
  ) {
    const pubkey =
      utxo.pubkey.length === 66 ? utxo.pubkey.slice(2) : utxo.pubkey;
    data = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: Number(utxo.satoshis),
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: Buffer.from(pubkey, "hex"),
    };
  } else if (utxo.addressType === AddressType.P2PKH) {
    if (!utxo.rawtx || estimate) {
      const data = {
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          value: Number(utxo.satoshis),
          script: Buffer.from(utxo.scriptPk, "hex"),
        },
      };
      return {
        data,
        utxo,
      };
    }
  } else if (utxo.addressType === AddressType.P2SH_P2WPKH && utxo.pubkey) {
    const redeemData = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(utxo.pubkey, "hex"),
      network: bitcoin.networks.testnet,
    });

    data = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: Number(utxo.satoshis),
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      redeemScript: redeemData.output,
    };
  }

  return {
    data,
    utxo,
  };
}

export function selectBtcUtxos(utxos: UnspentOutput[], targetAmount: bigint) {
  const selectedUtxos: UnspentOutput[] = [];
  const remainingUtxos: UnspentOutput[] = [];

  let totalAmount = BigInt(0);
  for (const utxo of utxos) {
    if (utxo.runes.length) {
      continue;
    }
    if (totalAmount < targetAmount) {
      totalAmount += BigInt(utxo.satoshis);
      selectedUtxos.push(utxo);
    } else {
      remainingUtxos.push(utxo);
    }
  }

  return {
    selectedUtxos,
    remainingUtxos,
  };
}
