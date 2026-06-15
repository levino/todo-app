/**
 * Guard against rapid double-submits.
 *
 * Tapping a confirm/action button several times in quick succession used to
 * fire multiple POSTs; the 2nd/3rd then failed server-side ("already
 * completed"). Locking a button disables it and marks it so a second lock
 * attempt returns `false`, letting the caller abort the duplicate submit. The
 * tasks page also drops a daisyUI spinner into the locked button for feedback.
 *
 * The lockable shape is intentionally a structural subset of HTMLButtonElement
 * so the logic is unit-testable without a DOM.
 */
export interface LockableButton {
  disabled: boolean
  dataset: { locked?: string }
  classList: { add: (...tokens: string[]) => void; remove: (...tokens: string[]) => void }
}

/**
 * Lock the button. Returns `true` if it was newly locked (the caller should
 * proceed with the submit) or `false` if it was already locked (the caller
 * should abort — this is a duplicate tap).
 */
export function lockSubmitButton(button: LockableButton): boolean {
  if (button.dataset.locked === '1') return false
  button.dataset.locked = '1'
  button.disabled = true
  button.classList.add('btn-disabled')
  return true
}

/** Release a previously locked button so it can be used again. */
export function unlockSubmitButton(button: LockableButton): void {
  button.dataset.locked = ''
  button.disabled = false
  button.classList.remove('btn-disabled')
}
