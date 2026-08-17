import { useReducer, useCallback, useMemo } from 'react';
import { RelativeDirection } from '../types/graph';
import { Candidacy } from '../components/cards/connectCandidates';
import {
  DirectManipulationState,
  DirectManipulationAction,
  initialDirectManipulationState,
  directManipulationReducer,
  selectNodeAction,
  deselectAction,
  startCreateRelativeAction,
  startConnectAction,
  pickConnectTargetAction,
  startDissolveAction,
  escapeAction,
  backgroundClickAction,
} from '../lib/directManipulation';

export interface DirectManipulationController {
  state: DirectManipulationState;
  selectedNodeId: string | null;
  connectSourceId: string | null;
  connectTargetId: string | null;
  creatingRelative: { anchorNodeId: string; relation: RelativeDirection } | null;
  confirmingDissolveId: string | null;
  rejectedTarget: { nodeId: string; reason: string } | null;
  selectNode: (nodeId: string) => void;
  deselect: () => void;
  startCreateRelative: (anchorNodeId: string, relation: RelativeDirection) => void;
  startConnect: (sourceNodeId: string) => void;
  pickConnectTarget: (targetNodeId: string, candidacy: Candidacy) => void;
  startDissolve: (nodeId: string) => void;
  handleEscape: () => void;
  handleBackgroundClick: () => void;
  dispatch: React.Dispatch<DirectManipulationAction>;
}

export function useDirectManipulation(
  initialState: DirectManipulationState = initialDirectManipulationState
): DirectManipulationController {
  const [state, dispatch] = useReducer(directManipulationReducer, initialState);

  const selectNode = useCallback((nodeId: string) => {
    dispatch(selectNodeAction(nodeId));
  }, []);

  const deselect = useCallback(() => {
    dispatch(deselectAction());
  }, []);

  const startCreateRelative = useCallback(
    (anchorNodeId: string, relation: RelativeDirection) => {
      dispatch(startCreateRelativeAction(anchorNodeId, relation));
    },
    []
  );

  const startConnect = useCallback((sourceNodeId: string) => {
    dispatch(startConnectAction(sourceNodeId));
  }, []);

  const pickConnectTarget = useCallback(
    (targetNodeId: string, candidacy: Candidacy) => {
      dispatch(pickConnectTargetAction(targetNodeId, candidacy));
    },
    []
  );

  const startDissolve = useCallback((nodeId: string) => {
    dispatch(startDissolveAction(nodeId));
  }, []);

  const handleEscape = useCallback(() => {
    dispatch(escapeAction());
  }, []);

  const handleBackgroundClick = useCallback(() => {
    dispatch(backgroundClickAction());
  }, []);

  const connectSourceId = useMemo(() => {
    if (state.phase === 'targeting-connect' || state.phase === 'choosing-kinship') {
      return state.sourceNodeId;
    }
    return null;
  }, [state]);

  const connectTargetId = useMemo(() => {
    if (state.phase === 'choosing-kinship') {
      return state.targetNodeId;
    }
    return null;
  }, [state]);

  const creatingRelative = useMemo(() => {
    if (state.phase === 'creating-relative') {
      return { anchorNodeId: state.anchorNodeId, relation: state.relation };
    }
    return null;
  }, [state]);

  const confirmingDissolveId = useMemo(() => {
    if (state.phase === 'confirming-dissolve') {
      return state.nodeId;
    }
    return null;
  }, [state]);

  const rejectedTarget = useMemo(() => {
    if (state.phase === 'targeting-connect') {
      return state.rejectedTarget;
    }
    return null;
  }, [state]);

  return {
    state,
    selectedNodeId: state.selectedNodeId,
    connectSourceId,
    connectTargetId,
    creatingRelative,
    confirmingDissolveId,
    rejectedTarget,
    selectNode,
    deselect,
    startCreateRelative,
    startConnect,
    pickConnectTarget,
    startDissolve,
    handleEscape,
    handleBackgroundClick,
    dispatch,
  };
}
