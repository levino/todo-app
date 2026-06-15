import { describe, expect, it } from 'vitest'
import { lockSubmitButton, unlockSubmitButton } from './submit-lock'

// Minimal stand-in for the parts of an HTMLButtonElement the lock touches, so
// the guard logic can be tested without a DOM.
function fakeButton() {
  const classes = new Set<string>()
  return {
    disabled: false,
    dataset: {} as { locked?: string },
    classList: {
      add: (...t: string[]) => {
        for (const c of t) classes.add(c)
      },
      remove: (...t: string[]) => {
        for (const c of t) classes.delete(c)
      },
      has: (c: string) => classes.has(c),
    },
  }
}

describe('lockSubmitButton', () => {
  it('locks and disables the button on the first call', () => {
    const b = fakeButton()
    expect(lockSubmitButton(b)).toBe(true)
    expect(b.disabled).toBe(true)
    expect(b.classList.has('btn-disabled')).toBe(true)
  })

  it('returns false on a second (duplicate) call so the caller can abort', () => {
    const b = fakeButton()
    expect(lockSubmitButton(b)).toBe(true)
    expect(lockSubmitButton(b)).toBe(false)
    expect(lockSubmitButton(b)).toBe(false)
  })

  it('unlock re-enables the button and allows locking again', () => {
    const b = fakeButton()
    lockSubmitButton(b)
    unlockSubmitButton(b)
    expect(b.disabled).toBe(false)
    expect(b.classList.has('btn-disabled')).toBe(false)
    // A fresh action on the same button (e.g. reusing the dialog) may lock again.
    expect(lockSubmitButton(b)).toBe(true)
  })
})
