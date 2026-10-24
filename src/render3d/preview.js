// Hahmon esikatselu hahmovalikossa: sama 3D-hahmo kuin pelissä, omalla pienellä piirtäjällä.
// Piirtäjä luodaan vasta, kun valikko avataan ensimmäisen kerran.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { PLAYER_COLORS } from '../constants.js';
import { createPlayerActor, poseHuman } from './actors.js';

const SIZE = 90;   // piirtotarkkuus; canvas venytetään CSS:llä terävin pikselein

let canvas = null;
let renderer = null;
let scene = null;
let cam = null;
let actor = null;
let key = '';

export function initPreview(c) {
  canvas = c;
}

export function drawPreview(look, now) {
  if (!canvas) return;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0x8090a8, 1.6));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.4);
    sun.position.set(1.5, 3, 4);
    scene.add(sun);
    cam = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    cam.position.set(0, 1.7, 4.6);
    cam.lookAt(0, 1.15, 0);
  }
  const k = `${look.color}|${look.hat}|${look.pattern}|${look.face}`;
  if (k !== key) {
    if (actor) scene.remove(actor.root);
    actor = createPlayerActor(PLAYER_COLORS[look.color] ?? PLAYER_COLORS[0], look);
    scene.add(actor.root);
    key = k;
  }
  // Hahmo katsoo kameraan päin ja kääntelee itseään hitaasti.
  const t = now / 1000;
  actor.root.rotation.y = -Math.PI / 2 + Math.sin(t * 1.3) * 0.7;
  poseHuman(actor, 0, false, t);
  renderer.render(scene, cam);
}
