import React from 'react';
import { FamilyNode } from '../../types/graph';
import type { OtherParentChoice } from '../../lib/otherParent';

/**
 * The child's other parent, in the compact style of the Ghost Node and the
 * kinship picker: a note when there is one spouse, a select when there were
 * several, nothing when there is none (LIN-79).
 */
export interface OtherParentPickerProps {
  choice: OtherParentChoice;
  /** Where the candidates' names come from. */
  people: readonly FamilyNode[];
  value: string | null;
  onChange: (personId: string | null) => void;
}

export const OtherParentPicker: React.FC<OtherParentPickerProps> = ({ choice, people, value, onChange }) => {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.firstName ?? 'Unknown';

  if (choice.kind === 'none') return null;

  if (choice.kind === 'one') {
    return (
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
        Other parent: <span style={{ color: '#fff', fontWeight: 600 }}>{nameOf(choice.personId)}</span>
      </div>
    );
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
      Other parent:
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'rgba(30, 41, 59, 0.9)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '4px',
          padding: '2px 4px',
          color: '#fff',
          fontSize: '10px',
        }}
      >
        {choice.candidates.map(({ personId, current }) => (
          <option key={personId} value={personId}>
            {current ? nameOf(personId) : `${nameOf(personId)} (former)`}
          </option>
        ))}
        <option value="">Not known</option>
      </select>
    </label>
  );
};
