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
// Listed from the base outward: each joint is parented to the one before it,
// so moving joint 1 carries joints 2 and 3 along with it.
//
// HARDCODED PIVOTS (measured from the hinge holes in ArmAssemblyFull.gltf)
//   pivot = centre of the hinge pin, axis = direction of the pin.
//   Both are in world coordinates with the arm in the pose it has in the file.
//   All three pins are 10 mm holes (r = 5 mm) running along the X axis:
//     joint 1: base clevis        <-> bottom of the upright link   (y = 0,        z = 0.055)
//     joint 2: top of upright link <-> forked end of the long link  (y = -0.00018, z = 0.18347)
//     joint 3: end of the long link <-> gripper                     (y = 0.09022,  z = 0.18875)
//
// Set AUTO_DETECT = true only if you swap the CAD model and want the console to
// print a fresh starting guess for new values.
const AUTO_DETECT = false;

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

    const base = arm.getObjectByName("Part_1");
    const links = JOINTS.map((j) => arm.getObjectByName(j.name));

    if (!base || links.some((l) => !l)) {
        console.log("Couldn't find one or more parts");
        return [];
    }

    // 1) Work out each hinge (hardcoded, or auto-detected while calibrating)
    arm.updateWorldMatrix(true, true);

    let hinges;
    if (AUTO_DETECT) {
        const baseCenter = new THREE.Box3().setFromObject(base).getCenter(new THREE.Vector3());
        const autos = links.map((l) => detectHinge(l, baseCenter));

        hinges = JOINTS.map((cfg, i) => {
            // Joint 1: the near end of its own link. Every later joint shares its pin with
            // the previous link, so it uses that link's far-end pin (and pin axis).
            const src = i === 0
                ? { pivot: autos[0].near, axis: autos[0].axis }
                : { pivot: autos[i - 1].far, axis: autos[i - 1].axis };
            return { pivot: src.pivot.clone(), axis: src.axis.clone().normalize() };
        });

        const fmt = (v) => `new THREE.Vector3(${+v.x.toFixed(5)}, ${+v.y.toFixed(5)}, ${+v.z.toFixed(5)})`;
        console.log("AUTO_DETECT values - paste into JOINTS, then set AUTO_DETECT = false:");
        JOINTS.forEach((cfg, i) => {
            console.log(`${cfg.name}:\n  pivot: ${fmt(hinges[i].pivot)},\n  axis:  ${fmt(hinges[i].axis)},`);
        });
    } else {
        hinges = JOINTS.map((cfg) => ({
            pivot: cfg.pivot.clone(),
            axis: cfg.axis.clone().normalize(),
        }));
    }

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
// Axis and pivot are re-read every call, so this stays correct even when
// parent joints have rotated.
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

// ---- Calibration: nudge a pivot onto its hinge hole ----
// Works in the rest pose, so press R first. Then:
//   1 / 2 / 3        select a joint (its red dot turns white)
//   Arrow keys       move the pivot in the plane of the hinge
//   PageUp/PageDown  move the pivot along the pin (to centre it between the ears)
//   Shift            fine steps
// Final values are printed to the console, ready to paste into JOINTS.
const CALIBRATE = false;
const STEP = 0.0005;
const STEP_FINE = 0.0001;
let selected = 1;   // start on joint 2

function selectJoint(i) {
    if (!rig[i]) return;
    selected = i;
    rig.forEach((j, k) => j.marker.material.color.set(k === i ? 0xffffff : 0xff0000));
    console.log(`Selected ${rig[i].cfg.name} (joint ${i + 1})`);
}

function nudgePivot(i, worldDelta) {
    const j = rig[i];
    if (rig.some((r) => r.angle !== 0)) {
        console.log("Press R to return to the rest pose before calibrating.");
        return;
    }
    const parent = j.pivot.parent;
    parent.updateWorldMatrix(true, false);
    const target = j.pivot.getWorldPosition(new THREE.Vector3()).add(worldDelta);
    const local = parent.worldToLocal(target);
    const d = local.clone().sub(j.pivot.position);

    // Move the pivot, and counter-move everything inside it so only the pivot moves
    j.pivot.position.copy(local);
    j.link.position.sub(d);
    j.handle.position.sub(d);
    const next = rig[i + 1];
    if (next) next.pivot.position.sub(d);
}

function printCalibration() {
    const fmt = (v) => `new THREE.Vector3(${+v.x.toFixed(5)}, ${+v.y.toFixed(5)}, ${+v.z.toFixed(5)})`;
    console.log("Calibrated values - paste into JOINTS and set AUTO_DETECT = false:");
    rig.forEach((j) => {
        const p = j.pivot.getWorldPosition(new THREE.Vector3());
        console.log(`${j.cfg.name}:\n  pivot: ${fmt(p)},\n  axis:  ${fmt(j.axis)},`);
    });
}

window.addEventListener("keydown", (e) => {
    if (!CALIBRATE || rig.length === 0) return;

    if (e.key === "1" || e.key === "2" || e.key === "3") {
        selectJoint(Number(e.key) - 1);
        return;
    }

    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const j = rig[selected];
    const step = e.shiftKey ? STEP_FINE : STEP;

    // pin axis = world axis with the biggest component; the other two span the hinge plane
    const comps = [Math.abs(j.axis.x), Math.abs(j.axis.y), Math.abs(j.axis.z)];
    const k = comps.indexOf(Math.max(...comps));
    const [u, v] = [0, 1, 2].filter((c) => c !== k);

    const delta = new THREE.Vector3();
    if (e.key === "ArrowLeft")  delta.setComponent(u, -step);
    if (e.key === "ArrowRight") delta.setComponent(u,  step);
    if (e.key === "ArrowUp")    delta.setComponent(v,  step);
    if (e.key === "ArrowDown")  delta.setComponent(v, -step);
    if (e.key === "PageUp")     delta.setComponent(k,  step);
    if (e.key === "PageDown")   delta.setComponent(k, -step);

    nudgePivot(selected, delta);
    printCalibration();
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

buildArm().then((result) => { rig = result; if (CALIBRATE) selectJoint(selected); });
animate();