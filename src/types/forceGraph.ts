import * as THREE from 'three';

/**
 * The slice of the react-force-graph-3d instance our code calls.
 *
 * Note `graphData` is deliberately absent: the library exposes it as a prop
 * only, never as a ref method. Live node positions must be read from the array
 * handed to the `graphData` prop, which d3-force mutates in place.
 */
export interface ForceGraphHandle {
  scene?: () => THREE.Scene;
  camera?: () => THREE.PerspectiveCamera;
  controls?: () => { target?: THREE.Vector3; enabled?: boolean } | undefined;
  renderer?: () => THREE.WebGLRenderer | undefined;
  graph2ScreenCoords?: (x: number, y: number, z: number) => { x: number; y: number };
  cameraPosition?: (
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    transitionMs?: number
  ) => void;
}

export type ForceGraphRef = React.MutableRefObject<ForceGraphHandle | null | undefined>;

/** A graph node as the simulation leaves it: positions appear once it has run. */
export interface LiveNodePosition {
  id: string;
  x?: number;
  y?: number;
  z?: number;
}
