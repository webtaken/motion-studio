// Audio del video: música compuesta en código, beats de una pista propia y mezcla
// final (música + sfx registrados con ctx.sfx). Los scripts viven en audio/*.py.
import path from 'node:path';
import { args, num } from './lib/args.mjs';
import { loadVideo, outDir, videoDir, ensureDir, rel, readJSON, writeJSON, fail, exists, isMain } from './lib/paths.mjs';
import { findPython, runPython } from './lib/python.mjs';

const USAGE = `npm run music -- <slug> [--style minimal|house|lofi|cinematic] [--key Am] [--bpm 120] [--seed 7]
    Compone la música en código → videos/<slug>/audio/music.wav (guarda los cambios en video.json).
npm run beats -- <slug> [archivo]
    Detecta los beats de tu pista → videos/<slug>/beats.json (ctx.beat(n) los usa solo).
npm run mix -- <slug>
    Mezcla música + sfx → out/<slug>/mix.wav (render lo hace automático).`;

const musicParams = (config) => ({
  bpm: config.bpm ?? 120,
  duration: config.duration ?? 10,
  seed: config.music?.seed ?? config.seed ?? 1,
  style: config.music?.style ?? 'minimal',
  key: config.music?.key ?? 'Am',
  sections: config.sections ?? null,
});

/** Compone videos/<slug>/audio/music.wav si falta o si cambiaron sus parámetros. */
export async function ensureMusic(slug, config, { force = false } = {}) {
  const dir = ensureDir(path.join(videoDir(slug), 'audio'));
  const wav = path.join(dir, 'music.wav');
  const stamp = path.join(dir, 'music.json');
  const params = musicParams(config);
  if (!force && exists(wav) && JSON.stringify(readJSON(stamp, null)) === JSON.stringify(params)) return wav;
  await runPython('compose.py', [
    '--bpm', String(params.bpm),
    '--duration', String(params.duration),
    '--seed', String(params.seed),
    '--style', params.style,
    '--key', params.key,
    '--sections', JSON.stringify(params.sections ?? []),
    '--out', wav,
    '--beats', path.join(dir, 'beats.json'),
  ]);
  writeJSON(stamp, params);
  return wav;
}

/** Devuelve la pista de música según video.json (o null si no lleva). */
export async function resolveMusic(slug, config) {
  const m = config.music ?? { mode: 'compose' };
  if (m.mode === 'none') return null;
  if (m.mode === 'track') {
    if (!m.file) throw new Error('music.mode es "track" pero falta music.file en video.json');
    const f = path.resolve(videoDir(slug), m.file);
    if (!exists(f)) throw new Error(`No existe la pista ${rel(f)}`);
    return f;
  }
  return ensureMusic(slug, config);
}

/** Mezcla final → out/<slug>/mix.wav. Sin Python avisa y devuelve null (render mudo). */
export async function buildMix(slug, meta) {
  if (!findPython()) {
    console.warn('! Sin Python con numpy: render sin audio. Corre: npm run doctor');
    return null;
  }
  const { config } = loadVideo(slug);
  const out = ensureDir(outDir(slug));
  const metaFile = path.join(out, 'meta.json');
  writeJSON(metaFile, meta);
  const music = await resolveMusic(slug, config);
  if (!music && !meta.sfx?.length) return null;
  const mix = path.join(out, 'mix.wav');
  await runPython('mix.py', ['--meta', metaFile, '--music', music ?? 'none', '--out', mix, '--duration', String(meta.duration)], { quiet: true });
  console.log(`♪ ${rel(mix)}  (${music ? `música: ${rel(music)}` : 'sin música'}, ${meta.sfx?.length ?? 0} sfx)`);
  return mix;
}

if (isMain(import.meta.url)) {
  const a = args(
    {
      style: { type: 'string' },
      key: { type: 'string' },
      bpm: { type: 'string' },
      seed: { type: 'string' },
    },
    USAGE,
  );
  const [cmd, slug, file] = a._;
  if (!['music', 'beats', 'mix'].includes(cmd)) fail(USAGE);
  const { dir, config } = loadVideo(slug);
  try {
    if (cmd === 'music') {
      const cfgFile = path.join(dir, 'video.json');
      const next = { ...config, music: { ...(config.music ?? {}), mode: 'compose' } };
      if (a.style) next.music.style = a.style;
      if (a.key) next.music.key = a.key;
      if (a.seed) next.music.seed = num(a.seed);
      if (a.bpm) next.bpm = num(a.bpm);
      if (JSON.stringify(next) !== JSON.stringify(config)) writeJSON(cfgFile, next);
      delete next.beats; // la música compuesta sigue la grilla exacta del BPM
      const wav = await ensureMusic(slug, next, { force: true });
      console.log(`✓ ${rel(wav)}`);
    } else if (cmd === 'beats') {
      const track = file ? path.resolve(file) : config.music?.file ? path.resolve(dir, config.music.file) : null;
      if (!track || !exists(track)) fail('Indica la pista: npm run beats -- <slug> ruta/a/pista.mp3');
      const out = path.join(dir, 'beats.json');
      await runPython('beats.py', [track, '--out', out]);
      const relTrack = path.relative(dir, track).split(path.sep).join('/');
      writeJSON(path.join(dir, 'video.json'), { ...config, beats: './beats.json', music: { ...(config.music ?? {}), mode: 'track', file: relTrack } });
      const b = readJSON(out);
      console.log(`✓ ${rel(out)}: ${b.bpm} BPM, ${b.beats.length} beats (${b.source}). video.json usa ahora la pista.`);
    } else {
      const { startServer } = await import('./lib/server.mjs');
      const { launch, openComposition } = await import('./lib/browser.mjs');
      const server = await startServer();
      const browser = await launch();
      try {
        const comp = await openComposition(browser, server.url, slug, {});
        await buildMix(slug, comp.meta);
      } finally {
        await browser.close();
        await server.close();
      }
    }
  } catch (err) {
    fail(err.message);
  }
}
