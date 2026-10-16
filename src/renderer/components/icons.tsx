import type { JSX } from 'react'

/**
 * Feather-style inline SVG icons. Stroke icons inherit `currentColor`, so
 * they recolor with the theme automatically — no sprite files needed.
 */

interface IconProps {
  size?: number
}

function strokeSvg(size: number, ...paths: readonly JSX.Element[]): JSX.Element {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths}
    </svg>
  )
}

/** Home. */
export function IconHome({ size = 18 }: IconProps): JSX.Element {
  return strokeSvg(
    size,
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    <path d="M9 22V12h6v10" />,
  )
}

/** YouTube (play triangle in the brand shape). */
export function IconYoutube({ size = 18 }: IconProps): JSX.Element {
  return strokeSvg(size, <polygon points="6 4 20 12 6 20 6 4" />)
}

/** X (Twitter) — official glyph, filled. */
export function IconX({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zM17.083 19.77h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/** Instagram (camera). */
export function IconInstagram({ size = 18 }: IconProps): JSX.Element {
  return strokeSvg(
    size,
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />,
    <circle cx="12" cy="13" r="4" />,
  )
}

/** Download queue. */
export function IconQueue({ size = 18 }: IconProps): JSX.Element {
  return strokeSvg(
    size,
    <path d="M12 2 2 7l10 5 10-5-10-5z" />,
    <path d="M2 12l10 5 10-5" />,
    <path d="M2 17l10 5 10-5" />,
  )
}

/** History (clock). */
export function IconHistory({ size = 18 }: IconProps): JSX.Element {
  return strokeSvg(size, <circle cx="12" cy="12" r="9" />, <path d="M12 7v5l3.5 2" />)
}

/** Settings (sliders — lighter than a full cog). */
export function IconSettings({ size = 18 }: IconProps): JSX.Element {
  return strokeSvg(
    size,
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />,
    <path d="M1 14h6M9 8h6M17 16h6" />,
  )
}

/** Paw print, for the brand mark. */
export function IconPaw({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <ellipse cx="7.2" cy="8.2" rx="2.1" ry="2.7" />
      <ellipse cx="12" cy="6.6" rx="2.2" ry="2.9" />
      <ellipse cx="16.8" cy="8.2" rx="2.1" ry="2.7" />
      <path d="M12 11c-3.3 0-6.5 2.9-6.5 5.9 0 1.9 1.4 3.1 3.2 3.1 1.2 0 2.2-.6 3.3-.6s2.1.6 3.3.6c1.8 0 3.2-1.2 3.2-3.1 0-3-3.2-5.9-6.5-5.9z" />
    </svg>
  )
}

// -- Window controls (frameless titlebar) -------------------------------------

function controlSvg(size: number, ...paths: readonly JSX.Element[]): JSX.Element {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths}
    </svg>
  )
}

export function IconMinimize({ size = 16 }: IconProps): JSX.Element {
  return controlSvg(size, <path d="M5 15h14" />)
}

export function IconMaximize({ size = 16 }: IconProps): JSX.Element {
  return controlSvg(size, <rect height="14" rx="1.5" width="14" x="5" y="5" />)
}

export function IconRestore({ size = 16 }: IconProps): JSX.Element {
  return controlSvg(size, <path d="M9 5h10v10" />, <path d="M5 9h10v10H5z" />)
}

export function IconClose({ size = 16 }: IconProps): JSX.Element {
  return controlSvg(size, <path d="M6 6l12 12" />, <path d="M18 6 6 18" />)
}
