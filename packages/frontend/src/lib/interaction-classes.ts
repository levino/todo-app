/**
 * Shared interaction-feedback class strings.
 *
 * One source of truth for the tactile/focus micro-interactions, applied across
 * the app via `class:list`. They are deliberately plain Tailwind/DaisyUI
 * utilities (not a `@layer components` class) so the literal utility names still
 * appear in the rendered HTML — which is what the integration tests assert.
 *
 * Reduced-motion is baked in via `motion-reduce:*`, so every consumer is
 * accessibility-safe by construction. (Astro's <ViewTransitions/> router already
 * honors prefers-reduced-motion for the page-level fade itself.)
 */

/** Press feedback for buttons / clickable controls. */
export const pressClasses =
  'transition-transform duration-150 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100'

/** Gentler press + hover lift for clickable cards. */
export const cardPressClasses =
  'transition-all duration-150 hover:shadow-md active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100'

/** Visible keyboard focus ring for buttons, links and inputs. */
export const focusRingClasses =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
