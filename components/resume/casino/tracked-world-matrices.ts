import { Matrix4, Object3D, Vector3 } from 'three'

/**
 * Dirty-tracked world matrices for the dealer rig.
 *
 * The rig solves IK by turning a joint and reading positions back: per frame it
 * asks three for ~235 full-skeleton updates and ~1300 parent-chain walks, about
 * 22k matrix recomputations for a ~40-node skeleton (plus the renderer's scene
 * update once per render pass). Nearly all of them recompute unchanged matrices.
 *
 * Here every input of a tracked object (position, quaternion, rotation, scale) is
 * watched. A change marks the object dirty and flags its ancestors ("something
 * below changed"), so:
 *   - a full update walks only into flagged branches and returns at once when
 *     nothing under it changed;
 *   - a parent-chain walk (getWorldPosition, worldToLocal…) returns at once when
 *     nothing has changed since the object was last confirmed current;
 *   - a matrix is recomposed / re-multiplied only when its own inputs or its
 *     parent's world matrix changed.
 * Skipped work is always work that would have reproduced the stored values, so
 * poses are exactly the same (`?rigverify` recomputes and compares every skip).
 *
 * Tracked: the dealer subtree and its ancestors up to the scene. Objects whose
 * matrices can change unseen (matrixAutoUpdate / matrixWorldAutoUpdate false, a
 * pivot) and everything outside the dealer keep three's semantics: their parents
 * always visit them and pass `force` exactly as three does. Classes that override
 * the update methods (SkinnedMesh) keep their own methods; their inputs are still
 * watched. Tracked objects' matrix / matrixWorld must not be written directly.
 * Keep in sync with Object3D.updateWorldMatrix / updateMatrixWorld on a three upgrade.
 */

interface Track {
  /** a local input changed since `matrix` was composed */
  dirty: boolean
  /** this object or one below it needs a visit in the next full update */
  below: boolean
  /** has descendants whose changes aren't watched: always visit them, with three's force */
  alwaysVisit: boolean
  /** uses tracked update methods (false: watched inputs only, e.g. SkinnedMesh) */
  own: boolean
  /** world-matrix version (unique) and the parent's version it was computed from */
  stamp: number
  parentStamp: number
  /** `mutations` when this world matrix was last confirmed current */
  cleanAt: number
  /** every ancestor is watched, so "no mutations since" proves this matrix current */
  anchored: boolean
}
type Tracked = Object3D & { __track?: Track }

const base = Object3D.prototype
let stamps = 0
/** bumps on every watched input change */
let mutations = 0
const same = (a: number, b: number) => a === b && (a !== 0 || 1 / a === 1 / b)

const verify = { on: false, checked: 0, mismatches: 0 }
const _m = new Matrix4()

/** Flag `o` and its ancestors for the next full update (objects with their own update methods pass it on). */
function flagUp(o: Tracked | null) {
  for (let n = o; n !== null && n.__track !== undefined; n = n.parent as Tracked | null) {
    const t = n.__track
    if (!t.own) continue
    if (t.below) return
    t.below = true
  }
}
function changed(o: Tracked) {
  mutations++
  o.__track!.dirty = true
  flagUp(o.__track!.own ? o : (o.parent as Tracked | null))
}
/** The parent's world-matrix version; NaN (always recompute) when it isn't tracked by stamp. */
function parentVersion(o: Object3D): number {
  const parent = o.parent as Tracked | null
  if (parent === null) return -1
  const pt = parent.__track
  return pt !== undefined && pt.own ? pt.stamp : NaN
}

function watchVector(v: Vector3, onChange: () => void) {
  let x = v.x, y = v.y, z = v.z
  Object.defineProperties(v, {
    x: { configurable: true, enumerable: true, get: () => x, set: (n: number) => { if (!same(n, x)) { x = n; onChange() } } },
    y: { configurable: true, enumerable: true, get: () => y, set: (n: number) => { if (!same(n, y)) { y = n; onChange() } } },
    z: { configurable: true, enumerable: true, get: () => z, set: (n: number) => { if (!same(n, z)) { z = n; onChange() } } },
  })
}
type Callbacked = { _onChangeCallback: () => void; _onChange: (cb: () => void) => unknown }
function watchCallback(target: unknown, onChange: () => void) {
  const t = target as Callbacked, previous = t._onChangeCallback
  t._onChange(() => { previous(); onChange() })
}

const eligible = (o: Object3D) => o.matrixAutoUpdate && o.matrixWorldAutoUpdate && o.pivot === null

function verifyNode(o: Tracked) {
  if (!verify.on) return
  verify.checked++
  const e = o.matrixWorld.elements
  if (o.matrixAutoUpdate) {
    _m.compose(o.position, o.quaternion, o.scale)
    for (let i = 0; i < 16; i++) if (!same(_m.elements[i], o.matrix.elements[i])) { verify.mismatches++; return }
  }
  if (o.parent === null) _m.copy(o.matrix)
  else _m.multiplyMatrices(o.parent.matrixWorld, o.matrix)
  for (let i = 0; i < 16; i++) if (!same(_m.elements[i], e[i])) { verify.mismatches++; return }
}
function verifyChain(o: Tracked | null) { for (let n = o; n !== null; n = n.parent as Tracked | null) verifyNode(n) }
function verifyTree(o: Tracked) { if (verify.on) o.traverse((n) => verifyNode(n as Tracked)) }

/** Bring this object's own matrices up to date; returns whether its world matrix changed. */
function refresh(o: Tracked, t: Track): boolean {
  if (t.dirty) { o.updateMatrix(); t.dirty = false } // updateMatrix sets matrixWorldNeedsUpdate
  const parent = o.parent
  const parentStamp = parentVersion(o)
  if (o.matrixWorldNeedsUpdate || parentStamp !== t.parentStamp) {
    if (parent === null) o.matrixWorld.copy(o.matrix)
    else o.matrixWorld.multiplyMatrices(parent.matrixWorld, o.matrix)
    o.matrixWorldNeedsUpdate = false
    t.parentStamp = parentStamp
    t.stamp = ++stamps
    return true
  }
  verifyNode(o)
  return false
}

/** Three's own update for an object that is momentarily ineligible; everything below is suspect. */
function fallback(o: Tracked, t: Track) {
  t.dirty = true
  t.stamp = ++stamps
  mutations++
  flagUp(o)
}

function trackedUpdateWorldMatrix(this: Tracked, updateParents: boolean, updateChildren: boolean, force = false) {
  const t = this.__track!
  if (!eligible(this)) { fallback(this, t); return base.updateWorldMatrix.call(this, updateParents, updateChildren, force) }
  if (updateChildren !== true) {
    // Parent-chain walk: nothing watched changed since this matrix was confirmed.
    if (t.anchored && t.cleanAt === mutations && !this.matrixWorldNeedsUpdate) { if (verify.on) verifyChain(this); return }
    if (updateParents === true && this.parent !== null) this.parent.updateWorldMatrix(true, false)
    if (refresh(this, t) && this.children.length > 0) flagUp(this) // children are stale now
    t.cleanAt = mutations
    return
  }
  if (updateParents === true && this.parent !== null) this.parent.updateWorldMatrix(true, false)
  fullUpdate(this, t, (child, f) => child.updateWorldMatrix(false, true, f))
}

function trackedUpdateMatrixWorld(this: Tracked, force?: boolean) {
  const t = this.__track!
  if (!eligible(this)) { fallback(this, t); return base.updateMatrixWorld.call(this, force) }
  fullUpdate(this, t, (child, f) => child.updateMatrixWorld(f))
}

/**
 * The object and everything below it. Incoming `force` is not needed: a tracked
 * object's inputs and parent stamp say exactly when its matrices change.
 */
function fullUpdate(o: Tracked, t: Track, visit: (child: Object3D, force: boolean) => void) {
  const parentStamp = parentVersion(o)
  if (!t.below && !t.alwaysVisit && !t.dirty && !o.matrixWorldNeedsUpdate && parentStamp === t.parentStamp) {
    verifyTree(o)
    return
  }
  const moved = refresh(o, t)
  // Unwatched descendants get three's force (always true for an auto-updating
  // object); watched ones decide for themselves.
  const force = t.alwaysVisit || moved
  const children = o.children
  for (let i = 0, l = children.length; i < l; i++) visit(children[i], force)
  t.below = false
  t.cleanAt = mutations
}

function watch(o: Tracked, own: boolean, adopt = true) {
  if (o.__track) return
  const t: Track = { dirty: true, below: true, alwaysVisit: false, own, stamp: ++stamps, parentStamp: NaN, cleanAt: -1, anchored: false }
  o.__track = t
  const onChange = () => changed(o)
  watchVector(o.position, onChange)
  watchVector(o.scale, onChange)
  watchCallback(o.quaternion, onChange)
  watchCallback(o.rotation, onChange)
  if (own) {
    o.updateWorldMatrix = trackedUpdateWorldMatrix
    o.updateMatrixWorld = trackedUpdateMatrixWorld
  }
  // Objects attached to the dealer later are watched too (an unwatchable one makes
  // its ancestors always visit). The ancestor path never adopts its other children:
  // the rest of the scene keeps three's own updates.
  o.addEventListener('childadded', ({ child }: { child: Object3D }) => { if (adopt) watchTree(child); refreshVisits(o) })
}

const overridden = (o: Object3D) => o.updateWorldMatrix !== base.updateWorldMatrix || o.updateMatrixWorld !== base.updateMatrixWorld

function watchTree(root: Object3D) {
  root.traverse((n) => {
    const o = n as Tracked
    if (o.__track) return
    // Overriding classes keep their methods; manual matrices can change unseen.
    if (!eligible(o) && !overridden(o)) return
    watch(o, !overridden(o))
  })
}

/** alwaysVisit = has an unwatched descendant (or one that may change unseen). */
function refreshVisits(from: Object3D) {
  const unseen = (n: Object3D): boolean => {
    const t = (n as Tracked).__track
    let any = !t || !n.matrixAutoUpdate || !n.matrixWorldAutoUpdate || n.pivot !== null
    for (const c of n.children) if (unseen(c)) any = true
    if (t) t.alwaysVisit = n.children.some((c) => !(c as Tracked).__track || (c as Tracked).__track!.alwaysVisit || !eligible(c))
    return any
  }
  let top: Object3D = from
  while (top.parent !== null && (top.parent as Tracked).__track) top = top.parent
  unseen(top)
  // Anchored: the whole chain up to the scene root is watched.
  const anchor = (n: Object3D, ok: boolean) => {
    const t = (n as Tracked).__track
    if (!t) return
    t.anchored = ok
    for (const c of n.children) anchor(c, ok)
  }
  anchor(top, top.parent === null)
  flagUp(from as Tracked)
}

/** Track `root` (the dealer) and its ancestors; call once it is mounted in the scene. */
export function trackWorldMatrices(root: Object3D) {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('rigverify')) {
    verify.on = true
    ;(globalThis as { __rigVerify?: typeof verify }).__rigVerify = verify
  }
  watchTree(root)
  // The ancestor path (the dealer's group up to the scene): their own inputs are
  // watched, but they always visit their other, unwatched children.
  for (let a = root.parent; a !== null; a = a.parent) if (!overridden(a) && eligible(a)) watch(a as Tracked, true, false)
  refreshVisits(root)
}
