# Bug: External navigation links get locale prefix

## Problem

When using `external: true` in the navigation configuration, Shipyard still prepends the locale prefix to external URLs.

**Expected:** `https://todos.levinkeller.de`
**Actual:** `/dehttps://todos.levinkeller.de`

This results in broken links that point to non-existent local paths.

## Reproduction

```js
// astro.config.mjs
shipyard({
  navigation: {
    app: {
      label: 'Zur App',
      href: 'https://todos.levinkeller.de',
      external: true  // <-- This should prevent locale prefix
    },
  },
})
```

In the rendered HTML, the link becomes:
```html
<a href="/dehttps://todos.levinkeller.de">Zur App</a>
```

## Expected Behavior

When `external: true` is set, the `href` should be used as-is without any locale prefix:
```html
<a href="https://todos.levinkeller.de" target="_blank" rel="noopener">Zur App</a>
```

## Affected Component

The issue is likely in the navigation rendering logic in `@levino/shipyard-base` where it builds the href for navigation items. It should check the `external` flag before prepending the locale.

## Workaround

None known - external links in navigation are currently broken.
