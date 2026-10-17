import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

// ---- Scene setup ----
const fov = 75;
const aspect = w / h;
const near = 0.01; // changing camera distance from the model
const far = 15;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.up.set(0, 0, 1);
camera.position.set(0.248, 0.131, 0.204);
camera.lookAt(0, 1, 0.05);

const scene = new THREE.Scene();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.03;

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x9FC5E8, side: THREE.DoubleSide })
);
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.HemisphereLight(0xffffff, 0x000000));

// ---- Overhead light ----
const LAMP_POSITION = new THREE.Vector3(0.0, 0.05, 0.5);
const LAMP_TARGET   = new THREE.Vector3(0.0, 0.05, 0.1);
const LAMP_INTENSITY = 2.0;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const lamp = new THREE.DirectionalLight(0xffffff, LAMP_INTENSITY);
lamp.position.copy(LAMP_POSITION);
lamp.target.position.copy(LAMP_TARGET);
lamp.castShadow = true;
lamp.shadow.mapSize.set(2048, 2048);
lamp.shadow.camera.near = 0.01;
lamp.shadow.camera.far = 2;
lamp.shadow.camera.left = -0.3;
lamp.shadow.camera.right = 0.3;
lamp.shadow.camera.top = 0.3;
lamp.shadow.camera.bottom = -0.3;
lamp.shadow.bias = -0.0005;
scene.add(lamp);
scene.add(lamp.target);

// Small glowing bulb so you can see where the light is
const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 })
);
bulb.position.copy(LAMP_POSITION);
scene.add(bulb);

// ---- Model loading ----
const loader = new GLTFLoader();
function loadModel(path) {
    return new Promise((resolve, reject) => {
        loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
    });
}

// ---- Joint settings ----
// Listed from the base outward: each joint is parented to the one before it,
// so moving joint 1 carries joints 2 and 3 along with it.

const JOINTS = [
    {
        name: "Part_1_3",   // upright link
        pivot: new THREE.Vector3(0.0, 0.0, 0.055),
        axis:  new THREE.Vector3(1, 0, 0),
        min: -Math.PI / 2, max: Math.PI / 2, color: 0xffcc00,
    },
    {
        name: "Part_1_2",   // long link
        pivot: new THREE.Vector3(0.0003, -0.00018, 0.18347),
        axis:  new THREE.Vector3(1, 0, 0),
        min: -Math.PI / 2, max: Math.PI / 2, color: 0x00ccff,
    },
    {
        name: "Part_1_1",   // gripper
        pivot: new THREE.Vector3(0.0003, 0.09022, 0.18875),
        axis:  new THREE.Vector3(1, 0, 0),
        min: -Math.PI / 2, max: Math.PI / 2, color: 0x66ff66,
    },
];

// Estimates a link's two end pins from its bounding box (rest pose):
//  - pin axis = thinnest dimension of the link
//  - pin position = half a link-width in from each end of the link
//  - "near" is the end closest to refPoint (the base), "far" is the other end
function detectHinge(obj, refPoint) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const dims = [size.x, size.y, size.z];
    const order = [0, 1, 2].sort((a, b) => dims[a] - dims[b]);
    const [thin, mid, long] = order;

    const lo = box.min.getComponent(long);
    const hi = box.max.getComponent(long);
    const ref = refPoint.getComponent(long);
    const nearLow = Math.abs(lo - ref) < Math.abs(hi - ref);

    const pinAt = (atLow) => {
        const p = center.clone();
        p.setComponent(long, atLow ? lo + dims[mid] / 2 : hi - dims[mid] / 2);
        return p;
    };

    const axis = new THREE.Vector3();
    axis.setComponent(thin, 1);

    return { near: pinAt(nearLow), far: pinAt(!nearLow), axis };
}

function addDebugVisuals(pivot, axis) {
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.004, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false })
    );
    marker.renderOrder = 998;
    pivot.add(marker);

    const axisLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            axis.clone().multiplyScalar(-0.06),
            axis.clone().multiplyScalar(0.06),
        ]),
        new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false })
    );
    axisLine.renderOrder = 998;
    pivot.add(axisLine);
    return marker;
}

// Finds the point on the link farthest from the pivot (in pivot space) = the "end"
function findTip(pivot, link) {
    pivot.updateWorldMatrix(true, true);
    const tip = new THREE.Vector3();
    const v = new THREE.Vector3();
    let maxDist = -1;

    link.traverse((obj) => {
        if (!obj.isMesh) return;
        const pos = obj.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
            pivot.worldToLocal(v);
            const d = v.lengthSq();
            if (d > maxDist) { maxDist = d; tip.copy(v); }
        }
    });
    return tip;
}

// Builds the kinematic chain: arm -> pivot1 -> pivot2 -> pivot3 (each holding its link)
async function buildArm() {
    const arm = await loadModel("CADModels/ArmAssemblyFull.gltf");
    scene.add(arm);

    // Let the arm cast and receive shadows from the lamp
    arm.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    const base = arm.getObjectByName("Part_1");
    const links = JOINTS.map((j) => arm.getObjectByName(j.name));

    if (!base || links.some((l) => !l)) {
        console.log("Couldn't find one or more parts");
        return [];
    }

    // 1) Work out each hinge
    arm.updateWorldMatrix(true, true);

    let hinges;
    hinges = JOINTS.map((cfg) => ({
        pivot: cfg.pivot.clone(),
        axis: cfg.axis.clone().normalize(),
    }));

    // 2) Nest the pivots: each one is a child of the previous pivot
    const rig = [];
    let parent = arm;

    JOINTS.forEach((cfg, i) => {
        const pivot = new THREE.Group();
        pivot.name = `pivot_${cfg.name}`;

        parent.updateWorldMatrix(true, false);
        pivot.position.copy(parent.worldToLocal(hinges[i].pivot.clone()));
        parent.add(pivot);
        pivot.updateWorldMatrix(true, false);

        pivot.attach(links[i]);   // keeps the link exactly where it is in the world
        const marker = addDebugVisuals(pivot, hinges[i].axis);

        rig.push({
            cfg,
            pivot,
            link: links[i],
            marker,
            axis: hinges[i].axis,   // in the parent's frame (== world axis at rest)
            angle: 0,
            handle: null,
        });

        parent = pivot;
    });

    // 3) Draggable handle at the end of each link (after the full chain exists)
    rig.forEach((j) => {
        j.handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.008, 24, 24),
            new THREE.MeshBasicMaterial({ color: j.cfg.color, depthTest: false })
        );
        j.handle.renderOrder = 999;   // draw on top of the model
        j.handle.position.copy(findTip(j.pivot, j.link));
        j.pivot.add(j.handle);
    });

    return rig;
}

// ---- Dragging (one set of listeners for all joints) ----
let rig = [];
let active = null;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane();
const hit = new THREE.Vector3();
const pivotWorld = new THREE.Vector3();
const axisWorld = new THREE.Vector3();
const prevVec = new THREE.Vector3();
const currVec = new THREE.Vector3();
const cross = new THREE.Vector3();

function updateRay(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
}

function pickJoint() {
    const hits = raycaster.intersectObjects(rig.map((j) => j.handle));
    if (hits.length === 0) return null;
    return rig.find((j) => j.handle === hits[0].object) || null;
}

// Intersect the mouse ray with the plane the active handle sweeps through.
function getPlaneVector(joint, out) {
    joint.pivot.getWorldPosition(pivotWorld);
    joint.pivot.parent.updateWorldMatrix(true, false);
    axisWorld.copy(joint.axis).transformDirection(joint.pivot.parent.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(axisWorld, pivotWorld);
    if (!raycaster.ray.intersectPlane(plane, hit)) return false;
    out.copy(hit).sub(pivotWorld);
    return true;
}

renderer.domElement.addEventListener("pointerdown", (e) => {
    updateRay(e);
    const joint = pickJoint();
    if (!joint) return;
    if (!getPlaneVector(joint, prevVec)) return;

    active = joint;
    controls.enabled = false;   // stop the camera orbiting while dragging
    renderer.domElement.setPointerCapture(e.pointerId);
    joint.handle.material.color.set(0xff8800);
});

renderer.domElement.addEventListener("pointermove", (e) => {
    updateRay(e);

    if (!active) {
        renderer.domElement.style.cursor = pickJoint() ? "grab" : "";
        return;
    }

    if (!getPlaneVector(active, currVec)) return;

    // Signed angle between previous and current mouse vectors, around the axis
    cross.crossVectors(prevVec, currVec);
    const delta = Math.atan2(cross.dot(axisWorld), prevVec.dot(currVec));

    active.angle = THREE.MathUtils.clamp(active.angle + delta, active.cfg.min, active.cfg.max);
    active.pivot.quaternion.setFromAxisAngle(active.axis, active.angle);

    prevVec.copy(currVec);
});

function endDrag(e) {
    if (!active) return;
    active.handle.material.color.set(active.cfg.color);
    active = null;
    controls.enabled = true;
    renderer.domElement.releasePointerCapture(e.pointerId);
}
renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);

// Press R to reset every joint to the rest pose
window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "r") return;
    rig.forEach((j) => { j.angle = 0; j.pivot.quaternion.identity(); });
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

buildArm().then((result) => { rig = result});
animate();