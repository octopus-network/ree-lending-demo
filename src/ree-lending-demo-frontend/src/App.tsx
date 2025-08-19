import { Topbar } from "./components/Topbar";

import { Toaster } from "./components/ui/sonner";
import { LaserEyesProvider } from "@omnisat/lasereyes";
import Home from "./Home";
import { Network, ReeProvider } from "@omnity/ree-ts-sdk";
import { idlFactory } from "./lib/exchange/did";

function App() {
  return (
    <LaserEyesProvider
      config={{
        network: "testnet4",
      }}
    >
      <ReeProvider
        config={{
          network: Network.Testnet,
          maestroApiKey: "v8PTI7ZyNHxUzPvojaabBXuYIUgf9glT",
          exchangeIdlFactory: idlFactory,
          exchangeId: "LENDING_DEMO",
          exchangeCanisterId: "rwkfp-zyaaa-aaaao-qj7nq-cai",
        }}
      >
        <div className="flex flex-col">
          <Topbar />
          <Home />
        </div>
        <Toaster />
      </ReeProvider>
    </LaserEyesProvider>
  );
}

export default App;
