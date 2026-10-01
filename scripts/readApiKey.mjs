/**
 * Reads an API key for the evaluation scripts, from the environment, or from
 * `.env.local` at the repo root, or from the file named by $ENV_FILE. Throws
 * when none has it. The key is never printed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads one variable from a dotenv file. Tolerates spaces around `=` and quotes. */
function readEnvFile(path, name) {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] !== name) continue;
    return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

/** @param {string} name @returns {string} */
export function readApiKey(name) {
  const value =
    process.env[name]?.trim() ||
    readEnvFile(resolve(repoRoot, '.env.local'), name) ||
    (process.env.ENV_FILE && readEnvFile(resolve(process.env.ENV_FILE), name));
  if (!value) throw new Error(`No ${name} in the environment, in .env.local, or in $ENV_FILE.`);
  return value;
}
