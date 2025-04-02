import { Actor, HttpAgent } from "@dfinity/agent";

import { idlFactory } from "./did";

export const actor = Actor.createActor(idlFactory, {
  agent: HttpAgent.createSync({
    host: "https://icp0.io",
    retryTimes: 30,
  }),
  canisterId: "rwkfp-zyaaa-aaaao-qj7nq-cai",
});
