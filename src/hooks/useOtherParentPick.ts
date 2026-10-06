import { useState } from 'react';
import { resolveOtherParent, type OtherParentChoice } from '../lib/otherParent';

/**
 * The other parent a form will link, and a setter for the user's pick. Until
 * the user picks, a `choose` is its preselected spouse; `null` is "Not known".
 * A pick belongs to the choice it was made from (pass a memoized one), so a
 * different parent or child starts again from the preselection.
 */
export function useOtherParentPick(choice: OtherParentChoice): [string | null, (id: string | null) => void] {
  const [pick, setPick] = useState<{ choice: OtherParentChoice; id: string | null } | null>(null);
  const picked =
    pick && pick.choice === choice ? pick.id : choice.kind === 'choose' ? choice.preselectedId : null;
  return [resolveOtherParent(choice, picked), (id) => setPick({ choice, id })];
}
