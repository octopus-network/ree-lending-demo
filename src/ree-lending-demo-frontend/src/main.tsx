import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";

import { Buffer } from "buffer";

(window as any).Buffer = (window as any).Buffer || Buffer;

bitcoin.initEccLib(ecc);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
