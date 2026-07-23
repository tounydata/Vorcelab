import { useEffect, type DependencyList } from 'react'

// Hook dédié au pattern « loader natif » (audit — réduire les exceptions
// éparpillées) : exécute une fonction de chargement (fetch Supabase → setState)
// au montage et quand ses dépendances changent. Le setState vivant DANS le
// loader (opaque au linter), react-hooks/set-state-in-effect ne se déclenche
// plus au point d'appel : ce hook REMPLACE les `useEffect(() => { load() },
// [load])` répétés ET supprime leurs désactivations inline. La règle reste en
// erreur partout ailleurs.
export function useLoadEffect(load: () => void | Promise<void>, deps: DependencyList): void {
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps fournies par l'appelant (tableau transmis tel quel)
  }, deps)
}
