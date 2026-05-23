interface ReferenceLinksProps {
  pack: string | null | undefined;
  world: string | null | undefined;
}

export function ReferenceLinks({ pack, world }: ReferenceLinksProps) {
  const rulesHref = pack ? `/reference/rules/${pack}` : null;
  const loreHref = pack && world ? `/reference/lore/${pack}/${world}` : null;
  return (
    <div className="reference-links flex gap-3 px-3 py-1 text-sm" data-testid="reference-links">
      {rulesHref ? (
        <a
          className="reference-links__link underline hover:no-underline"
          href={rulesHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          Rules
        </a>
      ) : (
        <span
          className="reference-links__link reference-links__link--disabled text-muted-foreground/40"
          aria-disabled="true"
        >
          Rules
        </span>
      )}
      {loreHref ? (
        <a
          className="reference-links__link underline hover:no-underline"
          href={loreHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lore
        </a>
      ) : (
        <span
          className="reference-links__link reference-links__link--disabled text-muted-foreground/40"
          aria-disabled="true"
        >
          Lore
        </span>
      )}
    </div>
  );
}
