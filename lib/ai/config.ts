/**
 * Configuração central da IA (Gemini). Único lugar onde existem ids de modelo.
 * Variáveis: GEMINI_API_KEY (obrigatória p/ rotas de IA), GEMINI_MODELS (lista separada
 * por vírgula, em ordem de prioridade; o próximo é tentado quando o anterior falha).
 */
export const DEFAULT_MODELS: readonly string[] = ['gemini-3.8-flash', 'gemini-3.6-flash'];

export function getModels(raw: string | undefined = process.env.GEMINI_MODELS): string[] {
  const lista = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const unicos = [...new Set(lista)];
  return unicos.length > 0 ? unicos : [...DEFAULT_MODELS];
}

export function getApiKey(raw: string | undefined = process.env.GEMINI_API_KEY): string | null {
  const k = (raw ?? '').trim();
  return k ? k : null;
}
