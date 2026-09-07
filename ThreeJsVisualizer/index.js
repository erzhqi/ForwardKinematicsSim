import * as THREE from "three"; // Importing Three.js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js" // Loader for GLTF 3D models
import { OrbitControls } from "three/addons/controls/OrbitControls.js"; // Allows for zooming in and moving around with the cursor

const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement)

//Setting up the scene
const fov = 75;
const aspect = w / h;
const near = 0.1;
const far = 10;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.z = 0.25;
const scene = new THREE.Scene();

// Setting up cursor controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.03;


const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000);
scene.add(hemiLight);

// Setting up GTLF loader for Custom 3D parts
const loader = new GLTFLoader();
loader.load(
    "CADModels/ArmBase.gltf",
    (gltf) => {
        gltf.scene.rotation.x = Math.PI / 0.625;
        scene.add(gltf.scene);
    },
    undefined,
    (error) => console.error("Error loading GLTF:", error)
)

function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}
animate();