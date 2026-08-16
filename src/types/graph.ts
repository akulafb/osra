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
}

export interface FamilyLink {
  /** DB row id when loaded from Supabase (needed for admin PATCH/DELETE) */
  id?: string;
  source: string;  // UUID
  target: string;  // UUID
  type: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
}

export interface FamilyGraph {
  nodes: FamilyNode[];
  links: FamilyLink[];
}

/** Direction of a relative being added, relative to the anchor Tree Node. */
export type RelativeDirection = 'parent' | 'child' | 'spouse';

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