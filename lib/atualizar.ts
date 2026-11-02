import { z } from 'zod';

export const TIPOS_ATUALIZACAO = ['fontes', 'completo', 'reforma'] as const;
export type TipoAtualizacao = (typeof TIPOS_ATUALIZACAO)[number];

/** `tipo` ausente => 'completo' (compatível com o comportamento anterior). */
export const tipoSchema = z.enum(TIPOS_ATUALIZACAO).default('completo');

export interface Passo { cmd: string; args: string[]; timeoutMs: number }

const py = (script: string, timeoutMs: number): Passo => ({ cmd: 'python3', args: [`scripts/${script}`], timeoutMs });

/**
 *  fontes   : baixar_fontes
 *  completo : baixar_fontes + pipeline
 *  reforma  : baixar_reforma + baixar_is + pipeline (NÃO roda baixar_fontes: é outra fonte)
 */
export function planoAtualizacao(tipo: TipoAtualizacao): Passo[] {
  switch (tipo) {
    case 'fontes': return [py('baixar_fontes.py', 240_000)];
    case 'completo': return [py('baixar_fontes.py', 240_000), py('pipeline.py', 180_000)];
    case 'reforma': return [py('baixar_reforma.py', 300_000), py('baixar_is.py', 1_500_000), py('pipeline.py', 180_000)];
  }
}
