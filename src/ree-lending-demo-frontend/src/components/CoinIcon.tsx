import { Coin } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CoinIcon({
  coin,
  className,
}: {
  coin: Coin;
  className?: string;
}) {
  return (
    <img
      src={
        coin.icon
          ? coin.icon
          : `https://testnet4.ordinals.com/content/${coin.etching}i0`
      }
      width={64}
      height={64}
      className={cn("rounded-full size-6", className)}
    />
  );
}
