// Arma una hoja de contactos como HTML (grilla de miniaturas con etiquetas).
// La screenshoteamos con el mismo Chromium: las etiquetas se ven igual en cualquier máquina.
export const SHEET = { MAX: 1568, PAD: 16, GAP: 8, LABEL: 34, HEADER: 46 };

export function layout({ w, h, cols, cellW }) {
  const { MAX, PAD, GAP, LABEL, HEADER } = SHEET;
  let c = cols;
  let cw = cellW;
  if (cw) c = Math.max(1, Math.floor((MAX - 2 * PAD + GAP) / (cw + GAP)));
  else cw = Math.floor((MAX - 2 * PAD - (c - 1) * GAP) / c);
  const ch = Math.round((cw * h) / w);
  const rows = Math.max(1, Math.floor((MAX - HEADER - 2 * PAD + GAP) / (ch + LABEL + GAP)));
  return { cols: c, cellW: cw, cellH: ch, rows, perPage: c * rows };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function sheetHtml({ title, subtitle, cells, cols, cellW, cellH }) {
  const { PAD, GAP, LABEL, HEADER } = SHEET;
  const rowsUsed = Math.ceil(cells.length / cols);
  const width = 2 * PAD + cols * cellW + (cols - 1) * GAP;
  const height = HEADER + 2 * PAD + rowsUsed * (cellH + LABEL + GAP) - GAP;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:${width}px;height:${height}px;background:#0b0c0e;color:#e8e6e1;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;padding:${PAD}px}
  header{height:${HEADER}px;display:flex;align-items:baseline;gap:14px}
  header b{font-size:17px;color:#fff} header span{color:#8b919a}
  .grid{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${GAP}px}
  .c{display:flex;flex-direction:column}
  .c img{width:${cellW}px;height:${cellH}px;display:block;outline:1px solid #2a2d33}
  .c div{height:${LABEL}px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;font-size:12px;color:#c9c6bf}
  .c div i{font-style:normal;color:#ff8a5c}
  .c.mark div{color:#fff} .c.mark img{outline:2px solid #ff4d1f}
  </style></head><body><header><b>${esc(title)}</b><span>${esc(subtitle)}</span></header><div class="grid">${cells
    .map(
      (c) =>
        `<div class="c${c.mark ? ' mark' : ''}"><img src="${c.src}"><div>${esc(c.label)}${c.sub ? ` <i>${esc(c.sub)}</i>` : ''}</div></div>`,
    )
    .join('')}</div></body></html>`;
  return { html, width, height };
}

/** Renderiza la hoja a PNG con un contexto nuevo del navegador. */
export async function renderSheet(browser, sheet, file) {
  const fs = await import('node:fs');
  const ctx = await browser.newContext({ viewport: { width: sheet.width, height: sheet.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(sheet.html, { waitUntil: 'load' });
  fs.writeFileSync(file, await page.screenshot({ type: 'png' }));
  await ctx.close();
}
