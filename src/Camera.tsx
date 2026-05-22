import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AxesHelper, Object3D, Quaternion, Spherical, Vector3 } from "three";
import { useSpring } from "@react-spring/three";
import { useMapStore } from "./store";

const MOVE_SPEED = 0.01;
const ROTATE_SPEED = 0.005;
const ORBIT_SPEED = 0.008;
const MIN_MOVE_PITCH = -((80 * Math.PI) / 180);
const MAX_MOVE_PITCH = -((30 * Math.PI) / 180);
const MIN_POLAR = (30 * Math.PI) / 180;
const MAX_POLAR = (80 * Math.PI) / 180;
const DEFAULT_RADIUS = 10;
const MOVE_CAMERA_DISTANCE = 3;
const DEFAULT_MOVE_PITCH = -0.55;
const INSPECT_DISTANCE = 5;
const ZOOM_SPEED = 0.5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 50;
const MIN_INSPECT_RADIUS = 2;
const MAX_INSPECT_RADIUS = 30;

const SPRING_CONFIG = { tension: 120, friction: 18 };
const TRANSITION_CONFIG = { tension: 80, friction: 20 };

// Module-level Three.js objects: safe to mutate anywhere, invisible to React Compiler.
const cameraYawTarget = new Object3D();
const cameraPitchTarget = new Object3D();
const cameraZoomTarget = new Object3D();
const cameraYawHelper = new AxesHelper(2);
const cameraPitchHelper = new AxesHelper(1.4);

// Scratch vectors
const _targetPos = new Vector3();
const _targetQuat = new Quaternion();

export default function Camera() {
  const { camera, gl, scene } = useThree();
  const cameraMode = useMapStore((state) => state.cameraMode);
  const setCameraMode = useMapStore((state) => state.setCameraMode);
  const selectedObject = useMapStore((state) => state.selectedObject);
  const setSelectedObject = useMapStore((state) => state.setSelectedObject);
  const cameraTargetPosition = useMapStore((state) => state.cameraTargetPosition);

  const spherical = useRef(new Spherical(DEFAULT_RADIUS, Math.PI / 3, 0));
  const selectedWorldPosition = useRef(new Vector3());
  const cameraWorldPosition = useRef(new Vector3());
  const orbitOffset = useRef(new Vector3());

  // Target values that the springs chase
  const targetYaw = useRef(0);
  const targetPitch = useRef(DEFAULT_MOVE_PITCH);
  const targetPosX = useRef(0);
  const targetPosZ = useRef(0);
  const zoomDistance = useRef(MOVE_CAMERA_DISTANCE);
  const savedMoveZoom = useRef(MOVE_CAMERA_DISTANCE);

  const inInspectRef = useRef(false);
  // During transition, smoothly lerp camera instead of snapping
  const transitioning = useRef(false);
  const transitionFrom = useRef({ pos: new Vector3(), quat: new Quaternion() });

  const dragState = useRef({
    isDragging: false,
    isRightButton: false,
    previousX: 0,
    previousY: 0,
  });

  // Springs for move mode: smooth panning and rotation
  const [moveSpring, moveSpringApi] = useSpring(() => ({
    posX: 0,
    posZ: 0,
    yaw: 0,
    pitch: DEFAULT_MOVE_PITCH,
    config: SPRING_CONFIG,
  }));

  // Spring for mode transition (0 = at source, 1 = at destination)
  const [, transitionSpringApi] = useSpring(() => ({
    t: 0,
    config: TRANSITION_CONFIG,
    onChange: () => {},
  }));

  // ---- Helpers ----
  const computeInspectPosition = useCallback(() => {
    orbitOffset.current.setFromSpherical(spherical.current);
    return _targetPos
      .copy(selectedWorldPosition.current)
      .add(orbitOffset.current);
  }, []);

  const computeInspectQuaternion = useCallback(() => {
    // Temporarily position a dummy to get the quaternion for lookAt
    camera.position.copy(computeInspectPosition());
    camera.lookAt(selectedWorldPosition.current);
    _targetQuat.copy(camera.quaternion);
    return _targetQuat;
  }, [camera, computeInspectPosition]);

  // ---- Initial setup ----
  useEffect(() => {
    cameraPitchTarget.add(cameraZoomTarget);
    cameraZoomTarget.add(camera);
    cameraZoomTarget.position.set(0, 0, MOVE_CAMERA_DISTANCE);
    targetPitch.current = DEFAULT_MOVE_PITCH;
    cameraYawTarget.rotation.y = 0;
    cameraPitchTarget.rotation.x = DEFAULT_MOVE_PITCH;

    return () => {
      if (camera.parent) {
        camera.parent.remove(camera);
      }
    };
  }, [camera]);

  // ---- Respond to cameraTarget position changes ----
  useEffect(() => {
    if (inInspectRef.current) return;
    const [x, , z] = cameraTargetPosition;
    if (x === targetPosX.current && z === targetPosZ.current) return;
    targetPosX.current = x;
    targetPosZ.current = z;
    moveSpringApi.start({
      posX: x,
      posZ: z,
    });
  }, [cameraTargetPosition, moveSpringApi]);

  // ---- ESC: return to move mode ----
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !inInspectRef.current) {
        return;
      }

      inInspectRef.current = false;
      setCameraMode("move");
      setSelectedObject(null);

      // Cache current world pose for smooth transition back
      camera.getWorldPosition(transitionFrom.current.pos);
      camera.getWorldQuaternion(transitionFrom.current.quat);

      // Restore move-mode zoom distance
      zoomDistance.current = savedMoveZoom.current;

      // Re-parent camera to pitch rig at its correct local position
      cameraZoomTarget.add(camera);
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      cameraZoomTarget.position.set(0, 0, savedMoveZoom.current);
      cameraYawTarget.rotation.y = targetYaw.current;
      cameraPitchTarget.rotation.x = targetPitch.current;
      cameraYawTarget.position.x = targetPosX.current;
      cameraYawTarget.position.z = targetPosZ.current;

      // Compute the final world pose of camera after rig reset
      cameraYawTarget.updateMatrixWorld(true);
      const finalPos = new Vector3();
      const finalQuat = new Quaternion();
      camera.getWorldPosition(finalPos);
      camera.getWorldQuaternion(finalQuat);

      // Set camera back to start of transition and animate
      transitioning.current = true;
      transitionSpringApi.set({ t: 0 });
      transitionSpringApi.start({
        t: 1,
        onChange: ({ value }) => {
          if (!transitioning.current) return;
          const t = value.t as number;
          // Interpolate in world space, then write to local
          _targetPos.lerpVectors(transitionFrom.current.pos, finalPos, t);
          _targetQuat.slerpQuaternions(transitionFrom.current.quat, finalQuat, t);
          // Convert world position to local of cameraPitchTarget
          cameraZoomTarget.updateMatrixWorld(true);
          camera.position.copy(
            cameraZoomTarget.worldToLocal(_targetPos.clone()),
          );
          camera.quaternion.copy(
            cameraZoomTarget.getWorldQuaternion(new Quaternion()).invert().multiply(_targetQuat),
          );
        },
        onRest: () => {
          transitioning.current = false;
          camera.position.set(0, 0, 0);
          camera.rotation.set(0, 0, 0);
        },
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [camera, setCameraMode, setSelectedObject, transitionSpringApi]);

  // ---- Enter inspect mode ----
  useEffect(() => {
    if (cameraMode !== "inspect" || !selectedObject) {
      return;
    }

    selectedObject.getWorldPosition(selectedWorldPosition.current);

    camera.getWorldPosition(cameraWorldPosition.current);
    const offset = cameraWorldPosition.current.sub(selectedWorldPosition.current);

    spherical.current.setFromVector3(offset);
    spherical.current.radius = INSPECT_DISTANCE;
    spherical.current.phi = Math.min(
      MAX_POLAR,
      Math.max(MIN_POLAR, spherical.current.phi),
    );

    // Store current move-mode zoom so we can restore it on exit
    savedMoveZoom.current = zoomDistance.current;

    // Cache current world pose for smooth transition to orbit
    camera.getWorldPosition(transitionFrom.current.pos);
    camera.getWorldQuaternion(transitionFrom.current.quat);

    // Detach camera to world space
    scene.attach(camera);
    inInspectRef.current = true;

    // Set initial position for orbit (final target of transition)
    const targetOrbitPos = computeInspectPosition().clone();
    const targetOrbitQuat = computeInspectQuaternion().clone();

    // Animate from current world pose to orbit pose
    transitioning.current = true;
    transitionSpringApi.set({ t: 0 });
    transitionSpringApi.start({
      t: 1,
      onChange: ({ value }) => {
        if (!transitioning.current || !inInspectRef.current) return;
        const t = value.t as number;
        camera.position.lerpVectors(transitionFrom.current.pos, targetOrbitPos, t);
        camera.quaternion.slerpQuaternions(
          transitionFrom.current.quat,
          targetOrbitQuat,
          t,
        );
      },
      onRest: () => {
        transitioning.current = false;
      },
    });
  }, [camera, cameraMode, computeInspectPosition, computeInspectQuaternion, scene, selectedObject, transitionSpringApi]);

  // ---- Per-frame: update inspect orbit (after transition finishes) ----
  useFrame(() => {
    if (inInspectRef.current && selectedObject && !transitioning.current) {
      selectedObject.getWorldPosition(selectedWorldPosition.current);
      orbitOffset.current.setFromSpherical(spherical.current);
      camera.position.copy(selectedWorldPosition.current).add(orbitOffset.current);
      camera.lookAt(selectedWorldPosition.current);
    }

    // Apply smoothed move rig values
    if (!inInspectRef.current && !transitioning.current) {
      const posX = moveSpring.posX.get();
      const posZ = moveSpring.posZ.get();
      const yaw = moveSpring.yaw.get();
      const pitch = moveSpring.pitch.get();
      cameraYawTarget.position.x = posX;
      cameraYawTarget.position.z = posZ;
      cameraYawTarget.rotation.y = yaw;
      cameraPitchTarget.rotation.x = pitch;
      cameraZoomTarget.position.z = zoomDistance.current;
    }
  });

  // ---- Mouse handlers ----
  useEffect(() => {
    const element = gl.domElement;

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleMouseDown = (event: MouseEvent) => {
      dragState.current.isDragging = true;
      dragState.current.isRightButton = event.button === 2;
      dragState.current.previousX = event.clientX;
      dragState.current.previousY = event.clientY;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragState.current.isDragging) {
        return;
      }

      const deltaX = event.clientX - dragState.current.previousX;
      const deltaY = event.clientY - dragState.current.previousY;

      dragState.current.previousX = event.clientX;
      dragState.current.previousY = event.clientY;

      if (cameraMode === "inspect" && selectedObject) {
        spherical.current.theta -= deltaX * ORBIT_SPEED;
        spherical.current.phi = Math.min(
          MAX_POLAR,
          Math.max(MIN_POLAR, spherical.current.phi - deltaY * ORBIT_SPEED),
        );
        return;
      }

      if (dragState.current.isRightButton) {
        targetYaw.current += deltaX * ROTATE_SPEED;
        targetPitch.current = Math.min(
          MAX_MOVE_PITCH,
          Math.max(MIN_MOVE_PITCH, targetPitch.current + deltaY * ROTATE_SPEED),
        );
        moveSpringApi.start({
          yaw: targetYaw.current,
          pitch: targetPitch.current,
        });
      } else {
        const yaw = targetYaw.current;
        targetPosX.current -= (deltaX * Math.cos(yaw) + deltaY * Math.sin(yaw)) * MOVE_SPEED;
        targetPosZ.current -= (-deltaX * Math.sin(yaw) + deltaY * Math.cos(yaw)) * MOVE_SPEED;
        moveSpringApi.start({
          posX: targetPosX.current,
          posZ: targetPosZ.current,
        });
      }
    };

    const handleMouseUp = () => {
      dragState.current.isDragging = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (cameraMode === "inspect" && selectedObject) {
        spherical.current.radius = Math.min(
          MAX_INSPECT_RADIUS,
          Math.max(MIN_INSPECT_RADIUS, spherical.current.radius + event.deltaY * 0.01),
        );
      } else {
        zoomDistance.current = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, zoomDistance.current + event.deltaY * 0.01 * ZOOM_SPEED),
        );
      }
    };

    element.addEventListener("contextmenu", handleContextMenu);
    element.addEventListener("mousedown", handleMouseDown);
    element.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      element.removeEventListener("contextmenu", handleContextMenu);
      element.removeEventListener("mousedown", handleMouseDown);
      element.removeEventListener("wheel", handleWheel);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [cameraMode, gl, moveSpringApi, selectedObject]);

  return (
    <primitive object={cameraYawTarget}>
      <primitive object={cameraYawHelper} />
      <primitive object={cameraPitchTarget}>
        <primitive object={cameraPitchHelper} />
        <primitive object={cameraZoomTarget} />
      </primitive>
    </primitive>
  );
}