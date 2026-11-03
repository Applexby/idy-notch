// Letras sincronizadas desde LRCLIB (base de datos comunitaria y gratuita)
export interface LyricLine { t: number; text: string }

const cache = new Map<string, LyricLine[] | null>();

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of tags) out.push({ t: (Number(m[1]) * 60 + Number(m[2])) * 1000, text });
  }
  return out.sort((a, b) => a.t - b.t);
}

function clean(s: string) {
  return s.replace(/\s*[([].*?(official|video|audio|lyrics?|letra|remaster|hd|4k).*?[)\]]/gi, "").trim();
}

export async function fetchLyrics(title: string, artist: string, album: string, durationMs: number): Promise<LyricLine[] | null> {
  const key = `${title}|${artist}`;
  if (cache.has(key)) return cache.get(key)!;
  const t = clean(title), a = artist.replace(/ - Topic$/, "").trim();
  const tries = [
    `https://lrclib.net/api/get?${new URLSearchParams({ track_name: t, artist_name: a, album_name: album, duration: String(Math.round(durationMs / 1000)) })}`,
    `https://lrclib.net/api/search?${new URLSearchParams({ track_name: t, artist_name: a })}`,
  ];
  let lines: LyricLine[] | null = null;
  for (const url of tries) {
    try {
      const r = await fetch(url, { headers: { "Lrclib-Client": "IDY Notch v1.0" } });
      if (!r.ok) continue;
      const j = await r.json();
      const hit = Array.isArray(j) ? j.find((x) => x.syncedLyrics) : j;
      if (hit?.syncedLyrics) { lines = parseLrc(hit.syncedLyrics); break; }
    } catch { /* sin red */ }
  }
  cache.set(key, lines);
  return lines;
}

export function currentLine(lines: LyricLine[], ms: number) {
  let i = -1;
  for (let k = 0; k < lines.length; k++) { if (lines[k].t <= ms + 250) i = k; else break; }
  return i;
}
