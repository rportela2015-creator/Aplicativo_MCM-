/** Subconjunto do cliente @google/genai usado aqui (permite injetar um mock nos testes). */
export interface ClienteIA {
  models: {
    generateContent(args: { model: string; contents: any; config?: any }): Promise<{ text?: string | (() => string) }>;
  };
}

/**
 * Tenta cada modelo em ordem (contorna 503/pico de tráfego) e devolve o primeiro texto não vazio.
 * Se todos falharem, lança o ÚLTIMO erro (ou um erro genérico se nenhum respondeu texto).
 */
export async function gerarComFallback(
  ai: ClienteIA,
  modelos: string[],
  params: { contents: any; config?: any },
): Promise<string> {
  let ultimoErro: unknown = null;
  for (const model of modelos) {
    try {
      const res = await ai.models.generateContent({ model, contents: params.contents, config: params.config });
      const texto = typeof res.text === 'function' ? res.text() : res.text;
      if (texto) return texto;
    } catch (err: any) {
      ultimoErro = err;
      console.warn(`Tentativa com ${model} falhou, tentando próximo modelo...`, err?.message || err);
    }
  }
  throw ultimoErro || new Error('Nenhum modelo respondeu à solicitação.');
}
