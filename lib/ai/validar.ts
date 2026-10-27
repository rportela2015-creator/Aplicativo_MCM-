/**
 * Valida a NCM extraída pela IA garantindo que existe no catálogo oficial e possui 8 dígitos.
 * Também substitui a descrição gerada pela IA pela descrição oficial da tabela.
 */
export function validarNcmIA(
  extracted: { ncm: string, descricaoNcm?: string, confianca?: string },
  ncmDataset: Map<string, { ncm: string, desc?: string, descricao?: string }>
) {
  const result = { ...extracted, valido: false };

  // Limpa caracteres especiais, pontuação
  const cleanNcm = result.ncm.replace(/\D/g, '');

  if (cleanNcm.length === 8 && ncmDataset.has(cleanNcm)) {
    result.ncm = cleanNcm;
    result.valido = true;

    // Sobrescreve a descrição pela oficial
    const ncmData = ncmDataset.get(cleanNcm);
    result.descricaoNcm = ncmData?.desc || ncmData?.descricao || result.descricaoNcm;
  } else {
    // Rejeita NCMs com comprimento incorreto ou não existentes na tabela
    result.confianca = 'BAIXA';
  }

  return result;
}
