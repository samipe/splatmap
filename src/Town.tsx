import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useMapStore } from "./store";

type Building = {
  id: number;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};

export default function Town() {
  const selectedObject = useMapStore((state) => state.selectedObject);
  const setSelectedObject = useMapStore((state) => state.setSelectedObject);
  const setCameraMode = useMapStore((state) => state.setCameraMode);

  const buildings = useMemo<Building[]>(() => {
    const generated: Building[] = [];
    let id = 0;

    for (let x = -4; x <= 4; x += 2) {
      for (let z = -4; z <= 4; z += 2) {
        const distance = Math.abs(x) + Math.abs(z);
        const height = 0.8 + ((distance % 3) + 1) * 0.8;
        generated.push({
          id,
          position: [x, height / 2, z],
          size: [1.2, height, 1.2],
          color: distance % 2 === 0 ? "#d97757" : "#c59d5f",
        });
        id += 1;
      }
    }

    return generated;
  }, []);

  const handleBuildingClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    setSelectedObject(event.eventObject);
    setCameraMode("inspect");
  };

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#507e4d" />
      </mesh>

      {buildings.map((building) => {
        const buildingName = `building-${building.id}`;

        return (
          <mesh
            key={building.id}
            name={buildingName}
            position={building.position}
            castShadow
            receiveShadow
            onClick={handleBuildingClick}
          >
            <boxGeometry args={building.size} />
            <meshStandardMaterial
              color={selectedObject?.name === buildingName ? "#f1e05a" : building.color}
            />
          </mesh>
        );
      })}
    </group>
  );
}
