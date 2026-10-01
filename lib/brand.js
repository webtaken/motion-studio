// Carga assets/<marca>/brand.json (lo crea `npm run capture`) y lo vuelve CSS:
// --brand-bg, --brand-text, --brand-accent, --brand-font-title, --brand-font-ui.
export async function loadBrand(name) {
  if (!name) return null;
  const base = `/assets/${name}/`;
  const res = await fetch(`${base}brand.json`);
  if (!res.ok) {
    console.warn(`No existe assets/${name}/brand.json. Corre: npm run capture -- <url> ${name}`);
    return null;
  }
  const brand = await res.json();
  const root = document.documentElement.style;
  const c = brand.colors ?? {};
  if (c.bg) root.setProperty('--brand-bg', c.bg);
  if (c.text) root.setProperty('--brand-text', c.text);
  if (c.accent) root.setProperty('--brand-accent', c.accent);
  for (const role of ['title', 'ui']) {
    const f = brand.fonts?.[role];
    if (!f?.family) continue;
    for (const file of f.files ?? []) {
      const face = new FontFace(f.family, `url(${file.src.startsWith('/') ? file.src : base + file.src})`, {
        weight: String(file.weight ?? '400'),
        style: file.style ?? 'normal',
      });
      document.fonts.add(face);
      await face.load().catch(() => console.warn(`No cargó la fuente ${f.family} (${file.src})`));
    }
    root.setProperty(`--brand-font-${role}`, `"${f.family}", var(--font-${role})`);
  }
  brand.asset = (p) => base + p.replace(/^\//, '');
  return brand;
}
