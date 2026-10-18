# Risk paths

`fb-mode/scripts/classify-risk.sh` reads the two lists below to decide whether a change is a **Risky change** or a **Low-risk change**. It reads this file as it is on the change's base commit, so a diff never judges itself by lists it edits, and a change to this file is always risky. A repo with no such file at the base gets the classifier's built-in defaults instead, `default_risky` and `default_low` in `fb-mode/scripts/classify-risk.sh`, and the classifier leaves this file out of the diff, since the coordinator-agent writes it in that repo's first run.

- Any changed file on **Always risky** makes the change risky.
- When every changed file is on **Always low-risk**, the change is low-risk.
- Otherwise every file on neither list goes to TypeSafe Jev in one call: the agent-instruction files, whose names end `.md`, and the code files, every other name.
- Jev judges the agent-instruction files' diff with the checks in `jev_checks` and the code files' diff with those in `jev_code_checks`, both in `fb-mode/scripts/classify-risk.sh`. Any check at or above the threshold makes the change risky, and so does any Jev failure. `docs/adr/0002-jev-classifier-gates-reviews.md` says why.

## Glob rules

- One glob per line inside the fenced block. Blank lines are skipped.
- A glob matches the whole repo-relative path, starting at the repo root: `CHANGELOG.md` matches only the root changelog.
- `*` matches any characters within one path segment, never `/`.
- `**` matches any characters across directories. `**/` also matches no directory at all, so `**/hooks/` covers `hooks/` at the root too.
- A trailing `/` covers everything under that directory: `docs/adr/` is `docs/adr/**`.
- Every other character matches itself.

## Always risky

```
.github/workflows/
.gitlab-ci.yml
.circleci/
**/migrations/
**/settings*.json
**/hooks.*
**/hooks/
.husky/
**/package-lock.json
**/pnpm-lock.yaml
**/yarn.lock
**/uv.lock
**/poetry.lock
**/Cargo.lock
**/go.sum
**/bun.lock
**/bun.lockb
**/Gemfile.lock
**/composer.lock
```

## Always low-risk

```
docs/
learning/
README.md
GLOSSARY.md
**/*.test.ts
```
