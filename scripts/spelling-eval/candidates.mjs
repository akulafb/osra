/**
 * The candidate names for the spelling-match evaluation (LIN-67): the distinct
 * given names in the husband, wife and child columns of
 * `Family Tree Bulk Upload.xlsx`.
 *
 * Rules, from the ticket: trim; de-duplicate case-folded (the first spelling
 * seen is kept); leave out compound and placeholder values — a name with a
 * space, an inner capital such as `MohammadZaki`, or a digit such as `NA1`.
 *
 * An .xlsx is a zip of XML. It is read with `unzip` and two regular expressions
 * so the evaluation needs no spreadsheet dependency.
 */

import { execFileSync } from 'node:child_process';

const NAME_HEADER = /^(husband|wife|child \d+)$/i;

function unzipText(xlsxPath, entry) {
  return execFileSync('unzip', ['-p', xlsxPath, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function sharedStrings(xlsxPath) {
  const xml = unzipText(xlsxPath, 'xl/sharedStrings.xml');
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map(([, si]) =>
    decodeXml([...si.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => t).join('')),
  );
}

/** Rows as `{ A: 'text', B: 'text' }`, string cells only. */
function sheetRows(xlsxPath) {
  const strings = sharedStrings(xlsxPath);
  const xml = unzipText(xlsxPath, 'xl/worksheets/sheet1.xml');
  return [...xml.matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map(([, row]) => {
    const cells = {};
    for (const [, column, attrs, value] of row.matchAll(
      /<c r="([A-Z]+)\d+"([^>]*)>.*?<v>(.*?)<\/v>.*?<\/c>/gs,
    )) {
      if (/\bt="s"/.test(attrs)) cells[column] = strings[Number(value)];
    }
    return cells;
  });
}

export function isCompoundOrPlaceholder(name) {
  return /\s/.test(name) || /\d/.test(name) || /\p{Lu}/u.test(name.slice(1));
}

export function candidateNames(xlsxPath) {
  const rows = sheetRows(xlsxPath);
  const headerIndex = rows.findIndex((r) => Object.values(r).some((v) => /^husband$/i.test(v.trim())));
  if (headerIndex < 0) throw new Error(`No "Husband" header row found in ${xlsxPath}`);
  const nameColumns = Object.entries(rows[headerIndex])
    .filter(([, header]) => NAME_HEADER.test(header.trim()))
    .map(([column]) => column);

  const byFolded = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    for (const column of nameColumns) {
      const name = row[column]?.trim();
      if (!name || isCompoundOrPlaceholder(name)) continue;
      const folded = name.toLowerCase();
      if (!byFolded.has(folded)) byFolded.set(folded, name);
    }
  }
  return [...byFolded.values()];
}
