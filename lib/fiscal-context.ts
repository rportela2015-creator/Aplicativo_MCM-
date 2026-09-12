import { readFile } from 'fs/promises';
import path from 'path';

export async function getFiscalContext(): Promise<string> {
  try {
    const regrasRaw = await readFile(path.join(process.cwd(), 'public', 'data', 'regras.json'), 'utf8');
    const reformaRaw = await readFile(path.join(process.cwd(), 'public', 'data', 'reforma.json'), 'utf8');

    const regras = JSON.parse(regrasRaw);
    const reforma = JSON.parse(reformaRaw); // Reforma is a list of cClassTrib details

    let context = 'Contexto Fiscal e Reforma Tributária (IBS/CBS/IS):\n\n';

    // Extract Legal Notes (Notas Legais) from regras.json
    if (regras.notas_legais && Array.isArray(regras.notas_legais)) {
      context += 'Notas Legais Ativas:\n';
      regras.notas_legais.forEach((nl: any) => {
        context += `- ${nl.titulo}: ${nl.texto} (NCMs afetados: ${nl.ncms.join(', ')})\n`;
      });
      context += '\n';
    }

    // Extract Armadilhas from regras.json
    if (regras.armadilhas && Array.isArray(regras.armadilhas)) {
      context += 'Armadilhas de Classificação:\n';
      regras.armadilhas.forEach((arm: any) => {
        context += `- ${arm.titulo}: ${arm.texto}\n`;
      });
      context += '\n';
    }

    // Add general rules regarding transition
    context += 'Diretrizes:\n';
    context += '- Retorne um JSON estrito conforme solicitado.\n';
    context += '- Aja como um auditor fiscal para gerar sugestões de cClassTrib e alertas sobre itens de crédito permitido ou não, e o CFOP sugerido para a entrada.\n';

    return context;
  } catch (error) {
    console.error('Failed to load fiscal context', error);
    return 'Contexto Fiscal: Utilize regras tributárias padrão. Ocorreu um erro ao carregar as regras locais.';
  }
}