// Parseo de argumentos con util.parseArgs y mensajes en español.
import { parseArgs } from 'node:util';
import { fail } from './paths.mjs';

export function args(options, usage) {
  const all = { help: { type: 'boolean', short: 'h' }, ...options };
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: all, allowPositionals: true, strict: true });
  } catch (err) {
    fail(`${err.message}\n\nUso:\n${usage}`);
  }
  if (parsed.values.help) {
    console.log(usage);
    process.exit(0);
  }
  return { ...parsed.values, _: parsed.positionals };
}

export const num = (v, def) => (v === undefined || v === '' ? def : Number(v));

export function list(v) {
  if (v === undefined) return undefined;
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
