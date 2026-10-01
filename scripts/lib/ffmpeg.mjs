// Envoltorios de ffmpeg/ffprobe: codificar fotogramas, concatenar, mezclar audio, verificar.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export function run(bin, argv, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`No pude ejecutar ${bin}: ${e.message}`)));
    p.on('close', (code) =>
      code === 0 ? resolve({ out, err }) : reject(new Error(`${bin} salió con código ${code}\n${err.slice(-1500)}`)),
    );
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

const COLOR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

/**
 * Abre un ffmpeg que recibe imágenes por stdin y escribe un MP4 H.264 yuv420p.
 * Etiquetado bt709: sin esto los colores de marca se corren en los reproductores.
 */
export function spawnEncoder({ out, fps, img = 'jpeg', quality = 'final', threads = 0 }) {
  const preset = quality === 'draft' ? ['-preset', 'veryfast', '-crf', '23'] : ['-preset', 'medium', '-crf', '18'];
  const argv = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', img === 'png' ? 'png' : 'mjpeg', '-i', '-',
    '-an', '-c:v', 'libx264', ...preset, '-g', String(fps), '-threads', String(threads),
    // format=rgb24 primero: swscale no convierte matriz YUV→YUV (el JPEG viene en BT.601).
    '-vf', 'format=rgb24,scale=w=trunc(iw/2)*2:h=trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p',
    ...COLOR, '-r', String(fps),
    out,
  ];
  const p = spawn(FFMPEG, argv, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  const done = new Promise((resolve, reject) => {
    p.on('error', (e) => reject(new Error(`No pude ejecutar ffmpeg: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg falló (${code}):\n${err.slice(-1500)}`))));
  });
  return {
    write(buf) {
      // Respeta la contrapresión del pipe para no llenar la memoria.
      return p.stdin.write(buf) ? Promise.resolve() : new Promise((r) => p.stdin.once('drain', r));
    },
    end() {
      p.stdin.end();
      return done;
    },
  };
}

/** Une segmentos (mismos ajustes de codificación) y opcionalmente mezcla el audio. */
export async function concatAndMux({ segments, listFile, out, audio, audioFrom = 0, duration }) {
  fs.writeFileSync(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const argv = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile];
  if (audio) argv.push('-ss', String(audioFrom), '-t', String(duration), '-i', audio);
  argv.push('-map', '0:v:0');
  if (audio) argv.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  argv.push('-c:v', 'copy', '-t', String(duration), '-movflags', '+faststart', out);
  await run(FFMPEG, argv);
}

export async function probe(file) {
  const { out } = await run(FFPROBE, [
    '-v', 'error', '-count_packets',
    '-show_entries', 'stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_packets,color_space,sample_rate,channels:format=duration',
    '-of', 'json', file,
  ]);
  return JSON.parse(out);
}

/** Verifica que el MP4 cumpla el contrato. Devuelve lista de problemas (vacía = ok). */
export async function assertVideo(file, { w, h, fps, frames, audio }) {
  const info = await probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const problems = [];
  if (!v) return ['no tiene pista de video'];
  if (v.codec_name !== 'h264') problems.push(`códec ${v.codec_name} (esperado h264)`);
  if (v.pix_fmt !== 'yuv420p') problems.push(`pix_fmt ${v.pix_fmt} (esperado yuv420p)`);
  if (w && (v.width !== w || v.height !== h)) problems.push(`tamaño ${v.width}x${v.height} (esperado ${w}x${h})`);
  const [n, d] = v.r_frame_rate.split('/').map(Number);
  if (Math.abs(n / d - fps) > 0.01) problems.push(`fps ${v.r_frame_rate} (esperado ${fps})`);
  if (frames && Math.abs(Number(v.nb_read_packets) - frames) > 1)
    problems.push(`${v.nb_read_packets} fotogramas (esperado ${frames})`);
  if (audio && !a) problems.push('falta la pista de audio');
  return problems;
}

export async function hasEncoder(name) {
  try {
    const { out } = await run(FFMPEG, ['-hide_banner', '-encoders']);
    return new RegExp(`\\s${name}\\s`).test(out);
  } catch {
    return false;
  }
}
