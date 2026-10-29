import fs from 'node:fs/promises';
import path from 'path';

let cachedContext: string | null = null;
let lastCacheKey: string = '';
let lastCacheTime: number = 0;
const TTL = 10 * 60 * 1000; // 10 minutes

export async function getFiscalContext(): Promise<string> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'regras.json');

  try {
    const stats = await fs.stat(filePath);
    const cacheKey = `${stats.mtimeMs}:${stats.size}`;
    const now = Date.now();

    if (cachedContext !== null && cacheKey === lastCacheKey && (now - lastCacheTime) < TTL) {
      return cachedContext;
    }

    const regrasRaw = await fs.readFile(filePath, 'utf8');
    const regras = JSON.parse(regrasRaw);

    let context = 'Contexto Fiscal e Reforma Tributária (IBS/CBS/IS):\n\n';

    if (regras.notas_legais && Array.isArray(regras.notas_legais)) {
      context += 'Notas Legais Ativas:\n';
      regras.notas_legais.forEach((nl: any) => {
        const titulo = nl.titulo ?? '';
        const texto = nl.texto ?? '';
        const ncms = (nl.ncms ?? []).join(', ');
        context += `- ${titulo}: ${texto} (NCMs afetados: ${ncms})\n`;
      });
      context += '\n';
    }

    if (regras.armadilhas && Array.isArray(regras.armadilhas)) {
      context += 'Armadilhas de Classificação:\n';
      regras.armadilhas.forEach((arm: any) => {
        const titulo = arm.titulo ?? '';
        const texto = arm.texto ?? '';
        context += `- ${titulo}: ${texto}\n`;
      });
      context += '\n';
    }

    context += 'Diretrizes:\n';
    context += '- Retorne um JSON estrito conforme solicitado.\n';
    context += '- Aja como um auditor fiscal para gerar sugestões de cClassTrib e alertas sobre itens de crédito permitido ou não, e o CFOP sugerido para a entrada.\n';

    cachedContext = context;
    lastCacheKey = cacheKey;
    lastCacheTime = now;
    return context;
  } catch (error) {
    cachedContext = null;
    lastCacheKey = '';
    lastCacheTime = 0;
    return 'Contexto Fiscal: Utilize regras tributárias padrão. Ocorreu um erro ao carregar as regras locais.';
  }
}
