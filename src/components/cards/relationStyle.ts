import { RelativeDirection } from '../../types/graph';

export { CONNECT_ACCENT } from '../../theme/relationColors';

export function relationLabel(relation: RelativeDirection, anchorFirstName: string): string {
  switch (relation) {
    case 'parent':
      return `+ Parent of ${anchorFirstName}`;
    case 'spouse':
      return `+ Spouse of ${anchorFirstName}`;
    case 'sibling':
      return `+ Sibling of ${anchorFirstName}`;
    case 'child':
    default:
      return `+ Child of ${anchorFirstName}`;
  }
}
