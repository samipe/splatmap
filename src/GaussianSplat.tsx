import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { Euler, Raycaster, Vector2 } from "three";
import { useMapStore } from "./store";

const HOLD_THRESHOLD_MS = 500;

interface GaussianSplatProps {
  url: string;
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export default function GaussianSplat({ url, rotation = [0, 0, 0], scale = [1, 1, 1] }: GaussianSplatProps) {
  const { gl, scene, camera } = useThree();
  const sparkRef = useRef<SparkRenderer | null>(null);
  const splatRef = useRef<SplatMesh | null>(null);
  const setCameraTargetPosition = useMapStore((state) => state.setCameraTargetPosition);

  // Stabilize array props to avoid effect re-runs
  const rotationKey = rotation.join(",");
  const scaleKey = scale.join(",");
  const stableRotation = useMemo(() => rotation, [rotationKey]);
  const stableScale = useMemo(() => scale, [scaleKey]);

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    spark.frustumCulled = false;
    scene.add(spark);
    sparkRef.current = spark;

    const splat = new SplatMesh({ url });
    const euler = new Euler(...stableRotation);
    splat.setRotationFromEuler(euler);
    splat.scale.set(...stableScale);
    scene.add(splat);
    splatRef.current = splat;

    const raycaster = new Raycaster();
    const mouse = new Vector2();
    let mouseDownTime = 0;

    const handleMouseDown = () => {
      mouseDownTime = performance.now();
    };

    const handleClick = (event: MouseEvent) => {
      const elapsed = performance.now() - mouseDownTime;
      if (elapsed > HOLD_THRESHOLD_MS) return;

      const rect = gl.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(splat);
      if (hits.length > 0) {
        const point = hits[0].point;
        setCameraTargetPosition([point.x, point.y, point.z]);
      }
    };

    gl.domElement.addEventListener("mousedown", handleMouseDown);
    gl.domElement.addEventListener("click", handleClick);

    return () => {
      gl.domElement.removeEventListener("mousedown", handleMouseDown);
      gl.domElement.removeEventListener("click", handleClick);
      scene.remove(splat);
      splat.dispose();
      scene.remove(spark);
      spark.dispose();
      sparkRef.current = null;
      splatRef.current = null;
    };
  }, [gl, scene, camera, url, stableRotation, stableScale, setCameraTargetPosition]);

  return null;
}
