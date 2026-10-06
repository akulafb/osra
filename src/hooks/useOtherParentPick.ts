import { useState } from 'react';
import { otherParentChoiceKey, resolveOtherParent, type OtherParentChoice } from '../lib/otherParent';

/**
 * The other parent a form will link, and a setter for the user's pick. Until
 * the user picks, a `choose` is its preselected spouse; `null` is "Not known".
 * A pick belongs to what the choice offers, so it survives unrelated writes,
 * and a different parent, child or set of spouses starts again from the
 * preselection.
 */
export function useOtherParentPick(choice: OtherParentChoice): [string | null, (id: string | null) => void] {
  const key = otherParentChoiceKey(choice);
  const [pick, setPick] = useState<{ key: string; id: string | null } | null>(null);
  // Once the choice offers something else, the pick is gone for good, even if
  // the same offer comes back (the modal reopening on the same parent).
  if (pick && pick.key !== key) setPick(null);
  const picked = pick && pick.key === key ? pick.id : choice.kind === 'choose' ? choice.preselectedId : null;
  return [resolveOtherParent(choice, picked), (id) => setPick({ key, id })];
}
