interface PairingCodeDisplayProps {
  code: string;
  status: string;
}

export function PairingCodeDisplay({ code, status }: PairingCodeDisplayProps) {
  return (
    <div className="p6-pairing-code flex flex-col items-center gap-4">
      <p className="p6-caption text-p6-text-muted uppercase tracking-widest">Pairing Code</p>
      <div className="p6-pairing-code__digits font-mono text-5xl font-bold tracking-[0.35em] text-p6-cyan">
        {code || '------'}
      </div>
      <p className="p6-body text-p6-text-muted capitalize">{status.replace(/_/g, ' ')}</p>
    </div>
  );
}
