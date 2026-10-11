/**
 * SLS Rakete — 3D Viewer
 * Three.js r170, ES Modules
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// --- DOM-Elemente ----------------------------------------------------------
const container = document.getElementById('canvas-container');
const hintEl = document.getElementById('viewer-hint');
const loadingEl = document.getElementById('loading');

// --- Konstanten ------------------------------------------------------------
const BG_COLOR = 0x0e0e0e;
const FOG_NEAR = 50;
const FOG_FAR = 500;
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 2000;
const MAX_PIXEL_RATIO = 2;

// Zoom-Grenzen (relativ zu Modellgröße)
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;

// --- Szene, Kamera, Renderer ----------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
// Fog lässt Bodenplatte sanft in Hintergrund auslaufen
scene.fog = new THREE.Fog(BG_COLOR, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV,
  container.clientWidth / container.clientHeight,
  CAMERA_NEAR,
  CAMERA_FAR
);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// --- Beleuchtung -----------------------------------------------------------
// Umgebungslicht via RoomEnvironment (weich, neutral)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Hauptlicht (Sonne) — einziger direkter Lichtquelle
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(8, 15, 10);
sun.castShadow = true;

// Schatten-Konfiguration
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;

scene.add(sun);

// Fülllicht (sehr schwach, nur für tiefe Schatten)
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(-5, 5, -8);
scene.add(fill);

// --- Steuerung -------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.minZoom = ZOOM_MIN;
controls.maxZoom = ZOOM_MAX;
controls.minPolarAngle = 0.1;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Boden nicht von unten
controls.target.set(0, 0, 0);

// Hinweis nach erster Interaktion ausblenden
let hintHidden = false;
function hideHint() {
  if (!hintHidden) {
    hintHidden = true;
    hintEl.classList.add('hidden');
  }
}
controls.addEventListener('start', hideHint);
renderer.domElement.addEventListener('wheel', hideHint, { passive: true });

// --- Modell laden ----------------------------------------------------------
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  'assets/Nasa_Rakete_small.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // Schatten für alle Meshes aktivieren
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // DoubleSide verhindert fehlende Flächen bei inkonsistenten Normalen
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.side = THREE.DoubleSide);
          } else {
            child.material.side = THREE.DoubleSide;
          }
        }
      }
    });

    // Kamera & Controls auf Modell zentrieren
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.2;

    // Startposition: leicht erhöht, frontal versetzt
    camera.position.set(0, maxDim * 0.4, distance);
    camera.lookAt(0, maxDim * 0.15, 0);
    controls.target.set(0, maxDim * 0.15, 0);

    // Zoom-Grenzen an Modellgröße anpassen
    controls.minZoom = ZOOM_MIN;
    controls.maxZoom = ZOOM_MAX * (maxDim / 10); // Skalierung für große Modelle

    // Camera far an Szenentiefe anpassen
    camera.far = distance * 10;
    camera.updateProjectionMatrix();

    // Fog weit hinten, damit Modell nicht verdeckt wird
    scene.fog.far = distance * 8;
    scene.fog.near = distance * 0.5;

    controls.update();
    loadingEl.classList.add('hidden');
  },
  undefined,
  (err) => {
    console.error('Modell-Ladefehler:', err);
    loadingEl.textContent = 'Fehler beim Laden';
    loadingEl.style.color = '#c86';
  }
);

// --- Resize-Handling -------------------------------------------------------
function onResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
}
window.addEventListener('resize', onResize);

// --- Visibility-API: Render-Loop pausieren ---------------------------------
let animationId = null;
let isVisible = true;

function animate() {
  if (!isVisible) return;

  controls.update();
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

function handleVisibilityChange() {
  isVisible = !document.hidden;
  if (isVisible) {
    animate();
  } else if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange);

// Initialer Start
animate();

// --- Cleanup (falls nötig) -------------------------------------------------
// window.addEventListener('beforeunload', () => {
//   window.removeEventListener('resize', onResize);
//   document.removeEventListener('visibilitychange', handleVisibilityChange);
//   renderer.dispose();
// });