import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement)
const fov = 75;
const aspect = w / h;
const near = 0.1;
const far = 10;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.z = 0.5;
const scene = new THREE.Scene();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.03;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000);
scene.add(hemiLight);

const testGeo = new THREE.BoxGeometry(10, 10, 10);
const testMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
scene.add(new THREE.Mesh(testGeo, testMat));

const loader = new GLTFLoader();

loader.load(
    "CADModels/ArmBase.gltf",
    (gltf) => {
        scene.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(gltf.scene);
    },
    undefined,
    (error) => console.error("Error loading GLTF:", error)
)

function animate(t = 0){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}
animate();