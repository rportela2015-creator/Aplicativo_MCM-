import type { Record8 } from '@/lib/data';

export interface ValidacaoIAOutput {
  ncm: string;
  valido: boolean;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  descricaoNcm?: string;
  aviso?: string;
}

export function validarNcmIA(
  r: { ncm?: string | null; confianca?: 'ALTA' | 'MEDIA' | 'BAIXA' },
  mapaD8: Map<string, Record8> | Record<string, any>
): ValidacaoIAOutput {
  const d8 = (r.ncm ?? '').replace(/\D/g, '');
  const rec = mapaD8 instanceof Map ? mapaD8.get(d8) : (mapaD8 as any)[d8];

  if (!rec || d8.length !== 8) {
    return {
      ncm: d8,
      valido: false,
      confianca: 'BAIXA',
      aviso: 'NCM não localizado na tabela oficial do Siscomex; descartado.',
    };
  }

  return {
    ncm: rec.ncm || d8,
    valido: true,
    confianca: r.confianca || 'MEDIA',
    descricaoNcm: rec.desc || rec.descricao,
  };
}
