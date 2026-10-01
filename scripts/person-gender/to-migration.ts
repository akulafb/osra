/**
 * Turns the owner's corrected gender lists (LIN-76) into SQL to review before
 * anything runs:
 *
 *   npx vite-node scripts/person-gender/to-migration.ts /tmp/persons-gender-dev.csv [/tmp/persons-gender-prod.csv]
 *
 * Writes two files and changes no database:
 *
 * - supabase/migrations/<timestamp>_lin76_person_genders.sql: stores each
 *   gender, then fills every empty parent_role from the parent's gender, then
 *   checks every parent Kinship Link agrees. Give it the dev and prod lists
 *   together: an id one database lacks updates nothing there, so one migration
 *   serves both, and two lists that disagree about a Person are refused here.
 * - /tmp/persons-gender-dryrun.sql: one read-only query previewing what the
 *   migration would do on the database it is run against, including every
 *   Person it would refuse.
 *
 * Only Persons with a gender in the list are written; blank ones stay not
 * recorded. Re-running replaces the migration it wrote last time.
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genderDryRunSql, genderMigrationSql, mergeGenderLists, parseCsv } from './personGender';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: npx vite-node scripts/person-gender/to-migration.ts <corrected.csv> [more.csv]');
  process.exit(2);
}

const lists = files.map((file) => parseCsv(readFileSync(file, 'utf8'), file));
const entries = mergeGenderLists(lists);

const migrations = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');
const SUFFIX = '_lin76_person_genders.sql';
for (const old of readdirSync(migrations).filter((name) => name.endsWith(SUFFIX))) {
  rmSync(join(migrations, old));
  console.log(`Replaced ${old}`);
}

// After every migration already there (the LIN-76 schema one included), even
// if the clock says otherwise: the genders need the column and its triggers.
const now = Number(new Date().toISOString().replace(/\D/g, '').slice(0, 14));
const latest = Math.max(0, ...readdirSync(migrations).map((name) => Number(name.match(/^(\d{14})_/)?.[1] ?? 0)));
const stamp = String(Math.max(now, latest + 1));
const migration = join(migrations, `${stamp}${SUFFIX}`);
writeFileSync(migration, genderMigrationSql(entries, { sources: files.map((f) => resolve(f)) }));

const dryRun = '/tmp/persons-gender-dryrun.sql';
writeFileSync(dryRun, genderDryRunSql(entries));

const male = entries.filter((e) => e.gender === 'male').length;
console.log(`${entries.length} Persons get a gender (${male} male, ${entries.length - male} female).`);
console.log(`Migration: ${migration}`);
console.log(`Dry run:   ${dryRun}`);
console.log('Review both, run the dry run on dev, then push the migration to dev, then prod.');
