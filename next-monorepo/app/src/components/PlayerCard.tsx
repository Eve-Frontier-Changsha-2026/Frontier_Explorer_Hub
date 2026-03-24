"use client";

import { useCharacter } from "@/hooks/use-character";

interface PlayerCardProps {
  address: string;
  className?: string;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function AddressGradient({ address }: { address: string }) {
  // Deterministic gradient from address bytes
  const seed = parseInt(address.slice(2, 10), 16);
  const h1 = seed % 360;
  const h2 = (seed * 7) % 360;
  return (
    <div
      className="w-10 h-10 rounded-full shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${h1}, 60%, 40%), hsl(${h2}, 50%, 30%))`,
      }}
    />
  );
}

export function PlayerCard({ address, className = "" }: PlayerCardProps) {
  const { data, isLoading } = useCharacter(address);

  if (isLoading) {
    return (
      <div
        data-testid="player-card-skeleton"
        className={`flex gap-3 items-center p-3 rounded-lg border border-eve-panel-border bg-eve-panel animate-pulse ${className}`}
      >
        <div className="w-10 h-10 rounded-full bg-eve-panel-border/30" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-20 bg-eve-panel-border/30 rounded" />
          <div className="h-2.5 w-28 bg-eve-panel-border/30 rounded" />
        </div>
      </div>
    );
  }

  const name = data?.name;
  const truncated = truncateAddr(address);

  return (
    <div
      className={`flex gap-3 items-start p-3 rounded-lg border border-eve-panel-border bg-eve-panel ${className}`}
    >
      {/* Avatar */}
      {data?.avatarUrl ? (
        <img
          src={data.avatarUrl}
          alt={name ?? truncated}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <AddressGradient address={address} />
      )}

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-0.5">
        {name ? (
          <div className="text-eve-gold font-medium text-sm truncate">{name}</div>
        ) : (
          <div className="text-eve-muted font-mono text-xs">{truncated}</div>
        )}

        {data?.tribeId != null && (
          <div className="text-eve-muted text-[0.65rem]">tribe #{data.tribeId}</div>
        )}
        {data?.tenant && (
          <div className="text-eve-cold text-[0.65rem]">{data.tenant}</div>
        )}

        <div className="text-eve-muted/60 font-mono text-[0.6rem] truncate">{truncated}</div>

        {data?.itemId && (
          <div className="text-eve-muted/50 text-[0.6rem]">item: {data.itemId}</div>
        )}
      </div>
    </div>
  );
}
