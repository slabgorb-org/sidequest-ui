// Sticky table of contents (2026-06-09 redesign; 2026-06-17 accordion-aware).
//
// Items come from `buildToc` (buildToc.ts), derived from the projection itself.
// The rail is its own scroll area on long documents (CSS max-height) and
// auto-follows the active item with manual scrollTop math.
//
// 2026-06-17: with the page collapsed into a section accordion, a bare
// `href="#…"` can't expand a collapsed panel — landing on a still-collapsed
// target is a navigation fail. So each link calls `onNavigate(anchor)` (the
// shell opens the containing section, and any SRD chapter, then scrolls). The
// `href` is retained for accessibility / right-click-copy / no-JS fallback, but
// the click is intercepted.

import { useEffect, useRef } from "react";
import type { TocItem } from "./buildToc";

export function Toc({
  items,
  activeId,
  onNavigate,
}: {
  items: TocItem[];
  activeId: string | null;
  onNavigate?: (anchor: string) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  // Keep the active link visible inside the rail's own scroll area on long
  // documents (manual scrollTop math — no scrollIntoView).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !activeId) return;
    const link = nav.querySelector<HTMLElement>(`[data-active="true"]`);
    if (!link) return;
    // The sticky nav is the link's offsetParent — offsetTop is already
    // nav-relative.
    const top = link.offsetTop;
    if (top < nav.scrollTop + 24) nav.scrollTop = Math.max(0, top - 24);
    else if (top > nav.scrollTop + nav.clientHeight - 48) {
      nav.scrollTop = top - nav.clientHeight + 48;
    }
  }, [activeId]);

  const navigate = (anchor: string) => (e: React.MouseEvent) => {
    if (!onNavigate) return; // no handler → fall back to native href anchor jump
    e.preventDefault();
    onNavigate(anchor);
  };

  return (
    <nav ref={navRef} className="reference-toc" aria-label="Contents">
      <p className="reference-toc__heading">Contents</p>
      <ul className="reference-toc__list">
        {items.map((item) => {
          const sectionAnchor = `section-${item.id}`;
          return (
            <li key={item.id} className="reference-toc__item">
              <a
                className="reference-toc__link"
                href={`#${sectionAnchor}`}
                data-active={activeId === sectionAnchor}
                onClick={navigate(sectionAnchor)}
              >
                {item.label}
              </a>
              {item.children.map((child) => (
                <a
                  key={child.id}
                  className="reference-toc__link reference-toc__link--sub"
                  href={`#${child.id}`}
                  data-active={activeId === child.id}
                  onClick={navigate(child.id)}
                >
                  {child.label}
                </a>
              ))}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
