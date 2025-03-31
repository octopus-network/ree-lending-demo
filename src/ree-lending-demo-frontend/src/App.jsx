import { useState, useEffect } from "react";
import { ree_lending_demo_backend } from "declarations/ree-lending-demo-backend";

import { Topbar } from "./components/Topbar";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { LaserEyesProvider } from "@omnisat/lasereyes";
import { PoolRow } from "./components/PoolRow";

function App() {
  const [poolList, setPoolList] = useState();

  useEffect(() => {
    ree_lending_demo_backend
      .get_pool_list({
        from: [],
        limit: 20,
      })
      .then((res) => {
        console.log(res);
        setPoolList(res);
      });
  }, []);

  return (
    <LaserEyesProvider
      config={{
        network: "testnet4",
      }}
    >
      <div className="flex flex-col">
        <Topbar />
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full flex-col">
          {poolList === undefined ? (
            <div className="min-h-[50vh] flex items-center justify-center">
              <Loader2 className="text-[#e4ab00] animate-spin size-12" />
            </div>
          ) : (
            <>
              <div className="text-xl font-semibold">Pools</div>
              <div className="mt-4">
                <div className="grid grid-cols-11 text-xs text-muted-foreground px-4 mb-2">
                  <div className="col-span-4">
                    <span>Pool</span>
                  </div>
                  <div className="col-span-3">
                    <span>BTC Reserved</span>
                  </div>
                  <div className="col-span-3">
                    <span>Coin Reserved</span>
                  </div>
                </div>
                {poolList.map((pool) => (
                  <PoolRow pool={pool} key={pool.key} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <Toaster />
    </LaserEyesProvider>
  );
}

export default App;
