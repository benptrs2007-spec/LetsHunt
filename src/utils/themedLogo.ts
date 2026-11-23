/// <reference types="vite/client" />
import horizontalLogoRaw from '../../letshunthorizontallogo.svg?raw';
import { ThemeVariantMode } from '../types';

/* Single source of truth for the LetsHunt wordmark.

   The logo ships as letshunthorizontallogo.svg with two hard-coded colors:
   #ff751f for the deer accent and #000000 for the wordmark strokes. Every
   surface that shows the logo recolors those two values for the active
   theme/mode, so the app stays theme-aware while the .svg file remains the
   single source of truth for the artwork.

   This lives in a shared module rather than inside Header because the logo
   now appears in two places (the header and the desktop navigation rail).
   Keeping the substitution in one function means the two can never drift
   apart or disagree about what "hunting theme" looks like.

   `sizeClass` lets each caller pick a height without re-implementing the
   sizing logic; the SVG is horizontal (viewBox 90x45, so 2:1), so height
   drives width via w-auto. */
export function buildThemedLogo(
  theme: ThemeVariantMode,
  isDark: boolean,
  sizeClass: string
): string {
  const logoAccent =
    theme === 'hunting'
      ? isDark
        ? 'rgb(var(--ui-warm-text-rgb))'
        : 'rgb(var(--ui-warm-rgb))'
      : 'rgb(var(--ui-accent-rgb))';

  const logoText = 'rgb(var(--ui-text-rgb))';

  return horizontalLogoRaw
    .replace('<svg ', `<svg class="${sizeClass}" `)
    .split('#ff751f')
    .join(logoAccent) // deer accent
    .split('#000000')
    .join(logoText); // wordmark text
}
