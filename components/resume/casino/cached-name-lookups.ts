import type { Object3D } from 'three'

/**
 * `root.getObjectByName` searches the whole subtree on every call; the dealer rig
 * looks its bones up by name dozens of times a frame. Results are cached until
 * anything is added to or removed from the subtree, and a hit is only used while
 * it still has that name and is still under `root`, so the result is what the
 * search would return. (Renaming another object to a cached name is not tracked;
 * nothing in the rig renames objects.)
 */
export function cacheNameLookups(root: Object3D) {
  const search = root.getObjectByName.bind(root)
  const cache = new Map<string, Object3D>()
  const under = (o: Object3D) => { for (let n: Object3D | null = o; n !== null; n = n.parent) if (n === root) return true; return false }
  const clear = () => cache.clear()
  const listen = (o: Object3D) => {
    o.addEventListener('childadded', ({ child }: { child: Object3D }) => { clear(); child.traverse(listen) })
    o.addEventListener('childremoved', clear)
  }
  root.traverse(listen)
  root.getObjectByName = (name: string) => {
    const hit = cache.get(name)
    if (hit !== undefined && hit.name === name && under(hit)) return hit
    const found = search(name)
    if (found !== undefined) cache.set(name, found)
    return found
  }
}
