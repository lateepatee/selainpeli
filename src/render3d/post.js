// Matalan resoluution piirto ja PS1/VHS-ilme. Pelilogiikka ei tunne tätä tiedostoa.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';

const COLOR_LEVELS = 20;                  // väriportaita per kanava (PS1:n 15-bittinen väri on karkeasti tätä)

// Verteksien nykiminen: kärjet napsahtavat 2 pikselin ruudukkoon, jolloin liikkuvat mallit väpättävät.
export const snapUniform = { value: new THREE.Vector2(100, 56) };

// Lisää materiaaliin verteksien napsautuksen. Palauttaa saman materiaalin.
export function psx(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniform;
    shader.vertexShader = 'uniform vec2 uSnap;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vec2 snapped = gl_Position.xy / gl_Position.w;
       snapped = floor(snapped * uSnap + 0.5) / uSnap;
       gl_Position.xy = snapped * gl_Position.w;`,
    );
  };
  return material;
}

const POST_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Värisiirtymä, rae, porrastettu ja ditteröity väri. Ei sumennusta.
const POST_FRAG = `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uHurt;
uniform float uLevels;
varying vec2 vUv;

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 Bayer-matriisi ilman taulukkoa (WebGL1-yhteensopiva)
  float m = 0.0;
  if (i < 0.5) m = 0.0; else if (i < 1.5) m = 8.0; else if (i < 2.5) m = 2.0; else if (i < 3.5) m = 10.0;
  else if (i < 4.5) m = 12.0; else if (i < 5.5) m = 4.0; else if (i < 6.5) m = 14.0; else if (i < 7.5) m = 6.0;
  else if (i < 8.5) m = 3.0; else if (i < 9.5) m = 11.0; else if (i < 10.5) m = 1.0; else if (i < 11.5) m = 9.0;
  else if (i < 12.5) m = 15.0; else if (i < 13.5) m = 7.0; else if (i < 14.5) m = 13.0; else m = 5.0;
  return (m + 0.5) / 16.0;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 px = 1.0 / uRes;
  vec3 c;
  // Värisiirtymä on hillitty: vain osa punaisesta ja sinisestä on yhden pikselin sivussa.
  vec3 mid = texture2D(tScene, vUv).rgb;
  c.r = mix(mid.r, texture2D(tScene, vUv + vec2(px.x, 0.0)).r, 0.4);
  c.g = mid.g;
  c.b = mix(mid.b, texture2D(tScene, vUv - vec2(px.x, 0.0)).b, 0.4);
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));

  vec2 cell = floor(vUv * uRes);
  float grain = hash(cell + floor(uTime * 24.0) * 17.0) - 0.5;
  c += grain * 0.035;

  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * 0.9;
  c += vec3(0.55, 0.0, 0.0) * uHurt * (0.4 + dot(d, d) * 3.0);

  c = floor(c * uLevels + bayer4(cell)) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createPipeline(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const target = new THREE.WebGLRenderTarget(4, 4, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
  });

  const uniforms = {
    tScene: { value: target.texture },
    uRes: { value: new THREE.Vector2(4, 4) },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uLevels: { value: COLOR_LEVELS },
  };
  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false }),
  );
  quad.frustumCulled = false;
  postScene.add(quad);

  let resH = 225;

  // Piirtopinnan korkeus on kiinteä (laatutaso, quality.js); leveys seuraa ikkunaa, jotta pikselit ovat neliöitä.
  function resize() {
    const width = Math.max(160, Math.round(resH * window.innerWidth / Math.max(1, window.innerHeight)));
    renderer.setSize(width, resH, false);
    target.setSize(width, resH);
    uniforms.uRes.value.set(width, resH);
    // Napsautusruudukko pysyy samana laadusta riippumatta, jotta nykiminen näyttää kaikilla samalta.
    snapUniform.value.set((width / resH) * 56, 56);
    return width / resH;
  }

  function setResolution(height) {
    resH = height;
    return resize();
  }

  function render(scene, camera, time, hurt) {
    uniforms.uTime.value = time;
    uniforms.uHurt.value = hurt;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }

  return { renderer, resize, setResolution, render };
}
