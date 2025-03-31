import { Topbar } from "./components/Topbar";

import { Toaster } from "./components/ui/sonner";
import { LaserEyesProvider } from "@omnisat/lasereyes";
import Home from "./Home";

function App() {
  return (
    <LaserEyesProvider
      config={{
        network: "testnet4",
      }}
    >
      <div className="flex flex-col">
        <Topbar />
        <Home />
      </div>
      <Toaster />
    </LaserEyesProvider>
  );
}

export default App;
