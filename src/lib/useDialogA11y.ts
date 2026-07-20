// Accessibilité des modales (§8) — hook partagé, sans dépendance.
//
// Fournit le comportement clavier standard d'une boîte de dialogue :
//   • Échap ferme la modale ;
//   • le focus est PIÉGÉ dans la modale (Tab / Maj+Tab bouclent sur les éléments
//     focusables internes — on ne « sort » jamais dans la page derrière) ;
//   • à l'ouverture, le focus entre dans la modale ; à la fermeture, il REVIENT sur
//     l'élément qui l'avait déclenchée (retour au bouton d'origine).
//
// Usage :
//   const ref = useRef<HTMLDivElement>(null)
//   useDialogA11y({ open, onClose, containerRef: ref })
//   return open ? <div ref={ref} role="dialog" aria-modal="true">…</div> : null

import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogA11y({
  open,
  onClose,
  containerRef,
}: {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
}): void {
  useEffect(() => {
    if (!open) return
    // Élément à re-focaliser une fois la modale fermée (le déclencheur).
    const previouslyFocused = document.activeElement as HTMLElement | null

    const container = containerRef.current
    // Focus initial : premier élément focusable, sinon le conteneur lui-même.
    const focusFirst = () => {
      const el = container?.querySelector<HTMLElement>(FOCUSABLE)
      if (el) el.focus()
      else if (container) {
        container.setAttribute('tabindex', '-1')
        container.focus()
      }
    }
    // Léger différé : laisse le DOM de la modale se monter avant de focaliser.
    const raf = requestAnimationFrame(focusFirst)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !container) return
      // Piège de focus : boucle sur les éléments focusables de la modale.
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown, true)
      // Retour du focus au déclencheur (s'il est toujours dans le document).
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open, onClose, containerRef])
}
