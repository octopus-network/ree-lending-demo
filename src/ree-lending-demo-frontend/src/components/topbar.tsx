import { Button } from "./ui/button";

export function Topbar() {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
      <span className="font-semibold">REE Lending</span>
      <Button>Connect Wallet</Button>
    </div>
  );
}
