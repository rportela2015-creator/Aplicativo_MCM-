import fs from 'node:fs';
import path from 'node:path';

// Memory cache for NCM dataset to avoid reading file on every request
let _ncmCache: Map<string, { ncm: string; desc?: string; descricao?: string }> | null = null;

export function getNcmDataset(): Map<string, { ncm: string; desc?: string; descricao?: string }> {
  if (_ncmCache) return _ncmCache;

  const p = path.resolve(process.cwd(), 'public', 'data', 'ncm.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    _ncmCache = new Map(Object.entries(data));
    return _ncmCache;
  } catch (err) {
    console.error('[NCM-SERVER] Error loading ncm.json:', err);
    return new Map();
  }
}
