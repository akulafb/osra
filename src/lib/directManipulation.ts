import { RelativeDirection } from '../types/graph';
import { Candidacy } from '../components/cards/connectCandidates';

export type DirectManipulationPhase =
  | 'idle'
  | 'selected'
  | 'creating-relative'
  | 'targeting-connect'
  | 'choosing-kinship'
  | 'confirming-dissolve';

export interface IdleState {
  phase: 'idle';
  selectedNodeId: null;
}

export interface SelectedState {
  phase: 'selected';
  selectedNodeId: string;
}

export interface CreatingRelativeState {
  phase: 'creating-relative';
  selectedNodeId: string;
  anchorNodeId: string;
  relation: RelativeDirection;
}

export interface TargetingConnectState {
  phase: 'targeting-connect';
  selectedNodeId: string;
  sourceNodeId: string;
  rejectedTarget: { nodeId: string; reason: string } | null;
}

export interface ChoosingKinshipState {
  phase: 'choosing-kinship';
  selectedNodeId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface ConfirmingDissolveState {
  phase: 'confirming-dissolve';
  selectedNodeId: string;
  nodeId: string;
}

export type DirectManipulationState =
  | IdleState
  | SelectedState
  | CreatingRelativeState
  | TargetingConnectState
  | ChoosingKinshipState
  | ConfirmingDissolveState;

export const initialDirectManipulationState: DirectManipulationState = {
  phase: 'idle',
  selectedNodeId: null,
};

export type DirectManipulationAction =
  | { type: 'SELECT_NODE'; nodeId: string }
  | { type: 'DESELECT' }
  | { type: 'START_CREATE_RELATIVE'; anchorNodeId: string; relation: RelativeDirection }
  | { type: 'START_CONNECT'; sourceNodeId: string }
  | { type: 'PICK_CONNECT_TARGET'; targetNodeId: string; candidacy: Candidacy }
  | { type: 'START_DISSOLVE'; nodeId: string }
  | { type: 'ESCAPE' }
  | { type: 'BACKGROUND_CLICK' };

export function selectNodeAction(nodeId: string): DirectManipulationAction {
  return { type: 'SELECT_NODE', nodeId };
}

export function deselectAction(): DirectManipulationAction {
  return { type: 'DESELECT' };
}

export function startCreateRelativeAction(
  anchorNodeId: string,
  relation: RelativeDirection
): DirectManipulationAction {
  return { type: 'START_CREATE_RELATIVE', anchorNodeId, relation };
}

export function startConnectAction(sourceNodeId: string): DirectManipulationAction {
  return { type: 'START_CONNECT', sourceNodeId };
}

export function pickConnectTargetAction(
  targetNodeId: string,
  candidacy: Candidacy
): DirectManipulationAction {
  return { type: 'PICK_CONNECT_TARGET', targetNodeId, candidacy };
}

export function startDissolveAction(nodeId: string): DirectManipulationAction {
  return { type: 'START_DISSOLVE', nodeId };
}

export function escapeAction(): DirectManipulationAction {
  return { type: 'ESCAPE' };
}

export function backgroundClickAction(): DirectManipulationAction {
  return { type: 'BACKGROUND_CLICK' };
}

export function directManipulationReducer(
  state: DirectManipulationState,
  action: DirectManipulationAction
): DirectManipulationState {
  switch (action.type) {
    case 'SELECT_NODE': {
      if (state.phase === 'targeting-connect') {
        // If in connect mode, picking a node is handled via PICK_CONNECT_TARGET.
        // If SELECT_NODE is dispatched, treat clicking source as cancel, clicking target as attempt.
        if (action.nodeId === state.sourceNodeId) {
          return { phase: 'selected', selectedNodeId: action.nodeId };
        }
        return state;
      }

      if (state.phase === 'selected' && state.selectedNodeId === action.nodeId) {
        return { phase: 'idle', selectedNodeId: null };
      }

      return {
        phase: 'selected',
        selectedNodeId: action.nodeId,
      };
    }

    case 'DESELECT': {
      return { phase: 'idle', selectedNodeId: null };
    }

    case 'START_CREATE_RELATIVE': {
      return {
        phase: 'creating-relative',
        selectedNodeId: action.anchorNodeId,
        anchorNodeId: action.anchorNodeId,
        relation: action.relation,
      };
    }

    case 'START_CONNECT': {
      return {
        phase: 'targeting-connect',
        selectedNodeId: action.sourceNodeId,
        sourceNodeId: action.sourceNodeId,
        rejectedTarget: null,
      };
    }

    case 'PICK_CONNECT_TARGET': {
      if (state.phase !== 'targeting-connect') return state;

      if (action.targetNodeId === state.sourceNodeId) {
        return {
          phase: 'selected',
          selectedNodeId: state.sourceNodeId,
        };
      }

      if (action.candidacy.ok) {
        return {
          phase: 'choosing-kinship',
          selectedNodeId: state.sourceNodeId,
          sourceNodeId: state.sourceNodeId,
          targetNodeId: action.targetNodeId,
        };
      }

      return {
        ...state,
        rejectedTarget: {
          nodeId: action.targetNodeId,
          reason: action.candidacy.reason,
        },
      };
    }

    case 'START_DISSOLVE': {
      return {
        phase: 'confirming-dissolve',
        selectedNodeId: action.nodeId,
        nodeId: action.nodeId,
      };
    }

    case 'ESCAPE': {
      switch (state.phase) {
        case 'choosing-kinship':
          return {
            phase: 'targeting-connect',
            selectedNodeId: state.sourceNodeId,
            sourceNodeId: state.sourceNodeId,
            rejectedTarget: null,
          };
        case 'targeting-connect':
          return {
            phase: 'selected',
            selectedNodeId: state.sourceNodeId,
          };
        case 'creating-relative':
          return {
            phase: 'selected',
            selectedNodeId: state.anchorNodeId,
          };
        case 'confirming-dissolve':
          return {
            phase: 'selected',
            selectedNodeId: state.nodeId,
          };
        case 'selected':
          return {
            phase: 'idle',
            selectedNodeId: null,
          };
        case 'idle':
          return state;
      }
    }

    case 'BACKGROUND_CLICK': {
      switch (state.phase) {
        case 'choosing-kinship':
        case 'targeting-connect':
          return {
            phase: 'selected',
            selectedNodeId: state.sourceNodeId,
          };
        case 'creating-relative':
          return {
            phase: 'selected',
            selectedNodeId: state.anchorNodeId,
          };
        case 'confirming-dissolve':
          return {
            phase: 'selected',
            selectedNodeId: state.nodeId,
          };
        case 'selected':
          return {
            phase: 'idle',
            selectedNodeId: null,
          };
        case 'idle':
          return state;
      }
    }

    default:
      return state;
  }
}
