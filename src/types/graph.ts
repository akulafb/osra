// src/types/graph.ts

export interface FamilyNode {
  id: string;  // UUID from Supabase
  firstName: string;
  /** ISO timestamp from Supabase `created_at` */
  createdAt?: string;
  birthDate?: string;
  birthPlace?: string;
  familyCluster?: string;  // paternal (display)
  maternalFamilyCluster?: string;
  isClaimed?: boolean;
  /**
   * Simulation position, written onto the node by react-force-graph in the 3D
   * view. `projectWorkingRecord` reuses the node object outright when a Person's
   * facts are unchanged and carries these six fields onto the new object when
   * they changed (LIN-58 D7), so a Spawn or Dissolve does not restart the whole
   * simulation and throw the tree across the screen (LIN-55).
   */
  x?: number;
  y?: number;
  z?: number;
  /** Pinned position, set when a node is dragged. Carried for the same reason. */
  fx?: number;
  fy?: number;
  fz?: number;
}

export type LinkEndpoint = string | FamilyNode;

export interface FamilyLink {
  /** DB row id when loaded from Supabase (needed for admin PATCH/DELETE) */
  id?: string;
  source: LinkEndpoint;
  target: LinkEndpoint;
  type: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
}

export interface FamilyGraph {
  nodes: FamilyNode[];
  links: FamilyLink[];
}

/** Direction of a relative being added, relative to the anchor Tree Node. */
export type RelativeDirection = 'parent' | 'child' | 'spouse' | 'sibling';

// 2D View Types
export interface Node2D extends FamilyNode {
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
}

export interface Link2D {
  source: Node2D;
  target: Node2D;
  type: 'parent' | 'marriage' | 'divorce';
  path: string;
}

export type LayoutType = 'tree' | 'cluster' | 'radial';

export interface ViewState {
  mode: '3D' | '2D';
  layout: LayoutType;
  zoom: { x: number; y: number; k: number };
  selectedNodeId: string | null;
}

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  levelGap: number;
  siblingGap: number;
  marriageGap: number;
}