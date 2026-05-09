import { useEffect, type RefObject } from "react"

/**
 * Close a popover / menu when the user clicks anywhere outside the given
 * element. Pass `enabled = false` to disable the listener (typically when the
 * popover is closed).
 *
 * Multiple refs can be supplied — the close handler only fires when the click
 * lands outside *all* of them. Useful when the trigger button lives outside
 * the popover container and shouldn't count as "outside" (otherwise clicking
 * the trigger to close would re-open immediately due to ordering).
 *
 * Uses `mousedown` so the popover dismisses on press, before any `click` on
 * an internal element fires; that matches the platform feel of native menus.
 */
export function useOutsideClick(
  refs: RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>,
  onOutsideClick: () => void,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return
    const list = Array.isArray(refs) ? refs : [refs]

    const handle = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      for (const ref of list) {
        const el = ref.current
        if (el && el.contains(target)) return
      }
      onOutsideClick()
    }

    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  // We intentionally read refs.current at handler time, so a stable identity
  // for `refs` isn't required — only `enabled` and the callback identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onOutsideClick])
}
