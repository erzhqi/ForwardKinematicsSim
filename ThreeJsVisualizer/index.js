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
const near = 0.01; // lowered since the model is tiny
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

// ---- Model loading ----
const loader = new GLTFLoader();
function loadModel(path) {
    return new Promise((resolve, reject) => {
        loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
    });
}

// ---- Joint settings ----
const AXIS = new THREE.Vector3(1, 0, 0);   // overwritten by auto-detect in buildArm
const MIN_ANGLE = -Math.PI / 2;            // ±90° from upright
const MAX_ANGLE =  Math.PI / 2;

// If the auto-detected hinge is slightly off, put the values from the console here
// (arm-local coordinates). Leave as null to use auto-detect.
const PIVOT_OVERRIDE = null;  // e.g. new THREE.Vector3(0, 0, 0.03)
const AXIS_OVERRIDE  = null;  // e.g. new THREE.Vector3(1, 0, 0)

async function buildArm() {
    const arm = await loadModel("CADModels/OneJointArmAssembly.gltf");
    scene.add(arm);

    const base = arm.getObjectByName("Part_1");
    const Joint1 = arm.getObjectByName("Part_1_1");

    if (!base || !Joint1) {
        console.log("Couldn't find one or more parts");
        return;
    }

    // --- Estimate hinge location and axis from the arm bar's bounding box ---
    arm.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(Joint1);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const dims = [size.x, size.y, size.z];
    const order = [0, 1, 2].sort((a, b) => dims[a] - dims[b]);
    const thin = order[0];   // thickness of the bar  -> along the hinge pin
    const mid  = order[1];   // width of the bar
    const long = order[2];   // length of the bar

    const pivotPos = center.clone();
    // pin sits about half a bar-width up from the bottom (rounded end)
    pivotPos.setComponent(long, box.min.getComponent(long) + dims[mid] / 2);

    const axis = new THREE.Vector3();
    axis.setComponent(thin, 1);

    if (PIVOT_OVERRIDE) pivotPos.copy(PIVOT_OVERRIDE);
    if (AXIS_OVERRIDE) axis.copy(AXIS_OVERRIDE).normalize();

    AXIS.copy(axis);
    console.log("Hinge pivot:", pivotPos, "axis:", axis);

    // --- Pivot group placed at the hinge, joint re-parented to it ---
    const pivot1 = new THREE.Group();
    pivot1.position.copy(pivotPos);
    arm.add(pivot1);
    pivot1.updateMatrixWorld(true);
    pivot1.attach(Joint1);   // attach() keeps the joint's current world transform

    // Debug visuals: red dot = pivot, line = rotation axis (delete once it looks right)
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.004, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false })
    );
    marker.renderOrder = 998;
    pivot1.add(marker);

    const axisLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            axis.clone().multiplyScalar(-0.06),
            axis.clone().multiplyScalar(0.06),
        ]),
        new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false })
    );
    axisLine.renderOrder = 998;
    pivot1.add(axisLine);

    return { pivot1, Joint1 };
}

// Finds the point on the joint farthest from the pivot (in pivot space) = the "end"
function findTip(pivot, joint) {
    pivot.updateWorldMatrix(true, true);
    const tip = new THREE.Vector3();
    const v = new THREE.Vector3();
    let maxDist = -1;

    joint.traverse((obj) => {
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

function setupDragging(pivot, joint) {
    // Draggable handle at the end of the joint
    const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false })
    );
    handle.renderOrder = 999;           // draw on top of the model
    handle.position.copy(findTip(pivot, joint));
    pivot.add(handle);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const plane = new THREE.Plane();
    const hit = new THREE.Vector3();
    const pivotWorld = new THREE.Vector3();
    const axisWorld = new THREE.Vector3();
    const prevVec = new THREE.Vector3();
    const currVec = new THREE.Vector3();
    const cross = new THREE.Vector3();

    let dragging = false;
    let angle = 0;

    function updateRay(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
    }

    // Intersect mouse ray with the plane the handle sweeps through
    function getPlaneVector(out) {
        pivot.getWorldPosition(pivotWorld);
        axisWorld.copy(AXIS).transformDirection(pivot.parent.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(axisWorld, pivotWorld);
        if (!raycaster.ray.intersectPlane(plane, hit)) return false;
        out.copy(hit).sub(pivotWorld);
        return true;
    }

    renderer.domElement.addEventListener("pointerdown", (e) => {
        updateRay(e);
        if (raycaster.intersectObject(handle).length === 0) return;
        if (!getPlaneVector(prevVec)) return;

        dragging = true;
        controls.enabled = false;  // stop the camera orbiting while dragging
        renderer.domElement.setPointerCapture(e.pointerId);
        handle.material.color.set(0xff8800);
    });

    renderer.domElement.addEventListener("pointermove", (e) => {
        updateRay(e);

        if (!dragging) {
            const over = raycaster.intersectObject(handle).length > 0;
            renderer.domElement.style.cursor = over ? "grab" : "";
            return;
        }

        if (!getPlaneVector(currVec)) return;

        // Signed angle between the previous and current mouse vectors, around the axis
        cross.crossVectors(prevVec, currVec);
        const delta = Math.atan2(cross.dot(axisWorld), prevVec.dot(currVec));

        angle = THREE.MathUtils.clamp(angle + delta, MIN_ANGLE, MAX_ANGLE);
        pivot.quaternion.setFromAxisAngle(AXIS, angle);

        prevVec.copy(currVec);
    });

    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        controls.enabled = true;
        handle.material.color.set(0xffcc00);
        renderer.domElement.releasePointerCapture(e.pointerId);
    }
    renderer.domElement.addEventListener("pointerup", endDrag);
    renderer.domElement.addEventListener("pointercancel", endDrag);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

buildArm().then((parts) => {
    if (parts) setupDragging(parts.pivot1, parts.Joint1);
});
animate();