"use client";

interface DecryptedIntel {
  exactCoords: { x: string; y: string; z: string };
  description: string;
}

interface Props {
  data: DecryptedIntel | null;
  isDecrypting: boolean;
  error: string | null;
  onRetry?: () => void;
}

export function DecryptedIntelView({ data, isDecrypting, error, onRetry }: Props) {
  if (isDecrypting) {
    return (
      <div className="border border-eve-gold/20 p-3 mt-2">
        <div className="text-[0.65rem] text-eve-gold animate-pulse">
          Decrypting intel...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-eve-danger/30 p-3 mt-2">
        <div className="text-[0.65rem] text-eve-danger">Decryption failed: {error}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-[0.6rem] border border-eve-cold/40 text-eve-cold px-1.5 py-0.5 mt-1 hover:bg-eve-cold/10"
          >
            RETRY
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="border border-eve-gold/30 bg-[rgba(228,180,128,0.04)] p-3 mt-2">
      <div className="text-[0.6rem] text-eve-gold mb-1.5">DECRYPTED INTEL</div>
      {(data.exactCoords.x || data.exactCoords.y || data.exactCoords.z) && (
        <div className="text-[0.65rem] text-eve-text mb-1">
          <span className="text-eve-muted">Exact Coords:</span>{" "}
          ({data.exactCoords.x}, {data.exactCoords.y}, {data.exactCoords.z})
        </div>
      )}
      {data.description && (
        <div className="text-[0.65rem] text-eve-text">
          <span className="text-eve-muted">Details:</span> {data.description}
        </div>
      )}
    </div>
  );
}
