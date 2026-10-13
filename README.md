# Forward Kinematics Simulator

A three DOF robotic arm represented in two ways: 2D using Matplotlib points/graphs and sliders, 3D using an interactive custon 3D model in Three.js

## Versions

### 2D (Python / matplotlib)
Dynamically plots the position of the arm using sliders for input angles and forward kinematics.

```bash
python3 -m venv venv
source venv/bin/activate
pip3 install matplotlib numpy
python3 JointSimulation.py
```

On Windows, activate the file with ```bash venv\Scripts\activate ``` instead of ``` source venv/bin/activate ```

### 3D (three.js)
Loads the CAD model (`CADModels/ArmAssemblyFull.gltf`) and lets you move each joint by dragging.

- Three colored handles sit at the end of each link. Click and drag one to rotate that joint.
- Joints are chained, so moving joint 1 carries joints 2 and 3 with it.
- Rotate, zoom and pan the camera by dragging empty space.
- Press **R** to reset the arm to its starting pose.

Download the VS Code Live Server: install the Live Server extension, right-click index.html, and choose "Open with Live Server"

## How the 3D arm works

- Each link is attached to a pivot placed at its hinge, and the pivots are nested: base → joint 1 → joint 2 → joint 3.
- Rotating a pivot about its axis rotates everything inside it, which gives forward kinematics automatically.
- Pivot positions and axes are hardcoded in the `JOINTS` array in `main_full_arm.js`. They were measured from the hinge holes in the CAD file; all three hinges run along the X axis.

## Files

| Path | What it is |
|---|---|
| `ThreeJsVisualizer/index.js` | 3D scene, joint setup and dragging |
| `ThreeJsVisualizer/CADModels/ArmAssemblyFull.gltf` | Arm CAD model |
| `JointSimulation.py` | 2D forward kinematics |

## Future Updates

- Adding inverse kinematics to some degree
- Making traversing the Three.js space more intuitive with buttons, etc.
