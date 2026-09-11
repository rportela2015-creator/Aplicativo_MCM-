/**
 * PARAMETRIZAÇÃO DE ERP — converte o cadastro da empresa + o cenário da operação
 * nos códigos e no esqueleto de XML que o emissor precisa.
 *
 * Tudo que aqui aparece como *código* vem das tabelas carregadas pelo app (Tabela NCM
 * do Siscomex, CEST/CFOP, cClassTrib/CST-IBS/CBS e IS da RFB). Os campos de valor
 * (vBC, vICMS, pICMS…) saem vazios na maqueta: alíquota e base dependem do estado, do
 * produto e do regime — o app não inventa número.
 */
import { CstItem, Dataset, Reforma, Record8 } from './data';
import { Finalidade, Operacao, Regime, catalogChecklist, parameterize } from './parametrizacao';
import { sugerirReforma } from './reforma';

export type Modelo = '55' | '65' | '57' | 'nfs-e';
export type XmlCtx = {
  cnpj: string; ie: string; municipioIbge: string; ufEmi: string;
  regime: Regime; modelo: Modelo;
  operacao: Operacao; finalidade: Finalidade;
  ufDest: string; cnpjDest: string; ieDest: string;
  tpAmb: '1' | '2'; finNFe: '1' | '2' | '3' | '4';
  indFinal: 0 | 1; indPres: '0' | '1' | '2' | '3' | '9'; modFrete: '0' | '1' | '2' | '3' | '4' | '9';
  st: boolean; beneficiado: boolean; industrial: boolean;
  nbs: string;            // só para NFS-e
  cClassTribForcado: string;   // contribuição manual (validada contra a tabela oficial)
  cClassTribRegForcado: string;
  regApIBSCBSSN: '' | '0' | '1' | '2';
  cClassReferenciada: string;
  tpNFCredito: string; tpNFDebito: string;
  anoReforma: number;
};

export type XmlCampo = { tag: string; grupo: string; valor: string; obrig: 'sempre' | 'condicional' | 'opcional';
  motivo: string; fonte: 'tabela oficial' | 'regra do app' | 'a preencher' };
export type XmlBloco = { grupo: string; tag: string; quando: string; campos: XmlCampo[] };
export type XmlVerif = { nivel: 'erro' | 'atencao' | 'ok'; campo: string; texto: string };
export type XmlParam = { campos: XmlBloco[]; maqueta: string; verificacoes: XmlVerif[]; resumo: string };

const digito = (base: string, pesos: number[]) => {
  let s = 0;
  for (let i = 0; i < base.length; i++) s += +base[i] * (pesos ? pesos[i] : 2 + (i % 8));
  const r = s % 11;
  return r < 2 ? 0 : 11 - r;
};

/** CNPJ: mod-11 com pesos 2..9 (ciclo, da direita para a esquerda) — o mesmo do validador da RFB. */
export function cnpjValido(cad: string): boolean {
  const d = cad.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const do12 = d.slice(0, 12).split('').reverse().map(Number);
  const do13 = d.slice(0, 13).split('').reverse().map(Number);
  const p = (n: number) => 2 + (n % 8);
  const d1 = do12.reduce((a, v, i) => a + v * p(i), 0) % 11;
  const d2 = do13.reduce((a, v, i) => a + v * p(i), 0) % 11;
  return +d[12] === (d1 < 2 ? 0 : 11 - d1) && +d[13] === (d2 < 2 ? 0 : 11 - d2);
}

/** CPF: mesmo princípio (pesos 10..2 e 11..2) — usado para destinatário pessoa física. */
export function cpfValido(cad: string): boolean {
  const d = cad.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  return +d[9] === digito(d.slice(0, 9), Array.from({ length: 9 }, (_, i) => 10 - i))
    && +d[10] === digito(d.slice(0, 10), Array.from({ length: 10 }, (_, i) => 11 - i));
}

/**
 * Inscrição Estadual — só onde a regra é pacífica e pública (SP/PR/RS/MG).
 * Estados sem regra implementada devolvem null e a UI pede conferência, não "ok".
 */
export function ieValida(uf: string, ie: string): boolean | null {
  const d = ie.replace(/\D/g, '');
  if (/^ISENTO$/i.test(ie.trim())) return true;
  // soma ponderada: pesos já na ordem dos dígitos (esquerda → direita)
  const soma = (digits: string, pesos: number[]) =>
    digits.split('').reduce((a, x, i) => a + +x * pesos[i], 0);
  const mod11 = (s: number) => { const r = s % 11; return r < 2 ? 0 : 11 - r; };
  if (uf === 'SP') {
    // SINTEC/SP — 12 dígitos, 9º e 12º verificadores; o dv é "o algarismo mais à direita
    // do resto da divisão por 11" (resto 10 → dv 0, resto 11 → dv 1). Ex. 110.042.490.114.
    if (d.length !== 12) return false;
    const dv1 = +String(soma(d.slice(0, 8), [1, 3, 4, 5, 6, 7, 8, 10]) % 11).slice(-1);
    if (+d[8] !== dv1) return false;
    const dv2 = +String(soma(d.slice(0, 11), [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2]) % 11).slice(-1);
    return +d[11] === dv2;
  }
  if (uf === 'PR') {
    // SINTEC/PR — 10 dígitos. 1º dv: o algarismo MAIS À DIREITA dos 8 primeiros recebe
    // peso 2, o anterior 3, …, o primeiro peso 9 → pesos [2..9] lidos da direita.
    // 2º dv: pesos 2..9 e 2 sobre os 9 primeiros (esquerda → direita). Resto 0/1 → dv 0.
    // Ex. 12345678 → 1×9+2×8+3×7+4×6+5×5+6×4+7×3+8×2 = 156 → resto 2 → dv 9; 2º dv → 6.
    // (Obs.: o texto do SINTEC para o exemplo "123.45678-50" soma 138, mas a multiplicação
    //  listada dá 156 — preferimos a aritmética ao texto, e o validador é auto-consistente.)
    if (d.length !== 10) return false;
    const s1 = d.slice(0, 8).split('').reverse().reduce((a, x, i) => a + +x * (2 + i), 0);
    if (+d[8] !== mod11(s1)) return false;
    return +d[9] === mod11(soma(d.slice(0, 9), [2, 3, 4, 5, 6, 7, 8, 9, 2]));
  }
  return null;      // estado sem regra implementada: não afirmar
}

/** código IBGE da UF (tabela oficial do IBGE, a mesma usada em ide/cUF e emit/UF) */
// dados abertos da RFB (ufs.json): 24 é RN, 26 é PE — e EX=99 para o exterior
export const UF_CODIGO: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28',
  BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53', EX: '99',
};
export const cUF = (uf: string) => UF_CODIGO[(uf || '').toUpperCase()] || '';
const UF_POR_CODIGO: Record<string, string> = Object.fromEntries(
  Object.entries(UF_CODIGO).map(([k, v]) => [v, k]));

/** Modelo/ambiente/finalidade: rótulos oficiais curtinhos, para a UI não ficar muda. */
export const MODELOS: { v: Modelo; n: string; nota: string }[] = [
  { v: '55', n: 'NF-e (mod 55)', nota: 'Nota Fiscal Eletrônica — uso geral, crédito de ICMS/IPI.' },
  { v: '65', n: 'NFC-e (mod 65)', nota: 'Nota Fiscal de Consumidor Eletrônica — venda presencial a consumidor final.' },
  { v: '57', n: 'CT-e (mod 57)', nota: 'Conhecimento de Transporte Eletrônico — transporte de cargas.' },
  { v: 'nfs-e', n: 'NFS-e (serviço)', nota: 'Nota Fiscal de Serviços Eletrônica — item de serviço (NBS + cClassTrib).' },
];

export const FINNFE: { v: XmlCtx['finNFe']; n: string }[] = [
  { v: '1', n: '1 — normal' }, { v: '2', n: '2 — complementares de valores' },
  { v: '3', n: '3 — ajustes de notas' }, { v: '4', n: '4 — devolução de mercadoria' },
];

export function montarXml(ctx: XmlCtx, ds: Dataset, reforma: Reforma | null, rec?: Record8 | null): XmlParam {
  const blocos: XmlBloco[] = [];
  const v: XmlVerif[] = [];
  const dig = ctx.cnpj.replace(/\D/g, '');
  const crt = ctx.regime === 'simples' ? '1' : '3';
  const ufEmiCod = cUF(ctx.ufEmi);
  const importado = ctx.operacao === 'importacao';
  const exportacao = ctx.operacao === 'exportacao';
  const sv = (o: { [k: string]: string | boolean | number }) => Object.values(o).join('|');

  const prm = rec ? parameterize(rec, ds, {
    operacao: ctx.operacao, regime: ctx.regime, finalidade: ctx.finalidade,
    ufOrigem: ctx.ufEmi, ufDestino: ctx.ufDest, st: ctx.st, beneficiado: ctx.beneficiado,
    industrial: ctx.industrial, devolvido: ctx.finNFe === '4',
  }) : null;
  const icmsBloco = prm?.blocks.find((b) => /ICMS/.test(b.titulo));
  const mIcms = /CSOSN\s*(\d{3})/.exec(icmsBloco?.codigo || '') || /CST\s*(\d{3})/.exec(icmsBloco?.codigo || '');
  const icmsCod = mIcms ? mIcms[1] : '';
  const grupoIcms = ctx.regime === 'simples' ? `ICMSSN${icmsCod || '102'}` : `ICMS${icmsCod || '00'}`;
  const pisBloco = prm?.blocks.find((b) => /PIS/.test(b.titulo));
  const cstPis = (/CST (\d\d)/.exec(pisBloco?.codigo || '') || [])[1] || '01';
  const ipiBloco = prm?.blocks.find((b) => /IPI/.test(b.titulo));
  const cstIpi = (/CST (\d\d)/.exec(ipiBloco?.codigo || '') || [])[1] || '50';
  const ref = sugerirReforma(reforma, (rec || { is: null, cest: [] }) as Record8,
    { operacao: ctx.operacao, regime: ctx.regime, finalidade: ctx.finalidade, ufOrigem: ctx.ufEmi,
      ufDestino: ctx.ufDest, st: ctx.st, beneficiado: ctx.beneficiado, industrial: ctx.industrial },
    ctx.anoReforma, rec?.desc || '', { cst: cstPis });
  const escolha = ctx.cClassTribForcado
    ? { cst: ctx.cClassTribForcado.slice(0, 3), codigo: ctx.cClassTribForcado,
        descricao: '(informado manualmente)', tratamento: '', reducao: false, dfe: [] as string[],
        cstNome: (reforma?.cst || []).find((x) => x.codigo === ctx.cClassTribForcado.slice(0, 3))?.descricao || '' }
    : ref.cbsibs[0];
  const aliq = reforma?.aliquotas?.[String(ctx.anoReforma)];
  const bloco = (tag: string, grupo: string, quando: string, campos: XmlCampo[]) =>
    blocos.push({ tag, grupo, quando, campos });
  const C = (tag: string, grupo: string, valor: string, obrig: XmlCampo['obrig'], motivo: string,
             fonte: XmlCampo['fonte']): XmlCampo => ({ tag, grupo, valor, obrig, motivo, fonte });

  // ------------------------------------------------------------- ide
  const ide: XmlCampo[] = [
    C('cUF', 'ide', ufEmiCod, 'sempre', 'código IBGE da UF do emitente', 'tabela oficial'),
    C('cNF', 'ide', '', 'sempre', 'número aleatório de 8 dígitos, único por série', 'a preencher'),
    C('natOp', 'ide', naturalOperacao(ctx, !!rec), 'sempre', 'descrição da operação — padronize no ERP, é o que o fisco lê primeiro', 'regra do app'),
    C('mod', 'ide', ctx.modelo === 'nfs-e' ? '' : ctx.modelo, 'sempre', 'modelo do documento (Tabela de Modelos de DFe)', 'tabela oficial'),
    C('serie', 'ide', '1', 'sempre', 'série do documento', 'a preencher'),
    C('nNF', 'ide', '', 'sempre', 'número da nota', 'a preencher'),
    C('dhEmi', 'ide', '', 'sempre', 'data/hora de emissão com fuso (-03:00 no horário de Brasília)', 'a preencher'),
    C('tpNF', 'ide', (ctx.finalidade === 'consumo' || ctx.finNFe === '4') ? '0' : '1', 'sempre',
      '0=entrada · 1=saída', 'regra do app'),
    C('idDest', 'ide', ctx.operacao === 'interna' ? '1' : ctx.operacao === 'interestadual' ? '2' : '3', 'sempre',
      '1=intraestadual · 2=interestadual · 3=exterior — usado no cálculo de IBS/CBS', 'regra do app'),
    C('indFinal', 'ide', String(ctx.indFinal), 'sempre', '1 = operação para consumidor final', 'regra do app'),
    C('indPres', 'ide', ctx.indPres, 'sempre', 'presença do comprador (0 ausente · 1 presencial · 2 internet · 3 teleatendimento · 9 outros)', 'regra do app'),
    C('tpImp', 'ide', '1', 'opcional', 'formato do DANFE', 'a preencher'),
    C('tpEmis', 'ide', '1', 'sempre', 'emissão normal', 'a preencher'),
    C('tpAmb', 'ide', ctx.tpAmb, 'sempre', '1=produção · 2=homologação', 'regra do app'),
    C('finNFe', 'ide', ctx.finNFe, 'sempre', 'finalidade da emissão', 'regra do app'),
    C('indIntermed', 'ide', ctx.modelo === '65' ? '1' : '0', 'condicional', 'intermediação por marketplace', 'regra do app'),
  ];
  if (ctx.finNFe === '2' || ctx.finNFe === '3') {
    ide.push(C(ctx.tpNFCredito ? 'tpNFCredito' : 'tpNFDebito', 'ide', ctx.tpNFCredito || ctx.tpNFDebito, 'sempre',
      'complemento/ajuste exige o tipo (03 recusa total · 04 redução de valores · 06/07/09 demais)', 'tabela oficial'));
  }
  bloco('ide', 'identificação do documento', 'sempre', ide);

  // ------------------------------------------------------------- emit
  const emit: XmlCampo[] = [
    C('CNPJ', 'emit', dig, 'sempre', '14 dígitos, sem máscara', 'a preencher'),
    C('IE', 'emit', ctx.ie || 'ISENTO', 'sempre', 'Inscrição Estadual; contribuinte isento usa a literal ISENTO', 'a preencher'),
    C('CRT', 'emit', crt, 'sempre', `1=Simples Nacional · 2=Simples-Naturele · 3=Regime Normal (regime informado: ${ctx.regime})`, 'regra do app'),
    C('IM', 'emit', '', 'condicional', 'inscrição municipal, exigida quando há tributo municipal', 'a preencher'),
    C('cMun', 'emit', ctx.municipioIbge, 'sempre', 'código IBGE do município (7 dígitos)', 'a preencher'),
    C('xMun', 'emit', '', 'sempre', 'nome do município', 'a preencher'),
    C('UF', 'emit', ctx.ufEmi, 'sempre', 'UF do emitente', 'a preencher'),
  ];
  if (ctx.regime === 'simples') {
    emit.push(C('regApIBSCBSSN', 'emit', ctx.regApIBSCBSSN || '0', 'sempre',
      'regime de apuração do IBS/CBS do optante (0 normal · 1 apuração simplificada)', 'tabela oficial'));
  }
  bloco('emit', 'emitente', 'sempre', emit);

  // ------------------------------------------------------------- dest
  if (ctx.cnpjDest || ctx.modelo === '65' || exportacao) {
    bloco('dest', 'destinatário', 'haver destinatário identificado', [
      C('CNPJ', 'dest', ctx.cnpjDest.replace(/\D/g, ''), 'condicional', 'CNPJ (14) ou CPF (11) do destinatário', 'a preencher'),
      C('idEstrangeiro', 'dest', exportacao ? '' : '', exportacao ? 'sempre' : 'opcional',
        'na operação com não contribuinte do exterior, substitui o documento fiscal', 'a preencher'),
      C('IM', 'dest', ctx.ieDest, 'opcional', 'inscrição municipal do destinatário', 'a preencher'),
      C('indIEDest', 'dest', ctx.ieDest ? '1' : '9', 'sempre', '1=contribuinte · 2=isento · 9=não contribuinte', 'regra do app'),
      C('cMun', 'dest', '', 'condicional', 'município IBGE do destinatário', 'a preencher'),
      C('UF', 'dest', ctx.ufDest, 'sempre', 'UF do destinatário — define IBS de destino quando o comprador não é contribuinte', 'a preencher'),
    ]);
  }

  // ------------------------------------------------------------- prod
  if (rec) {
    bloco('prod', 'produto', 'por item', [
      C('cProd', 'prod', '', 'sempre', 'código do produto no ERP', 'a preencher'),
      C('cEAN', 'prod', 'SEM GTIN', 'sempre', 'GTIN/EAN ou a literal SEM GTIN', 'a preencher'),
      C('NCM', 'prod', rec.d8, 'condicional', 'obrigatório para mercadoria — 8 dígitos da Tabela NCM vigente', 'tabela oficial'),
      C('CEST', 'prod', (rec.cest || [])[0] || '', 'condicional', 'CEST, obrigatório quando o item está no Convênio ICMS 142/2018', 'tabela oficial'),
      C('EXTIPI', 'prod', rec.extarif ? 'ver Gecex' : '', 'opcional', 'a posição tem NCM-Ex (ex-tarifário) — conferir a lista vigente', 'regra do app'),
      C('uCom', 'prod', '', 'sempre', 'unidade comercial', 'a preencher'),
      C('qCom', 'prod', '', 'sempre', 'quantidade comercial', 'a preencher'),
      C('vUnCom', 'prod', '', 'sempre', 'valor unitário — alimenta a base de IBS/CBS', 'a preencher'),
      C('vProd', 'prod', '', 'sempre', 'valor total do item', 'a preencher'),
    ]);
  } else {
    bloco('prod', 'produto', 'classifique o NCM para liberar o bloco', [
      C('NCM', 'prod', '', 'condicional', 'sem NCM em item de mercadoria a NF-e é rejeitada', 'a preencher'),
      C('NBS', 'prod', ctx.nbs, ctx.modelo === 'nfs-e' ? 'sempre' : 'opcional', 'NBS de 9 dígitos para serviço', 'a preencher'),
    ]);
  }

  // ------------------------------------------------------------- ICMS / IPI / PIS-COFINS
  const icms: XmlCampo[] = [
    C(ctx.regime === 'simples' ? 'CSOSN' : 'CST', grupoIcms, icmsCod, 'sempre',
      icmsBloco?.detalhe || 'definido pelo regime e pelo benefício fiscal', 'regra do app'),
    C('orig', grupoIcms, importado ? '2' : '0', 'sempre', 'origem da mercadoria (0 nacional · 1 importado direto · 2 importado de terceiros)', 'regra do app'),
    C('modFrete', grupoIcms, ctx.modFrete, 'sempre', '0 CIF emitente · 1 FOB destinatário · 2 terceiros · 3 próprio · 4 remetente · 9 sem frete', 'regra do app'),
    C('vBC', grupoIcms, '', 'condicional', 'base de cálculo do ICMS', 'a preencher'),
    C('pICMS', grupoIcms, '', 'condicional', 'alíquota interna da UF de origem ou interestadual conforme o destino', 'a preencher'),
    C('vICMS', grupoIcms, '', 'condicional', 'valor do ICMS', 'a preencher'),
  ];
  if (ctx.st) icms.push(
    C('vBCST', grupoIcms, '', 'sempre', 'base de cálculo da substituição tributária', 'a preencher'),
    C('pICMSST', grupoIcms, '', 'sempre', 'alíquota ST', 'a preencher'),
    C('vICMSST', grupoIcms, '', 'sempre', 'ICMS-ST retido (em ST interestadual, verificar FCP do destino)', 'a preencher'),
  );
  bloco(grupoIcms, `ICMS — ${grupoIcms}`, ctx.regime === 'simples' ? 'optante pelo Simples Nacional' : 'NF-e de mercadoria', icms);

  if (ctx.regime !== 'simples') {
    bloco('gIPI', 'IPI', 'estabelecimento industrial/equiparado ou item tributado', [
      C('CST', 'IPI', cstIpi, 'sempre', ipiBloco?.detalhe || 'CST do IPI (art. 5º do Decreto 7.212/2010)', 'regra do app'),
      C('cEnq', 'IPI', '', 'condicional', 'enquadramento do IPI (999 = demais)', 'a preencher'),
      C('vBC', 'IPI', '', 'opcional', 'base do IPI', 'a preencher'),
      C('pIPI', 'IPI', rec?.ipi != null ? String(rec.ipi).replace('.', ',') : '0', 'condicional',
        'alíquota da TIPI vigente para o NCM', rec?.ipi != null ? 'tabela oficial' : 'a preencher'),
      C('vIPI', 'IPI', '', 'condicional', 'valor do IPI', 'a preencher'),
    ]);
  }

  bloco('tributosPisCofins', 'PIS/COFINS', 'enquanto vigentes (2026 convive com a CBS em alíquota-teste)', [
    C('PIS/CST', 'PIS/COFINS', cstPis, 'sempre', pisBloco?.detalhe || 'Tabela de CST da Lei 10.637/2002', 'regra do app'),
    C('PIS/vBC', 'PIS/COFINS', '', 'condicional', 'base (regime não cumulativo)', 'a preencher'),
    C('PIS/pAliq', 'PIS/COFINS', '', 'condicional', '1,65% / 7,60% não cumulativo · 0,65% / 3,00% cumulativo', 'a preencher'),
    C('COFINS/CST', 'PIS/COFINS', cstPis, 'sempre', 'mesmo CST do PIS para a COFINS', 'regra do app'),
    C('COFINS/vBC', 'PIS/COFINS', '', 'condicional', 'base da COFINS', 'a preencher'),
    C('COFINS/pAliq', 'PIS/COFINS', '', 'condicional', 'alíquota da COFINS', 'a preencher'),
  ]);

  // ------------------------------------------------------------- IBS / CBS / IS
  const ibscbs: XmlCampo[] = [
    C('CST', 'IBSCBS', escolha?.cst || '', 'sempre', escolha ? `${escolha.cstNome} · ${escolha.descricao}` : 'escolha o cClassTrib na aba Reforma', 'tabela oficial'),
    C('cClassTrib', 'IBSCBS', escolha?.codigo || '', 'sempre', 'os 3 primeiros dígitos têm de ser iguais ao CST', 'tabela oficial'),
    C('cClassTribCredPres', 'IBSCBS', '', 'opcional', 'classificação da nota referenciada, quando houver crédito presumido', 'a preencher'),
    C('vBC', 'IBSCBS', '', 'sempre', 'base = valor da operação (vProd, em regra)', 'a preencher'),
    C('pRedAliq', 'IBSCBS', '', escolha?.reducao ? 'sempre' : 'opcional', 'percentual de redução — obrigatório quando o cClassTrib admite redução', 'a preencher'),
    C('pAliqEfet', 'IBSCBS', '', 'condicional', 'alíquota efetiva após a redução', 'a preencher'),
    C('pCBS', 'IBSCBS', aliq?.uniao != null ? String(aliq.uniao).replace('.', ',') : '', 'sempre',
      `CBS de referência em ${ctx.anoReforma} (tabela oficial da transição)`, 'tabela oficial'),
    C('vCBS', 'IBSCBS', '', 'sempre', 'valor da CBS', 'a preencher'),
    C('pIBSUF', 'IBSCBS', (aliq?.uf || [])[0] != null ? String(aliq!.uf![0]).replace('.', ',') : '', 'sempre',
      `IBS estadual de referência em ${ctx.anoReforma}`, 'tabela oficial'),
    C('vIBSUF', 'IBSCBS', '', 'sempre', 'valor do IBS estadual', 'a preencher'),
    C('pIBSMun', 'IBSCBS', '', 'condicional', 'IBS municipal (0% em 2026, fase de teste)', 'a preencher'),
    C('vIBSMun', 'IBSCBS', '', 'condicional', 'valor do IBS municipal', 'a preencher'),
  ];
  if (exportacao) ibscbs.push(C('gCredPresOper', 'IBSCBS', '', 'opcional',
    'crédito presumido de exportação: exige a nota referenciada e o cCredPres da tabela', 'a preencher'));
  bloco('IBSCBS', `IBS / CBS (${ctx.anoReforma})`, 'obrigatório desde 2026 em alíquotas-teste; pleno em 2027', ibscbs);

  if (importado) {
    bloco('importaII', 'importação', 'aquisição no mercado externo', [
      C('vBC', 'importação', '', 'sempre', 'base = valor aduaneiro + II + AFRMM', 'a preencher'),
      C('vII', 'importação', '', 'sempre', `II de ${rec?.ii ?? '—'}% (TEC/exceção nacional do NCM)`, 'tabela oficial'),
      C('indDir', 'importação', '1', 'sempre', 'indicador de importação (contribuinte ou não do IBS/CBS) — muda a exigência do tributo', 'tabela oficial'),
      C('nDI', 'importação', '', 'condicional', 'número do DSE/DA', 'a preencher'),
    ]);
  }

  if (rec?.is === 1) {
    bloco('IS', 'Imposto Seletivo', `NCM na lista oficial do IS (base ${reforma?.is_data || 2027})`, [
      C('CSTIS', 'IS', '000', 'sempre', 'CST do Imposto Seletivo', 'tabela oficial'),
      C('cClassTribIS', 'IS', '', 'sempre', 'cClassTrib do IS (30 códigos na tabela oficial)', 'a preencher'),
      C('vBC', 'IS', '', 'sempre', 'base do IS', 'a preencher'),
      C('pIS', 'IS', rec?.adv != null ? String(rec.adv).replace('.', ',') : '', 'sempre',
        'ad valorem do NCM na tabela oficial da RFB', 'tabela oficial'),
      C('vIS', 'IS', '', 'sempre', 'valor do IS', 'a preencher'),
      C('pISAliqAdRem', 'IS', rec?.are != null ? String(rec.are).replace('.', ',') : '', 'condicional',
        'alíquota específica (ad rem) por unidade tributável', 'tabela oficial'),
      C('qTrib', 'IS', '', 'condicional', 'quantidade tributável para o cálculo ad rem', 'a preencher'),
      C('uTrib', 'IS', rec?.un || '', 'condicional', 'unidade de referência da alíquota específica', 'tabela oficial'),
    ]);
  }

  // ------------------------------------------------------------- DUIMP / monofásico / ref
  const attrs = (rec?.attrs || []) as [number, 0 | 1, 0 | 1][];
  if (attrs.length) {
    bloco('gDUIMP', 'Catálogo de Produtos / DUIMP', 'importação ou exportação', [
      C('CodProdCont', 'DUIMP', '', 'sempre', 'código do produto no Catálogo (DUIMP)', 'a preencher'),
      C('NrOpr', 'DUIMP', '', 'condicional', 'número da operação no DUIMP', 'a preencher'),
      C('tpLan', 'DUIMP', '', 'condicional', 'tipo de lançamento cambial', 'a preencher'),
      C('resumo', 'DUIMP', `${attrs.length} atributos exigidos para este NCM (${attrs.filter((a) => a[1] === 1).length} obrigatórios)`,
        'opcional', 'o CADA trava a DUIMP se faltar atributo', 'tabela oficial'),
    ]);
  }
  if ((escolha?.cst || '') === '620') {
    bloco('gMono', 'Tributação monofásica', 'CST 620 (combustíveis e monofasia)', [
      C('vItemMonoIbs', 'gMono', '', 'sempre', 'valor do item na cadeia monofásica', 'a preencher'),
      C('pMonoIbs', 'gMono', '', 'sempre', 'IBS monofásico por unidade', 'a preencher'),
      C('pMonoCbs', 'gMono', '', 'sempre', 'CBS monofásica por unidade', 'a preencher'),
    ]);
  }
  if (ctx.cClassReferenciada) {
    bloco('refNFe', 'Documentos referenciados', 'crédito presumido que dependa de nota anterior', [
      C('cClass', 'refNFe', ctx.cClassReferenciada, 'sempre', 'cClassTrib da nota referenciada (tabela de crédito presumido)', 'tabela oficial'),
    ]);
  }
  if (ctx.modelo === 'nfs-e') {
    bloco('servico', 'NFS-e de serviço', 'modelo = NFS-e', [
      C('cServico', 'NFS-e', '', 'sempre', 'código do item da lista LC 116/2003 do município', 'a preencher'),
      C('NBS', 'NFS-e', ctx.nbs, 'condicional', 'NBS de 9 dígitos — a tabela de cClassTrib cobre “NBS ou NCM”', 'a preencher'),
      C('xDescServ', 'NFS-e', '', 'sempre', 'descrição do serviço', 'a preencher'),
      C('pAliq', 'NFS-e', '', 'sempre', 'alíquota de ISS do município prestador', 'a preencher'),
    ]);
  }

  for (const b of blocos) {
    const vistos = new Set<string>();
    for (const c of b.campos) {
      if (vistos.has(c.tag)) v.push({ nivel: 'erro', campo: `${b.tag}/${c.tag}`,
        texto: 'tag repetida no mesmo grupo — o schema não permite duas ocorrências' });
      vistos.add(c.tag);
    }
  }

  const cfop = prm?.cfops[0];

  // ------------------------------------------------------------- maqueta XML
  const maq: string[] = ['<NFe xmlns="http://www.portalfiscal.inf.br/nfe">', '  <infNFe versao="4.00" Id="">'];
  for (const b of blocos) {
    maq.push(`    <!-- ${b.grupo} · ${b.quando} -->`);
    maq.push(`    <${b.tag}>`);
    let abertoDentro: string | null = null;
    for (const c of b.campos) {
      if (c.tag === 'resumo') { maq.push(`      <!-- ${c.valor} -->`); continue; }
      const [sub, ...resto] = c.tag.split('/');
      const tag = resto.length ? resto.join('/') : c.tag;
      if (resto.length) {
        if (abertoDentro && abertoDentro !== sub) { maq.push(`      </${abertoDentro}>`); abertoDentro = null; }
        if (!abertoDentro) { maq.push(`      <${sub}>`); abertoDentro = sub; }
        maq.push(`        <${tag}>${c.valor}</${tag}>`);
      } else {
        if (abertoDentro) { maq.push(`      </${abertoDentro}>`); abertoDentro = null; }
        maq.push(`      <${tag}>${c.valor}</${tag}>`);
      }
    }
    if (abertoDentro) maq.push(`      </${abertoDentro}>`);
    maq.push(`    </${b.tag}>`);
  }
  if (cfop) maq.push(`    <!-- CFOP de cadastro: ${cfop.c} — ${cfop.d} (não é tag da NF-e) -->`);
  maq.push('  </infNFe>', '</NFe>');
  void sv;

  // ------------------------------------------------------------- verificações
  if (dig) {
    v.push(cnpjValido(dig)
      ? { nivel: 'ok', campo: 'emit/CNPJ', texto: `${dig} — dígitos verificadores conferem` }
      : { nivel: 'erro', campo: 'emit/CNPJ', texto: 'CNPJ inválido (dígitos verificadores) — a SEFAZ rejeita' });
    if (dig.length !== 14) v.push({ nivel: 'erro', campo: 'emit/CNPJ', texto: `CNPJ tem ${dig.length} dígitos; o schema exige 14` });
  } else v.push({ nivel: 'erro', campo: 'emit/CNPJ', texto: 'sem CNPJ do emitente não há documento' });

  if (ctx.municipioIbge) {
    const ufDoCodigo = ({ '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
      '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
      '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT',
      '52': 'GO', '53': 'DF' } as Record<string, string>)[ctx.municipioIbge.slice(0, 2)];
    v.push(/^\d{7}$/.test(ctx.municipioIbge)
      ? { nivel: ufDoCodigo === ctx.ufEmi ? 'ok' : 'atencao', campo: 'emit/cMun',
          texto: ufDoCodigo === ctx.ufEmi ? 'código IBGE de 7 dígitos compatível com a UF'
            : `o prefixo ${ctx.municipioIbge.slice(0, 2)} aponta para ${ufDoCodigo || 'UF inexistente'}, não ${ctx.ufEmi}` }
      : { nivel: 'erro', campo: 'emit/cMun', texto: 'cMun exige exatamente 7 dígitos (código IBGE)' });
  } else v.push({ nivel: 'erro', campo: 'emit/cMun', texto: 'cMun é obrigatório — informe o código IBGE do município' });

  if (reforma?.disponivel && escolha?.codigo) {
    const existe = (reforma.classificacoes || []).some((x) => x.c === escolha.codigo)
      || (reforma.is_classificacoes || []).some((x) => x.c === escolha.codigo);
    v.push(existe
      ? { nivel: 'ok', campo: 'IBSCBS/cClassTrib', texto: `${escolha.codigo} existe na tabela oficial (${escolha.cstNome || escolha.cst})` }
      : { nivel: 'erro', campo: 'IBSCBS/cClassTrib', texto: `${escolha.codigo} não consta na tabela oficial vigente — rejeição 1065/1067` });
    if (escolha.codigo.slice(0, 3) !== escolha.cst) {
      v.push({ nivel: 'erro', campo: 'IBSCBS', texto: `cClassTrib ${escolha.codigo} não começa com o CST ${escolha.cst}` });
    }
  } else if (!reforma?.disponivel) {
    v.push({ nivel: 'erro', campo: 'IBSCBS', texto: 'tabela cClassTrib não carregada — rode npm run build:reforma' });
  }
  if (ctx.regime === 'simples' && !ctx.regApIBSCBSSN) {
    v.push({ nivel: 'atencao', campo: 'emit/regApIBSCBSSN',
      texto: 'optante pelo Simples: escolha o regime de apuração do IBS/CBS (0 normal · 1 apuração simplificada)' });
  }
  if (ctx.ie) {
    const ok = ieValida(ctx.ufEmi, ctx.ie);
    v.push(ok === false
      ? { nivel: 'erro', campo: 'emit/IE', texto: `IE não passa no dígito verificador de ${ctx.ufEmi}` }
      : ok === true
        ? { nivel: 'ok', campo: 'emit/IE', texto: `IE válida para ${ctx.ufEmi}` }
        : { nivel: 'atencao', campo: 'emit/IE', texto: `${ctx.ufEmi}: o app não implementa o DV deste estado — confira no portal da SEFAZ` });
  }
  if (ctx.cnpjDest) {
    const dd = ctx.cnpjDest.replace(/\D/g, '');
    v.push(dd.length === 11
      ? { nivel: cpfValido(dd) ? 'ok' : 'erro', campo: 'dest/CPF', texto: cpfValido(dd) ? 'CPF do destinatário OK' : 'CPF inválido' }
      : dd.length === 14
        ? { nivel: cnpjValido(dd) ? 'ok' : 'erro', campo: 'dest/CNPJ', texto: cnpjValido(dd) ? 'CNPJ do destinatário OK' : 'CNPJ inválido' }
        : { nivel: 'erro', campo: 'dest/CNPJ', texto: 'documento do destinatário deve ter 11 (CPF) ou 14 (CNPJ) dígitos' });
  }
  if (ctx.finNFe === '2' || ctx.finNFe === '3') {
    v.push({ nivel: ctx.tpNFCredito || ctx.tpNFDebito ? 'ok' : 'erro', campo: 'ide/tpNFCredito',
      texto: ctx.tpNFCredito || ctx.tpNFDebito ? 'tipo de nota de crédito/débito informado'
        : 'complemento (finNFe 2) ou ajuste (3) sem tpNFCredito/tpNFDebito é rejeição' });
  }
  if (ctx.modelo === '65' && ctx.indFinal !== 1) {
    v.push({ nivel: 'erro', campo: 'ide/indFinal', texto: 'NFC-e (mod 65) exige indFinal = 1 (consumidor final)' });
  }
  if (ctx.modelo === '65' && ctx.indPres === '0') {
    v.push({ nivel: 'erro', campo: 'ide/indPres', texto: 'em NFC-e, indPres 0 (ausente) é rejeitado pela maioria das autorizadas' });
  }
  if (rec) {
    v.push({ nivel: 'ok', campo: 'prod/NCM', texto: `${rec.ncm} — ${rec.desc.replace(/^[-–\s]+/, '').slice(0, 68)}…` });
    if ((rec.cest || []).length && !ctx.st) {
      v.push({ nivel: 'atencao', campo: 'prod/CEST', texto: `o NCM tem CEST (${(rec.cest || []).join(', ')}): se a UF de destino exige ST, marque ST — o bloco de ICMS muda` });
    }
    if (rec.is === 1) {
      v.push({ nivel: 'atencao', campo: 'IS', texto: 'a tabela oficial da RFB aponta este NCM na lista do Imposto Seletivo a partir de 2027 — preencha o grupo IS' });
    }
  } else if (ctx.modelo !== 'nfs-e') {
    v.push({ nivel: 'erro', campo: 'prod/NCM', texto: 'sem NCM no item de mercadoria a NF-e é rejeitada (classifique antes)' });
  }
  if (ctx.anoReforma >= 2027 && !exportacao) {
    v.push({ nivel: 'atencao', campo: 'IBSCBS', texto: `${ctx.anoReforma}: CBS e IBS em transição — a alíquota de referência não substitui a do exercício` });
  }
  const erros = v.filter((x) => x.nivel === 'erro').length;
  const atencoes = v.filter((x) => x.nivel === 'atencao').length;
  return {
    campos: blocos, maqueta: maq.join('\n'), verificacoes: v,
    resumo: `${blocos.reduce((a, b) => a + b.campos.length, 0)} campos · ${erros} bloqueante(s) · ${atencoes} conferência(s)`
      + (cfop ? ` · CFOP ${cfop.c}` : '') + (attrs.length ? ` · ${attrs.length} atributos de catálogo` : ''),
  };
}

const escapa = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function naturalOperacao(ctx: XmlCtx, temRec: boolean): string {
  if (ctx.finNFe === '4') return temRec ? 'Retorno de mercadoria adquirida' : 'Devolução de venda';
  if (ctx.operacao === 'exportacao') return 'Venda para exportação';
  if (ctx.operacao === 'importacao') return ctx.finalidade === 'industrializacao' ? 'Importação para industrialização' : 'Importação de mercadoria';
  if (ctx.finalidade === 'consumo') return 'Aquisição de mercadoria para uso/consumo';
  if (ctx.finalidade === 'ativo') return 'Aquisição para o ativo imobilizado';
  if (ctx.finalidade === 'industrializacao') return 'Remessa para industrialização';
  return ctx.operacao === 'interestadual' ? 'Venda de mercadoria adquirida de terceiros (fora do estado)' : 'Venda de mercadoria';
}
