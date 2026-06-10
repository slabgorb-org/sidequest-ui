// Scroll-spy for the reference TOC (2026-06-09 redesign bundle).
//
// Tracks which anchored heading is nearest above a 110px line from the
// viewport top. Plain passive scroll listener — no IntersectionObserver
// bookkeeping, no scrollIntoView anywhere. Headings are the elements NodeTree
// marks with `data-toc-anchor` plus the `.reference-section[id]` wrappers.

import { useEffect, useState } from "react";

export function useScrollSpy(deps: readonly unknown[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const headings = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-toc-anchor], .reference-section[id]"));
    const onScroll = () => {
      const line = 110; // px from viewport top
      let current: string | null = null;
      for (const el of headings()) {
        const top = el.getBoundingClientRect().top;
        if (top <= line) current = el.id || el.getAttribute("data-toc-anchor");
        else break;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // The caller names what invalidates the heading set (sections identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return activeId;
}
