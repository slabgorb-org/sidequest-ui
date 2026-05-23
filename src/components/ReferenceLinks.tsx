interface ReferenceLinksProps {
  pack: string | null | undefined;
  world: string | null | undefined;
}

export function ReferenceLinks({ pack, world }: ReferenceLinksProps) {
  if (!pack) return null;
  return (
    <div className="reference-links flex gap-3 px-3 py-1 text-sm" data-testid="reference-links">
      <a
        className="reference-links__link underline hover:no-underline"
        href={`/reference/rules/${pack}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Rules
      </a>
      {world ? (
        <a
          className="reference-links__link underline hover:no-underline"
          href={`/reference/lore/${pack}/${world}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lore
        </a>
      ) : null}
    </div>
  );
}
