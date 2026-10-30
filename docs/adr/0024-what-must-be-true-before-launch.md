# 0024 What Must Be True Before Launch

Osra opens to the public only when all of these hold (LIN-85): Trees are separated in the database, the first Tree has moved in, chat limits and the cap work, sign-up has terms and privacy pages, export and deletion work, and real family data is out of the repo. Paid plans, copying a branch, GEDCOM import and the native apps come after launch.

The first Tree moves in during a short planned outage, rehearsed first on a copy in dev. Every existing account becomes a Member of it, and unused invite links keep working.

`akulafb/osra` stays public until launch, and goes private then. Any public copy later would be a cleaned snapshot in a new repo with fresh history, which is a separate decision.

## Considered Options

- **Rewrite git history and keep the repo public.** Rejected: it is easy to miss something, and GitHub keeps cached copies.
- **Move the first Tree with no outage.** Rejected: more complex, for a family that can wait a few minutes.

## Consequences

- Real family names stay in the public repo and its history until launch.
- Going private ends public access to the code, including any open-source use of it.
