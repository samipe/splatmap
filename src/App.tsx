import { Canvas } from "@react-three/fiber";
import Camera from "./Camera";
import Town from "./Town";
import GaussianSplat from "./GaussianSplat";
import { useMapStore } from "./store";

function MapModelSelector() {
  const mapModel = useMapStore((state) => state.mapModel);
  const setMapModel = useMapStore((state) => state.setMapModel);

  return (
    <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1 }}>
      <select
        value={mapModel}
        onChange={(e) => setMapModel(e.target.value as "town" | "nuotio" | "terde" | "ala" | "core_camp")}
        style={{
          padding: "6px 10px",
          borderRadius: 4,
          border: "1px solid #555",
          background: "#222",
          color: "#eee",
          fontSize: 14,
        }}
      >
        <option value="town">Town</option>
        <option value="nuotio">Nuotio</option>
        <option value="ala">Alakerta</option>
        <option value="core_camp">Core Camp</option>
      </select>
    </div>
  );
}

function Scene() {
  const mapModel = useMapStore((state) => state.mapModel);

  return (
    <>
      <Camera />
      {mapModel === "town" && <Town />}
      {mapModel === "nuotio" && <GaussianSplat url="/splatmap/nuotio.sog" rotation={[Math.PI, Math.PI / 2, 0]} />}
      {mapModel === "ala" && <GaussianSplat url="/splatmap/ala.sog" rotation={[Math.PI, -Math.PI / 2, 0]} />}
      {mapModel === "core_camp" && <GaussianSplat url="/splatmap/ala-gsplat-1m-e.sog" rotation={[Math.PI, -Math.PI / 2, 0]} scale={0.3} />}
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[8, 14, 7]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
    </>
  );
}

export default function App() {
  return (
    <>
      <MapModelSelector />
      <Canvas shadows dpr={1} style={{ width: "100vw", height: "100vh", display: "block" }} gl={{}}>
        <Scene />
      </Canvas>
    </>
  );
}