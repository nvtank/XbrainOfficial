/**
 * Static geometry batcher: furniture builders push primitives with a transform
 * stack; everything sharing a material is merged into ONE mesh.
 * Result: the whole office (50 desks, 89 seats, rooms) renders in ~40 draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MATS, type MatKey } from './materials';

type V3 = [number, number, number];

export class Batch {
  private parts = new Map<MatKey, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /** Push a local transform (position + yaw, optional uniform scale). */
  push(x: number, y: number, z: number, rotY = 0, scale = 1) {
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.tmp.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale, scale, scale));
    this.stack.push(this.top().clone().multiply(this.tmp));
    return this;
  }

  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Run `fn` inside a pushed transform. */
  at(x: number, y: number, z: number, rotY: number, fn: () => void) {
    this.push(x, y, z, rotY);
    fn();
    this.pop();
  }

  private top() {
    return this.stack[this.stack.length - 1];
  }

  add(mat: MatKey, geo: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]));
    this.tmp.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    geo.applyMatrix4(this.top().clone().multiply(this.tmp));
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(geo);
    return this;
  }

  box(mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rot: V3 = [0, 0, 0]) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), [x, y, z], rot);
  }

  /** Box whose bottom sits at y (convenient for furniture). */
  boxB(mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rot: V3 = [0, 0, 0]) {
    return this.box(mat, w, h, d, x, y + h / 2, z, rot);
  }

  rbox(mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.02, rot: V3 = [0, 0, 0]) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.add(mat, mergeVertices(new RoundedBoxGeometry(w, h, d, 2, rr)), [x, y, z], rot);
  }

  cyl(mat: MatKey, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 14, rot: V3 = [0, 0, 0]) {
    return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), [x, y, z], rot);
  }

  sphere(mat: MatKey, r: number, x: number, y: number, z: number, scale: V3 = [1, 1, 1], seg = 10) {
    return this.add(mat, new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), [x, y, z], [0, 0, 0], scale);
  }

  torus(mat: MatKey, r: number, t: number, x: number, y: number, z: number, rot: V3 = [0, 0, 0], arc = Math.PI * 2) {
    return this.add(mat, new THREE.TorusGeometry(r, t, 8, 20, arc), [x, y, z], rot);
  }

  plane(mat: MatKey, w: number, h: number, x: number, y: number, z: number, rot: V3 = [0, 0, 0]) {
    return this.add(mat, new THREE.PlaneGeometry(w, h), [x, y, z], rot);
  }

  /** Build merged meshes (one per material). */
  build(opts: { castShadow?: boolean; receiveShadow?: boolean; noShadow?: MatKey[] } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const anyNonIndexed = geos.some((g) => !g.index);
      const list = anyNonIndexed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
      const merged = mergeGeometries(list, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, MATS[mat]);
      mesh.name = `batch:${mat}`;
      const shadowless = opts.noShadow?.includes(mat) || mat === 'led' || mat === 'ledWarm';
      mesh.castShadow = !!opts.castShadow && !shadowless;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}
