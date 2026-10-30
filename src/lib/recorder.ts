// src/lib/recorder.ts

import { getLinkEndpoints } from './familyGraph';
import { resolveOtherParentFor } from './otherParent';
import type { LifecycleKind, LifecycleSubject } from './lifecycle';
import {
  createTreeRecord,
  parentRoleForGender,
  pendingKinshipLinks,
  relativeToKinshipLink,
  relativeToKinshipLinks,
  storedCluster,
  storedPersonName,
  TreeRecordError,
  type AddLinkParams,
  type AddLinkResult,
  type ConfirmedRows,
  type TreeRecord,
  type TreeRecordConfig,
  type TreeRecordIdentity,
} from './treeRecord';
import type { RecordChange } from './workingRecord';
import type { WriteOutcome, WriteSequencer } from './writeSequencer';
import type { FamilyGraph, FamilyLink, FamilyNode, PersonGender, RelativeDirection } from '../types/graph';

type ParentRole = NonNullable<FamilyLink['parentRole']> | null;

/**
 * The Recorder: every surface that changes the Tree Record states an intent
 * here, and one implementation turns it into what is drawn, what is written and
 * what plays (ADR-0016).
 *
 * `treeRecord` remains the write seam. Every method applies its Pending Change
 * and starts its lifecycle before the returned promise is first awaited, so a
 * caller that does not wait has already put the change on the canvas. A
 * rejection has already reverted the change and unwound the lifecycle by the
 * time it reaches the caller, who has only to report it.
 */
export interface Recorder {
  /** A new Person and the Kinship Links that place them relative to an anchor. */
  addRelative(intent: {
    anchorId: string;
    relation: RelativeDirection;
    firstName: string;
    gender?: PersonGender | null;
    /** The form's pick; a recorded gender on the anchor outranks it. */
    parentRole?: ParentRole;
    /** With `child` only: linked if the latest links still offer them. */
    otherParentId?: string | null;
  }): Promise<void>;
  /** A Kinship Link placing an existing Person relative to an anchor. Refuses `sibling`. */
  connectRelative(intent: {
    anchorId: string;
    existingId: string;
    relation: RelativeDirection;
    parentRole?: ParentRole;
    otherParentId?: string | null;
  }): Promise<void>;
  /** A Kinship Link between two chosen Persons, as Connect Mode names it. */
  connectPersons(intent: {
    sourceId: string;
    targetId: string;
    type: FamilyLink['type'];
    parentRole?: ParentRole;
    otherParentId?: string | null;
  }): Promise<void>;
  /** A new Person with no Kinship Link. Admin only. */
  addStandalonePerson(intent: {
    firstName: string;
    paternalCluster?: string;
    maternalCluster?: string;
  }): Promise<void>;
  /** Cluster edits apply for an admin only; the gender is sent only if it changed. */
  editPerson(intent: {
    person: FamilyNode;
    firstName: string;
    gender: PersonGender | null;
    paternalCluster?: string;
    maternalCluster?: string;
  }): Promise<void>;
  editLink(intent: {
    id: string;
    source: string;
    target: string;
    type: FamilyLink['type'];
    parentRole: ParentRole;
  }): Promise<void>;
  removePerson(id: string): Promise<void>;
  /** A Lifecycle Subject is direction-free, so `aId` and `bId` are either end. */
  removeLink(intent: { id: string; aId: string; bId: string }): Promise<void>;
}

export interface RecorderDeps {
  /** `null` signed out: every method then refuses. */
  identity: TreeRecordIdentity | null;
  /** The Working Record as it is now, read when an intent arrives. */
  graph: () => FamilyGraph | null;
  write: WriteSequencer;
  lifecycles: {
    start: (kind: LifecycleKind, subject: LifecycleSubject) => void;
    abort: (kind: LifecycleKind, subject: LifecycleSubject) => void;
  };
  /** Where the Tree Record is; tests hand in an in-memory `fetch` here. */
  config?: TreeRecordConfig;
}

/** The Spawn subjects of the Kinship Links a write is about to create, one per link. */
function linkSubjects(links: readonly FamilyLink[]): LifecycleSubject[] {
  return links.map((link) => {
    const { sourceId, targetId } = getLinkEndpoints(link);
    return { kind: 'link', aId: sourceId, bId: targetId };
  });
}

/**
 * `addLink`'s three outcomes in the sequencer's vocabulary (D10). The server
 * can accept a write and insert nothing, because the Kinship Link already
 * existed; that drops the Pending Change without ever calling it a failure.
 */
function linkWriteOutcome(result: AddLinkResult): WriteOutcome {
  return result.alreadyConnected ? { kind: 'empty' } : { kind: 'confirmed', rows: result };
}

/** The server wrote what it was asked to, and these rows came back. */
const confirmed = async (rows: Promise<ConfirmedRows>): Promise<WriteOutcome> => ({
  kind: 'confirmed',
  rows: await rows,
});

const toLinkUpserts = (links: readonly FamilyLink[]): RecordChange[] =>
  links.map((link) => ({ kind: 'link-upsert', link }));

export function createRecorder({ identity, graph, write, lifecycles, config }: RecorderDeps): Recorder {
  const seam = identity ? createTreeRecord(identity, config) : null;

  const signedIn = (): TreeRecord => {
    if (!seam) throw new TreeRecordError('not-authorized', 'Sign in to change the Tree Record.');
    return seam;
  };

  const persons = (): readonly FamilyNode[] => graph()?.nodes ?? [];
  const links = (): readonly FamilyLink[] => graph()?.links ?? [];

  /**
   * The subjects are all on the same clock from the moment the intent arrives.
   * Only one parent line is drawn to a child (ADR 0012), so both parent links
   * spawn and the drawn one shows it.
   */
  const played = async (
    kind: LifecycleKind,
    subjects: readonly LifecycleSubject[],
    commit: () => Promise<void>
  ): Promise<void> => {
    subjects.forEach((subject) => lifecycles.start(kind, subject));
    try {
      await commit();
    } catch (error) {
      subjects.forEach((subject) => lifecycles.abort(kind, subject));
      throw error;
    }
  };

  /**
   * A parent link's role follows the parent's gender, and the server refuses
   * one that disagrees. The new or existing relative is the parent for `parent`
   * and the anchor is for `child`, whose form may also pick a role when the
   * anchor's gender is not recorded.
   */
  const relativeRole = (
    anchorId: string,
    relation: RelativeDirection,
    relativeGender: PersonGender | null | undefined,
    picked: ParentRole | undefined
  ): ParentRole =>
    relation === 'parent'
      ? parentRoleForGender(relativeGender)
      : parentRoleForGender(persons().find((p) => p.id === anchorId)?.gender) ?? picked ?? null;

  /** The other parent `child` takes with it: the one the form sent, if the latest links still offer them. */
  const otherParentOf = (
    relation: RelativeDirection,
    parentId: string,
    sent: string | null | undefined,
    childId?: string
  ): string | null => (relation === 'child' ? resolveOtherParentFor(links(), parentId, sent, childId) : null);

  const addLink = (record: TreeRecord, kinship: AddLinkParams): Promise<void> => {
    const pending = pendingKinshipLinks(kinship, persons());
    return played('spawn', linkSubjects(pending), () =>
      write(toLinkUpserts(pending), async () => linkWriteOutcome(await record.addLink(kinship)))
    );
  };

  return {
    addRelative: async ({ anchorId, relation, firstName, gender, parentRole, otherParentId }) => {
      const record = signedIn();
      const name = storedPersonName(firstName);
      // The Person's uuid is minted here so the lifecycle can be keyed on it
      // before the network answers, and the optimistic Person and the row the
      // server writes are the same Person (D11).
      const id = crypto.randomUUID();
      const role = relativeRole(anchorId, relation, gender, parentRole);
      const otherParent = otherParentOf(relation, anchorId, otherParentId);
      const pending = relativeToKinshipLinks(
        anchorId,
        id,
        relation,
        links(),
        role,
        otherParent ? persons().find((p) => p.id === otherParent) ?? { id: otherParent } : null
      );

      // The two cluster fields are derived server-side from the anchor and the
      // other parent, so they are deliberately absent until the server says
      // what they are rather than guessed and corrected.
      await played('spawn', [{ kind: 'node', id }, ...linkSubjects(pending)], () =>
        write(
          [{ kind: 'person-upsert', person: { id, firstName: name, gender: gender ?? null } }, ...toLinkUpserts(pending)],
          () =>
            confirmed(
              record.addPerson({
                id,
                firstName: name,
                gender,
                link: { targetId: anchorId, relation, parentRole: role, otherParentId: otherParent },
              })
            )
        )
      );
    },

    connectRelative: async ({ anchorId, existingId, relation, parentRole, otherParentId }) => {
      const record = signedIn();
      const existingGender = persons().find((p) => p.id === existingId)?.gender;
      // Refuses `sibling` outright: it is several Kinship Links, not one.
      await addLink(record, {
        ...relativeToKinshipLink(
          anchorId,
          existingId,
          relation,
          relativeRole(anchorId, relation, existingGender, parentRole)
        ),
        otherParentId: otherParentOf(relation, anchorId, otherParentId, existingId),
      });
    },

    connectPersons: async ({ sourceId, targetId, type, parentRole, otherParentId }) => {
      const isParent = type === 'parent';
      await addLink(signedIn(), {
        sourceId,
        targetId,
        type,
        parentRole: isParent ? parentRole ?? null : null,
        otherParentId: isParent ? resolveOtherParentFor(links(), sourceId, otherParentId, targetId) : null,
      });
    },

    addStandalonePerson: async ({ firstName, paternalCluster, maternalCluster }) => {
      const record = signedIn();
      const name = storedPersonName(firstName);
      const id = crypto.randomUUID();
      const paternal = storedCluster(paternalCluster);
      const maternal = storedCluster(maternalCluster);

      // A standalone Person has no Kinship Link, so nothing but the Person
      // itself is optimistic here.
      await played('spawn', [{ kind: 'node', id }], () =>
        write(
          [
            {
              kind: 'person-upsert',
              person: {
                id,
                firstName: name,
                familyCluster: paternal ?? undefined,
                maternalFamilyCluster: maternal ?? undefined,
              },
            },
          ],
          () =>
            confirmed(record.addPerson({ id, firstName: name, paternalCluster: paternal, maternalCluster: maternal }))
        )
      );
    },

    editPerson: async ({ person, firstName, gender, paternalCluster, maternalCluster }) => {
      const record = signedIn();
      const name = storedPersonName(firstName);
      const paternal = identity?.isAdmin ? paternalCluster : undefined;
      const maternal = identity?.isAdmin ? maternalCluster : undefined;
      // Sent only when changed: a gender change makes the seam read the
      // Person's parent links back, since the server may have given them a role.
      const changedGender = gender !== (person.gender ?? null) ? gender : undefined;

      // The edited Person goes onto the canvas now and the server row replaces
      // them wholesale on confirmation (D12) — including the two cluster fields
      // an admin left alone, which is why the unedited values are carried here
      // rather than dropped.
      await write(
        [
          {
            kind: 'person-upsert',
            person: {
              ...person,
              firstName: name,
              familyCluster: paternal ?? person.familyCluster,
              maternalFamilyCluster: maternal ?? person.maternalFamilyCluster,
              gender,
            },
          },
        ],
        () =>
          confirmed(
            record.editPerson({
              id: person.id,
              firstName: name,
              gender: changedGender,
              paternalCluster: paternal,
              maternalCluster: maternal,
            })
          )
      );
    },

    editLink: async ({ id, source, target, type, parentRole }) => {
      const record = signedIn();
      const role = type === 'parent' ? parentRole : null;

      // The re-pointed Kinship Link redraws now and the server row replaces it
      // on confirmation (D9, D12).
      await write([{ kind: 'link-upsert', link: { id, source, target, type, parentRole: role } }], () =>
        confirmed(record.editLink({ id, sourceId: source, targetId: target, type, parentRole: role }))
      );
    },

    removePerson: async (id) => {
      const record = signedIn();
      await played('dissolve', [{ kind: 'node', id }], () =>
        write([{ kind: 'person-remove', id }], () => confirmed(record.removePerson({ id })))
      );
    },

    removeLink: async ({ id, aId, bId }) => {
      const record = signedIn();
      await played('dissolve', [{ kind: 'link', aId, bId }], () =>
        write([{ kind: 'link-remove', id }], () => confirmed(record.removeLink({ id })))
      );
    },
  };
}
