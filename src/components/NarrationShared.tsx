export function ThinkingIndicator({ className }: { className?: string }) {
  return (
    <div
      data-testid="thinking-indicator"
      className={`flex items-center justify-center gap-3 text-muted-foreground/30 ${className ?? "py-2"}`}
    >
      <span className="text-sm animate-pulse">◇</span>
      <span className="text-sm animate-pulse [animation-delay:200ms]">◇</span>
      <span className="text-sm animate-pulse [animation-delay:400ms]">◇</span>
    </div>
  );
}

export function EmptyNarrationState() {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm italic text-muted-foreground/50 animate-pulse">
        The narrator gathers their thoughts...
      </p>
    </div>
  );
}

export function NarratorConsidersInterstitial({ className }: { className?: string }) {
  return (
    <div
      data-testid="narrator-considers"
      className={`flex items-center justify-center gap-3 text-muted-foreground/30 ${className ?? "py-2"}`}
    >
      <span className="text-sm animate-pulse">◇</span>
      <span className="text-sm animate-pulse [animation-delay:200ms]">◇</span>
      <span className="text-sm animate-pulse [animation-delay:400ms]">◇</span>
      <span className="text-sm italic text-muted-foreground/40">
        The narrator considers...
      </span>
    </div>
  );
}
