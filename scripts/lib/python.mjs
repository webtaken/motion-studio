// Encuentra un Python con numpy y ejecuta los scripts de audio/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, exists } from './paths.mjs';

let cached;

export function findPython() {
  if (cached !== undefined) return cached;
  const candidates = [
    process.env.MOTION_PYTHON,
    path.join(ROOT, '.venv', 'bin', 'python'),
    path.join(ROOT, '.venv', 'Scripts', 'python.exe'),
    'python3',
    'python',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes(path.sep) && !exists(c)) continue;
    const r = spawnSync(c, ['-c', 'import numpy'], { stdio: 'ignore' });
    if (r.status === 0) return (cached = c);
  }
  return (cached = null);
}

export function hasModule(mod) {
  const py = findPython();
  if (!py) return false;
  return spawnSync(py, ['-c', `import ${mod}`], { stdio: 'ignore' }).status === 0;
}

/** Ejecuta audio/<script> con argumentos; muestra su salida. */
export function runPython(script, argv = [], { quiet = false } = {}) {
  const py = findPython();
  if (!py) return Promise.reject(new Error('No hay Python con numpy. Corre: npm run doctor'));
  return new Promise((resolve, reject) => {
    const p = spawn(py, [path.join(ROOT, 'audio', script), ...argv], { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (!quiet) process.stdout.write(d);
    });
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`audio/${script} falló:\n${err.slice(-1500)}`))));
  });
}
