'use client';

/**
 * PARAMETRIZAÇÃO DE ERP — a tela onde se informa o cadastro da empresa e o cenário da
 * operação; o app devolve os códigos (NCM, CEST/CEF, CFOP, CST/CSOSN, IPI, cClassTrib,
 * CST-IBS/CBS, IS) e a maqueta de XML do item, com as conferências de schema.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dataset, ErpTabela, Reforma, loadDataset, loadErpTabela, loadReforma, normalizeNcm } from '@/lib/data';
import { classify } from '@/lib/engine';
import { XmlCtx, cUF, montarXml, MODELOS } from '@/lib/xml';
import { Finalidade, Operacao, Regime } from '@/lib/parametrizacao';
import { buscarClassificacoes } from '@/lib/reforma';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const SELO_CLASSE: Record<string, string> = { oficial: 'oficial', duvidoso: 'duvidoso', inferido: 'inferido', derivada: 'derivada' };

const FONTES: Record<string, string> = { 'tabela oficial': 'selo-oficial', 'regra do app': 'selo-derivada', 'a preencher': 'selo-inferido' };

export default function Parametrizar() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [reforma, setReforma] = useState<Reforma | null>(null);
  const [erp, setErp] = useState<ErpTabela | null>(null);
  const [ctx, setCtx] = useState<XmlCtx>({
    cnpj: '', ie: '', municipioIbge: '4120308', ufEmi: 'PR', regime: 'presumido', modelo: '55',
    operacao: 'interna', finalidade: 'comercializacao', ufDest: 'SP', cnpjDest: '', ieDest: '',
    tpAmb: '1', finNFe: '1', indFinal: 1, indPres: '2', modFrete: '9', st: false, beneficiado: false,
    industrial: false, nbs: '', cClassTribForcado: '', cClassTribRegForcado: '', regApIBSCBSSN: '',
    cClassReferenciada: '', tpNFCredito: '', tpNFDebito: '', anoReforma: 2026,
  });
  const [texto, setTexto] = useState('Cadeira de escritório giratória estofada em polipropileno');
  const [ncmManual, setNcmManual] = useState('');
  const [aba, setAba] = useState<'xml' | 'tabela'>('xml');
  const [copiado, setCopiado] = useState('');
  const [buscaTabela, setBuscaTabela] = useState('');
  const [soOficial, setSoOficial] = useState(false);

  useEffect(() => {
    loadDataset().then(async (d) => { setDs(d); await d.pronto; }).catch(() => setDs(null));
    loadReforma().then(setReforma).catch(() => setReforma(null));
    loadErpTabela().then(setErp).catch(() => setErp(null));
  }, []);

  // Todos os hooks abaixo têm de rodar em qualquer render — um `return` antecipado antes
  // deles mudaria a ordem dos hooks e o React estoura ("rendered more hooks than before").
  const cls = useMemo(() => (ds && texto.trim() ? classify(texto, ds, { top: 6 }) : null), [texto, ds]);
  const rec = useMemo(() => {
    if (!ds) return null;
    const manual = normalizeNcm(ncmManual).replace(/\D/g, '');
    if (manual.length === 8) return ds.byD8.get(manual) || null;
    return cls?.candidates[0]?.rec || null;
  }, [ncmManual, cls, ds]);
  const p = useMemo(() => (ds ? montarXml(ctx, ds, reforma, rec) : null), [ctx, ds, reforma, rec]);

  const linhasTabela = useMemo(() => {
    if (!erp) return [];
    const t = buscaTabela.trim().toLowerCase();
    return erp.itens.filter((i) => {
      if (soOficial && i.selo !== 'oficial') return false;
      if (!t) return true;
      return i.tag.toLowerCase().includes(t) || i.desc.toLowerCase().includes(t) || i.ex.toLowerCase().includes(t);
    });
  }, [erp, buscaTabela, soOficial]);

  if (!ds || !p) return <div className="card"><span className="spin" /> carregando dataset…</div>;
  const set = <K extends keyof XmlCtx>(k: K, val: XmlCtx[K]) => setCtx((c) => ({ ...c, [k]: val }));

  const copiar = async (rotulo: string, conteudo: string) => {
    try {
      await navigator.clipboard.writeText(conteudo);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(''), 2200);
    } catch { setCopiado('use Ctrl+C (clipboard bloqueado)'); setTimeout(() => setCopiado(''), 2600); }
  };

  const erros = p!.verificacoes.filter((x) => x.nivel === 'erro').length;

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Parametrização de ERP</h2>
        <p className="hint">
          Informe o cadastro da empresa e o cenário da operação. O app devolve os <b>códigos</b> que o emissor
          precisa (NCM, CEST/CEF, CFOP, CST/CSOSN, CST do IPI, PIS/COFINS, CST-IBS/CBS, <b>cClassTrib</b>, IS) e a
          <b> maqueta de XML</b> do documento. Códigos vêm das tabelas oficiais carregadas; campos de
          <i> valor e alíquota estadual</i> saem marcados “a preencher”, porque dependem da UF e do regime.
        </p>

        <h3>Empresa / emitente</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
          <label className="field"><span>CNPJ (14 dígitos)</span>
            <input value={ctx.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="ex.: 12.345.678/0001-90" /></label>
          <label className="field"><span>Inscrição Estadual</span>
            <input value={ctx.ie} onChange={(e) => set('ie', e.target.value)} placeholder="número ou ISENTO" /></label>
          <label className="field"><span>Município (código IBGE)</span>
            <input value={ctx.municipioIbge} onChange={(e) => set('municipioIbge', e.target.value)} placeholder="7 dígitos" /></label>
          <label className="field"><span>UF do emitente</span>
            <select value={ctx.ufEmi} onChange={(e) => set('ufEmi', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field"><span>Regime tributário</span>
            <select value={ctx.regime} onChange={(e) => set('regime', e.target.value as Regime)}>
              <option value="simples">Simples Nacional (CRT 1)</option>
              <option value="presumido">Lucro Presumido (CRT 3)</option>
              <option value="real">Lucro Real (CRT 3)</option>
            </select></label>
          {ctx.regime === 'simples' && (
            <label className="field"><span>Apuração IBS/CBS no Simples</span>
              <select value={ctx.regApIBSCBSSN} onChange={(e) => set('regApIBSCBSSN', e.target.value as XmlCtx['regApIBSCBSSN'])}>
                <option value="">— não informado —</option>
                <option value="0">0 — apuração normal</option>
                <option value="1">1 — apuração simplificada</option>
              </select></label>
          )}
        </div>

        <h3>Documento e operação</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
          <label className="field"><span>Modelo</span>
            <select value={ctx.modelo} onChange={(e) => set('modelo', e.target.value as XmlCtx['modelo'])}>
              {MODELOS.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
            </select></label>
          <label className="field"><span>Operação</span>
            <select value={ctx.operacao} onChange={(e) => set('operacao', e.target.value as Operacao)}>
              <option value="interna">interna (mesma UF)</option>
              <option value="interestadual">interestadual</option>
              <option value="importacao">importação</option>
              <option value="exportacao">exportação</option>
            </select></label>
          <label className="field"><span>Finalidade</span>
            <select value={ctx.finalidade} onChange={(e) => set('finalidade', e.target.value as Finalidade)}>
              <option value="comercializacao">revenda / comercialização</option>
              <option value="industrializacao">industrialização</option>
              <option value="consumo">uso e consumo</option>
              <option value="ativo">ativo imobilizado</option>
            </select></label>
          <label className="field"><span>UF do destinatário</span>
            <select value={ctx.ufDest} onChange={(e) => set('ufDest', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field"><span>CNPJ do destinatário</span>
            <input value={ctx.cnpjDest} onChange={(e) => set('cnpjDest', e.target.value)} placeholder="opcional" /></label>
          <label className="field"><span>IE do destinatário</span>
            <input value={ctx.ieDest} onChange={(e) => set('ieDest', e.target.value)} placeholder="se contribuinte" /></label>
          <label className="field"><span>Ambiente</span>
            <select value={ctx.tpAmb} onChange={(e) => set('tpAmb', e.target.value as '1' | '2')}>
              <option value="1">1 — produção</option><option value="2">2 — homologação</option>
            </select></label>
          <label className="field"><span>finNFe</span>
            <select value={ctx.finNFe} onChange={(e) => set('finNFe', e.target.value as XmlCtx['finNFe'])}>
              <option value="1">1 — normal</option><option value="2">2 — complementar valores</option>
              <option value="3">3 — ajuste de nota</option><option value="4">4 — devolução</option>
            </select></label>
          {(ctx.finNFe === '2' || ctx.finNFe === '3') && (
            <label className="field"><span>tpNFCredito / tpNFDebito</span>
              <input value={ctx.tpNFCredito} onChange={(e) => set('tpNFCredito', e.target.value)} placeholder="ex.: 04 (redução de valores)" /></label>
          )}
          <label className="field"><span>indFinal (consumidor final)</span>
            <select value={String(ctx.indFinal)} onChange={(e) => set('indFinal', +e.target.value as 0 | 1)}>
              <option value="1">1 — sim</option><option value="0">0 — não</option>
            </select></label>
          <label className="field"><span>indPres (presença)</span>
            <select value={ctx.indPres} onChange={(e) => set('indPres', e.target.value as XmlCtx['indPres'])}>
              <option value="0">0 — ausente</option><option value="1">1 — presencial</option>
              <option value="2">2 — internet</option><option value="3">3 — teleatendimento</option><option value="9">9 — outros</option>
            </select></label>
          <label className="field"><span>modFrete</span>
            <select value={ctx.modFrete} onChange={(e) => set('modFrete', e.target.value as XmlCtx['modFrete'])}>
              {['0', '1', '2', '3', '4', '9'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select></label>
          {ctx.modelo === 'nfs-e' && (
            <label className="field"><span>NBS do serviço</span>
              <input value={ctx.nbs} onChange={(e) => set('nbs', e.target.value)} placeholder="1.0301.31.00" /></label>
          )}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <label className="check"><input type="checkbox" checked={ctx.st} onChange={(e) => set('st', e.target.checked)} /> sujeito a ICMS-ST</label>
          <label className="check"><input type="checkbox" checked={ctx.beneficiado} onChange={(e) => set('beneficiado', e.target.checked)} /> benefício fiscal / isenção</label>
          <label className="check"><input type="checkbox" checked={ctx.industrial} onChange={(e) => set('industrial', e.target.checked)} /> emitente industrial ou equiparado</label>
          <label className="check"><input type="checkbox" checked={ctx.anoReforma >= 2027} onChange={(e) => set('anoReforma', (e.target.checked ? 2027 : 2026) as 2026 | 2027)} /> parametrizar para 2027 (CBS/IBS plenos + IS)</label>
        </div>

        <h3>Item</h3>
        <label className="field" style={{ marginBottom: 8 }}><span>Descrição do produto (para achar o NCM)</span>
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
          <label className="field"><span>NCM (8 dígitos, vazio = usar a descrição)</span>
            <input value={ncmManual} onChange={(e) => setNcmManual(e.target.value)} placeholder={rec?.ncm || '8471.30.12'} /></label>
          <label className="field"><span>cClassTrib (vazio = sugestão do cenário)</span>
            <input value={ctx.cClassTribForcado} onChange={(e) => set('cClassTribForcado', e.target.value)} placeholder="000001" /></label>
          <label className="field"><span>cClass da nota referenciada (crédito presumido)</span>
            <input value={ctx.cClassReferenciada} onChange={(e) => set('cClassReferenciada', e.target.value)} placeholder="410014" /></label>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          {rec ? (
            <span className="badge blue">{rec.ncm} — {rec.desc.replace(/^[-–\s]+/, '').slice(0, 62)}</span>
          ) : <span className="badge red">sem NCM válido — o item de mercadoria seria rejeitado</span>}
          {cls && cls.candidates[0] && cls.candidates[0].rec.ncm === rec?.ncm && (
            <span className="small muted">aderência {Math.round(cls.candidates[0].coverage * 100)}%</span>
          )}
          {cls && cls.candidates.length > 1 && !ncmManual && (
            <div className="chips">
              {cls.candidates.slice(0, 5).map((c) => (
                <button key={c.rec.d8} className="chip" type="button" onClick={() => setNcmManual(c.rec.ncm)}>{c.rec.ncm}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={`tab ${aba === 'xml' ? 'on' : ''}`} type="button" onClick={() => setAba('xml')}>
            Códigos e XML do documento
          </button>
          <button className={`tab ${aba === 'tabela' ? 'on' : ''}`} type="button" onClick={() => setAba('tabela')}>
            Tabela de campos (sua planilha) {erp ? `· ${erp.linhas}` : ''}
          </button>
          <span style={{ marginLeft: 'auto', alignSelf: 'center' }} className={erros ? 'badge red' : 'badge alta'}>
            {erros ? `${erros} bloqueante(s)` : 'sem bloqueantes'}
          </span>
          <button className="mini" style={{ alignSelf: 'center' }} type="button" onClick={() => copiar('xml', p!.maqueta)}>
            copiar XML {copiado === 'xml' && <span className="copia">copiado ✓</span>}
          </button>
        </div>
        <p className="small muted">{p.resumo}</p>

        {aba === 'xml' && (
          <>
            <h3>Conferências de schema e coerência fiscal</h3>
            {p.verificacoes.map((x, i) => (
              <div key={i} className={`verif ${x.nivel}`}>
                <span className="c mono">{x.campo}</span><span>{x.texto}</span>
              </div>
            ))}

            <h3>Códigos por grupo do XML</h3>
            {p.campos.map((b) => (
              <div key={b.grupo} style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <b className="mono">{b.grupo}</b><span className="small muted">{b.quando}</span>
                </div>
                <div className="scroll" style={{ maxHeight: 'none', border: 'none' }}>
                  <table className="tb">
                    <thead><tr><th style={{ width: 172 }}>tag</th><th style={{ width: 170 }}>valor</th><th>por quê</th><th style={{ width: 112 }}>origem</th></tr></thead>
                    <tbody>
                      {b.campos.map((c, ci) => (
                        <tr key={`${b.tag}/${c.tag}/${ci}`}>
                          <td className="mono">{c.tag}{c.grupo !== b.tag && c.grupo !== b.grupo.split(' ')[0] ? <div className="small muted">em {c.grupo}</div> : null}</td>
                          <td className={`mono ${c.valor ? '' : 'muted'}`}>{c.valor || '— a preencher —'}</td>
                          <td className="small">{c.motivo}</td>
                          <td><span className={`selo ${FONTES[c.fonte] || 'selo-derivada'}`}>{c.fonte}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <h3>Maqueta de XML</h3>
            <pre className="xmlpre">{p.maqueta}</pre>
            <p className="small muted">
              Maqueta de <b>estrutura</b> (tags e códigos), não um arquivo válido para transmissão: faltam
              assinatura, totalizadores e os valores que só o seu ERP tem. Use para configurar o mapeamento de
              campos no emissor e conferir contra o XSD da sua Autorizada.
            </p>
          </>
        )}

        {aba === 'tabela' && (
          erp ? (
            <>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label className="field" style={{ minWidth: 260 }}>
                  <span>buscar na planilha “{erp.arquivo}”</span>
                  <input value={buscaTabela} onChange={(e) => setBuscaTabela(e.target.value)} placeholder="tag, descrição ou exemplo" />
                </label>
                <label className="check"><input type="checkbox" checked={soOficial} onChange={(e) => setSoOficial(e.target.checked)} /> só linhas conferidas com tabela oficial</label>
                <span className="small muted">{linhasTabela.length} de {erp.linhas} linhas · sha256 {erp.sha256}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {Object.entries(erp.contagens).map(([k, n]) => (
                  <span key={k} className={`selo selo-${SELO_CLASSE[k] || 'derivada'}`}>{k}: {Number(n).toLocaleString('pt-BR')}</span>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>{erp.aviso}</p>
              <div className="scroll">
                <table className="tb">
                  <thead><tr><th>campo / tag</th><th>descrição</th><th>tipo</th><th>tam.</th><th>exemplo</th><th>fonte</th><th>selo</th></tr></thead>
                  <tbody>
                    {linhasTabela.slice(0, 250).map((i, k) => (
                      <tr key={k}>
                        <td className="mono">{i.tag}</td>
                        <td className="small">{i.desc}</td>
                        <td className="small muted">{i.tipo}</td>
                        <td className="small mono">{i.tam}</td>
                        <td className="mono small">{i.ex}</td>
                        <td className="small muted mono">{i.fonte}</td>
                        <td><span className={`selo selo-${i.selo === 'oficial' ? 'oficial' : i.selo === 'duvidoso' ? 'duvidoso' : i.selo === 'inferido' ? 'inferido' : 'derivada'}`} title={i.nota}>{i.selo}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {linhasTabela.length > 250 && <p className="small muted">mostrando 250 de {linhasTabela.length} — refine a busca.</p>}
            </>
          ) : (
            <p className="hint">Tabela de campos não publicada. Rode <code className="mono">python3 scripts/baixar_erp.py</code> (lê o CSV em data/raw/erp) e <code className="mono">npm run dados</code>.</p>
          )
        )}
      </div>

      {ctx.cClassTribForcado && reforma?.disponivel && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>O que a tabela oficial diz sobre o código digitado</h3>
          {buscarClassificacoes(reforma, ctx.cClassTribForcado).map((c) => (
            <div key={c.c} className="note info" style={{ margin: 0 }}>
              <div className="t">{c.c} — CST {c.cst} · {c.cn}</div>
              <div className="x">{c.d}</div>
              <div className="src">tratamento: {c.tt || '—'} · alíquota: {c.ta || '—'} · documentos: {(c.df || []).join(' ') || '—'}</div>
            </div>
          ))}
          {buscarClassificacoes(reforma, ctx.cClassTribForcado).length === 0 && (
            <div className="note critico" style={{ margin: 0 }}>
              <div className="t">{ctx.cClassTribForcado} não consta na tabela oficial vigente</div>
              <div className="x">Emitir com código fora da base leva a rejeição. Consulte a aba “Reforma (IBS/CBS/IS)”.</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
