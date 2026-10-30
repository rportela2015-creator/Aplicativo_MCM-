import fs from 'node:fs';
import path from 'node:path';
import type { Record8 } from '@/lib/data';

let mapaD8Cache: Map<string, Record8> | null = null;

export function getMapaD8(): Map<string, Record8> {
  if (mapaD8Cache) {
    return mapaD8Cache;
  }

  const filePath = path.join(process.cwd(), 'public', 'data', 'ncm.json');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lista = JSON.parse(fileContent) as Record8[];

  mapaD8Cache = new Map(lista.map(r => [r.d8, r]));
  return mapaD8Cache;
}
