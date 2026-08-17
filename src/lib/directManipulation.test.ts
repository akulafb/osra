import { describe, it, expect } from 'vitest';
import {
  directManipulationReducer,
  initialDirectManipulationState,
  DirectManipulationState,
  selectNodeAction,
  deselectAction,
  startCreateRelativeAction,
  startConnectAction,
  pickConnectTargetAction,
  startDissolveAction,
  escapeAction,
  backgroundClickAction,
} from './directManipulation';

describe('directManipulation state machine', () => {
  it('starts in idle phase with no selection', () => {
    const state = initialDirectManipulationState;
    expect(state.phase).toBe('idle');
    expect(state.selectedNodeId).toBeNull();
  });

  describe('selection transitions', () => {
    it('selects a node from idle', () => {
      const state = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');
    });

    it('toggles selection when clicking the already-selected node in selected phase', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      const state2 = directManipulationReducer(state1, selectNodeAction('p1'));
      expect(state2.phase).toBe('idle');
      expect(state2.selectedNodeId).toBeNull();
    });

    it('switches selection when clicking a different node in selected phase', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      const state2 = directManipulationReducer(state1, selectNodeAction('p2'));
      expect(state2.phase).toBe('selected');
      expect(state2.selectedNodeId).toBe('p2');
    });

    it('deselects explicitly', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      const state2 = directManipulationReducer(state1, deselectAction());
      expect(state2.phase).toBe('idle');
      expect(state2.selectedNodeId).toBeNull();
    });
  });

  describe('relative creation (ghost node)', () => {
    it('transitions to creating-relative from selected', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      const state2 = directManipulationReducer(
        state1,
        startCreateRelativeAction('p1', 'child')
      );
      expect(state2.phase).toBe('creating-relative');
      if (state2.phase === 'creating-relative') {
        expect(state2.anchorNodeId).toBe('p1');
        expect(state2.relation).toBe('child');
      }
    });

    it('allows starting relative creation from idle if anchor node is provided', () => {
      const state = directManipulationReducer(
        initialDirectManipulationState,
        startCreateRelativeAction('p1', 'spouse')
      );
      expect(state.phase).toBe('creating-relative');
      if (state.phase === 'creating-relative') {
        expect(state.anchorNodeId).toBe('p1');
        expect(state.relation).toBe('spouse');
      }
    });
  });

  describe('connect mode transitions', () => {
    it('transitions from selected to targeting-connect', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      const state2 = directManipulationReducer(state1, startConnectAction('p1'));
      expect(state2.phase).toBe('targeting-connect');
      if (state2.phase === 'targeting-connect') {
        expect(state2.sourceNodeId).toBe('p1');
        expect(state2.rejectedTarget).toBeNull();
      }
    });

    it('transitions from targeting-connect to choosing-kinship on valid target pick', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        startConnectAction('p1')
      );
      const state2 = directManipulationReducer(
        state1,
        pickConnectTargetAction('p2', { ok: true })
      );
      expect(state2.phase).toBe('choosing-kinship');
      if (state2.phase === 'choosing-kinship') {
        expect(state2.sourceNodeId).toBe('p1');
        expect(state2.targetNodeId).toBe('p2');
      }
    });

    it('records rejectedTarget when clicking an invalid candidate in targeting-connect', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        startConnectAction('p1')
      );
      const state2 = directManipulationReducer(
        state1,
        pickConnectTargetAction('p2', { ok: false, reason: 'Already connected' })
      );
      expect(state2.phase).toBe('targeting-connect');
      if (state2.phase === 'targeting-connect') {
        expect(state2.sourceNodeId).toBe('p1');
        expect(state2.rejectedTarget).toEqual({
          nodeId: 'p2',
          reason: 'Already connected',
        });
      }
    });

    it('cancels connect mode if user clicks the source node again', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        startConnectAction('p1')
      );
      const state2 = directManipulationReducer(
        state1,
        pickConnectTargetAction('p1', { ok: false, reason: 'Cannot connect to self' })
      );
      expect(state2.phase).toBe('selected');
      expect(state2.selectedNodeId).toBe('p1');
    });
  });

  describe('dissolve confirmation transitions', () => {
    it('transitions from selected to confirming-dissolve', () => {
      const state1 = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      const state2 = directManipulationReducer(state1, startDissolveAction('p1'));
      expect(state2.phase).toBe('confirming-dissolve');
      if (state2.phase === 'confirming-dissolve') {
        expect(state2.nodeId).toBe('p1');
      }
    });
  });

  describe('Escape unwinding hierarchy (1 level per press)', () => {
    it('unwinds choosing-kinship -> targeting-connect', () => {
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        startConnectAction('p1')
      );
      state = directManipulationReducer(
        state,
        pickConnectTargetAction('p2', { ok: true })
      );
      expect(state.phase).toBe('choosing-kinship');

      state = directManipulationReducer(state, escapeAction());
      expect(state.phase).toBe('targeting-connect');
      if (state.phase === 'targeting-connect') {
        expect(state.sourceNodeId).toBe('p1');
      }
    });

    it('unwinds targeting-connect -> selected', () => {
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        startConnectAction('p1')
      );
      expect(state.phase).toBe('targeting-connect');

      state = directManipulationReducer(state, escapeAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');
    });

    it('unwinds creating-relative -> selected', () => {
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        startCreateRelativeAction('p1', 'child')
      );
      expect(state.phase).toBe('creating-relative');

      state = directManipulationReducer(state, escapeAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');
    });

    it('unwinds confirming-dissolve -> selected', () => {
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        startDissolveAction('p1')
      );
      expect(state.phase).toBe('confirming-dissolve');

      state = directManipulationReducer(state, escapeAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');
    });

    it('unwinds selected -> idle', () => {
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      expect(state.phase).toBe('selected');

      state = directManipulationReducer(state, escapeAction());
      expect(state.phase).toBe('idle');
      expect(state.selectedNodeId).toBeNull();
    });

    it('remains idle when pressing escape while already idle', () => {
      const state = directManipulationReducer(
        initialDirectManipulationState,
        escapeAction()
      );
      expect(state.phase).toBe('idle');
      expect(state.selectedNodeId).toBeNull();
    });
  });

  describe('Background click unwinding hierarchy', () => {
    it('unwinds inner sub-states back to selected', () => {
      // choosing-kinship -> selected
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        startConnectAction('p1')
      );
      state = directManipulationReducer(
        state,
        pickConnectTargetAction('p2', { ok: true })
      );
      state = directManipulationReducer(state, backgroundClickAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');

      // targeting-connect -> selected
      state = directManipulationReducer(state, startConnectAction('p1'));
      state = directManipulationReducer(state, backgroundClickAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');

      // creating-relative -> selected
      state = directManipulationReducer(
        state,
        startCreateRelativeAction('p1', 'spouse')
      );
      state = directManipulationReducer(state, backgroundClickAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');

      // confirming-dissolve -> selected
      state = directManipulationReducer(state, startDissolveAction('p1'));
      state = directManipulationReducer(state, backgroundClickAction());
      expect(state.phase).toBe('selected');
      expect(state.selectedNodeId).toBe('p1');
    });

    it('unwinds selected -> idle on background click', () => {
      let state: DirectManipulationState = directManipulationReducer(
        initialDirectManipulationState,
        selectNodeAction('p1')
      );
      expect(state.phase).toBe('selected');

      state = directManipulationReducer(state, backgroundClickAction());
      expect(state.phase).toBe('idle');
      expect(state.selectedNodeId).toBeNull();
    });
  });
});
