import { create } from "zustand";
import { Object3D } from "three";

type MapModel = "town" | "nuotio" | "terde" | "ala" | "core_camp" | "koivukyla";

interface MapState {
  cameraMode: "move" | "inspect";
  setCameraMode: (mode: "move" | "inspect") => void;
  cameraTargetPosition: [number, number, number];
  setCameraTargetPosition: (target: [number, number, number]) => void;
  selectedObject: Object3D | null;
  setSelectedObject: (target: Object3D | null) => void;
  mapModel: MapModel;
  setMapModel: (model: MapModel) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  cameraMode: "move",
  setCameraMode: (mode) => set({ cameraMode: mode }),
  cameraTargetPosition: [0, 0, 0],
  setCameraTargetPosition: (target) => set({ cameraTargetPosition: target }),
  selectedObject: null,
  setSelectedObject: (target) => set({ selectedObject: target }),
  mapModel: "town",
  setMapModel: (model) => set({ mapModel: model }),
}));
