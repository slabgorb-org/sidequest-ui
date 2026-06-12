import { useState } from "react";
import type { CSSProperties } from "react";

// Cap at 2 initials — avatar badges are ~2ch wide, and uncapped initials on
// a long sentence-name produce noise like "TCMSTRIR". (Mirrors the prior
// toAvatarInitials in CharacterPanel; centralized here.)
// eslint-disable-next-line react-refresh/only-export-components
export function toAvatarInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export interface PortraitFrameProps {
  /** Resolved portrait URL; when absent or on load error, initials render. */
  url?: string | null;
  /** Display name — source of the alt text and the initials monogram. */
  name: string;
  /** Tailwind size classes, e.g. "w-12 h-12". */
  sizeClass: string;
  /** Tailwind rounded-rect radius class, e.g. "rounded-lg". Never rounded-full. */
  radiusClass: string;
  /** Inline style for the <img> (e.g. FOLIO gold border). */
  imgStyle?: CSSProperties;
  /** Inline style for the initials box (e.g. FOLIO paper/crimson + display font). */
  initialsStyle?: CSSProperties;
  /** Extra classes appended to the <img> frame. */
  imgClassName?: string;
  /** Extra classes appended to the initials frame. */
  initialsClassName?: string;
}

export function PortraitFrame({
  url,
  name,
  sizeClass,
  radiusClass,
  imgStyle,
  initialsStyle,
  imgClassName = "",
  initialsClassName = "",
}: PortraitFrameProps) {
  const [errored, setErrored] = useState(false);
  const showImg = Boolean(url) && !errored;

  if (showImg) {
    return (
      <img
        src={url as string}
        alt={name}
        onError={() => setErrored(true)}
        className={`${sizeClass} ${radiusClass} aspect-square object-cover shrink-0 ${imgClassName}`}
        style={imgStyle}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      data-testid="portrait-frame-initials"
      className={`${sizeClass} ${radiusClass} aspect-square shrink-0 flex items-center justify-center ${initialsClassName}`}
      style={initialsStyle}
    >
      {toAvatarInitials(name)}
    </span>
  );
}
