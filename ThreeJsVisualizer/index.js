import * as THREE from "three"; // Importing Three.js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js" // Loader for GLTF 3D models
import { OrbitControls } from "three/addons/controls/OrbitControls.js"; // Allows for zooming in and moving around with the cursor

const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

//Setting up the scene
const fov = 75;
const aspect = w / h;
const near = 0.1;
const far = 15;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.z = 0.5;
const scene = new THREE.Scene();

// Setting up cursor controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.03;


const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000);
scene.add(hemiLight);

// Setting up GTLF loader for Custom 3D parts
const loader = new GLTFLoader();
function loadModel(path){
    return new Promise((resolve, reject) => {
        loader.load(
            path,
            (gltf) => {
                resolve(gltf.scene);
            },
            undefined,
            (error) => reject(error)
        );
    });
}

async function buildArm(){
    const arm = await loadModel("CADModels/ArmAssembly.gltf");
    scene.add(arm);

    const base = arm.getObjectByName("Part_1");
    const Joint1 = arm.getObjectByName("Part_1_1");
    // const Joint2 = arm.getObjectByName("Part_1_2");
    // const Joint3 = arm.getObjectByName("Part_1_3");

    if (!base || !Joint1 /*|| !Joint2 || !Joint3*/){
        console.log("Couldn't find one or more parts");
        return;
    }

    const pivot1 = new THREE.Group();
    pivot1.position.set(0.00029, 0, 0.055);
    const pivotMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.005, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    pivot1.add(pivotMarker);
    arm.attach(pivot1);
    pivot1.attach(Joint1);

    // const pivot2 = new THREE.Group();
    // pivot2.position.set(0, 0, 0);
    // Joint1.attach(pivot2);
    // pivot2.attach(Joint2);

    // const pivot3 = new THREE.Group();
    // pivot3.position.set(0, 0, 0);
    // Joint2.attach(pivot3);
    // pivot3.attach(Joint3);

    return {pivot1/*, pivot2, pivot3*/};
}

function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}
buildArm();
animate();