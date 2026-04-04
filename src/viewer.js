import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- Scene setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(3, 3, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// --- Grid helper ---
const grid = new THREE.GridHelper(10, 10, 0x444466, 0x333355);
scene.add(grid);

// --- Demo mesh: a simple crystal shape ---
const crystalGeometry = new THREE.OctahedronGeometry(1, 0);
crystalGeometry.scale(1, 1.6, 1);
const crystalMaterial = new THREE.MeshStandardMaterial({
  color: 0x6c63ff,
  roughness: 0.3,
  metalness: 0.6,
  flatShading: true,
});
const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
crystal.position.y = 1.6;
scene.add(crystal);

// --- Resize handling ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ---
function animate() {
  requestAnimationFrame(animate);
  crystal.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
}

animate();
