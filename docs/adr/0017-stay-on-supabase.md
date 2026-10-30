# 0017 Stay on Supabase, Not a Graph Database

Every Tree lives in one Supabase project, and isolation between Trees rests on row-level policies, each with a test proving one Tree cannot read another (LIN-85). Family data looks like a graph, but Osra does not query it like one: the browser loads a Tree's Persons and Kinship Links and walks them there, so the database only has to return a small set of rows to the right people.

## Considered Options

- **A graph database such as Neo4j.** Its strength is deep traversal across large graphs, which Osra does not ask the database to do. Moving would mean rebuilding authorization, sign-in, the write gates and the RPCs in a new app server, to gain nothing users would notice.

## Consequences

- One bad policy can expose every family, which is why each policy needs its Tree-isolation test.
- The data stays in plain Postgres, so lock-in to Supabase is limited.
