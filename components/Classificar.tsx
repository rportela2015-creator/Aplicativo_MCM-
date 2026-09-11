'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dataset, Record8, Reforma, describePath, labelForLevel, loadDataset, loadReforma } from '@/lib/data';
import { ReformaSugestao, sugerirReforma } from '@/lib/reforma';
import { Candidate, ParsedQuery, RuleNote, buildNotes, classify, taxes } from '@/lib/engine';
import { Operacao, Param, ParamInput, Regime, Finalidade, catalogChecklist, parameterize } from '@/lib/parametrizacao';

const EXEMPLOS = [
  'Notebook Dell Latitude 1,4 kg com tela 14 polegadas',
  'Smartphone 128 GB com tela AMOLED',
  'Camiseta masculina de malha 100% algodão',
  'Copo descartável de plástico para bebida, 200 ml',
  'Cadeira de escritório giratória estofada com braços',
  'Ar-condicionado split hi-wall 12.000 BTUs',
  'Cerveja pilsen em lata 350 ml',
  'Pneu radial novo para automóvel de passageiros 175/70 R14',
  'Suplemento alimentar whey protein em pó baunilha 900 g',
  'Luva de borracha nitrílica para proteção hospitalar',
  'Kit presente com caneca de cerâmica e colher de aço inox',
  'Peça plástica de reposição para bomba d’água',
];

const BAND_TXT: Record<string, string> = {
  alta: 'consistente — texto da posição cobre o produto',
  media: 'parcial — falta dado técnico para fechar o 8 dígito',
  baixa: 'não feche o código — descrição insuficiente ou ambígua',
};

const fmt = (v: number | null | undefined, suf = '%') => (v === null || v === undefined ? '—' : `${v}${suf}`);

interface AiResponse {
  ncm: string;
  descricaoNcm: string;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  cstIbsCbs: string;
  cClassTrib?: string;
  sujeitoImpostoSeletivo: boolean;
  fundamentacao: string;
}

export default function Classificar() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [frio, setFrio] = useState(false);
  const [reforma, setReforma] = useState<Reforma | null>(null);
  const [err, setErr] = useState('');
  const [texto, setTexto] = useState('');
  const [operacao, setOperacao] = useState<Operacao>('interna');
  const [regime, setRegime] = useState<Regime>('presumido');
  const [finalidade, setFinalidade] = useState<Finalidade>('comercializacao');
  const [ufO, setUfO] = useState('PR');
  const [ufD, setUfD] = useState('SP');
  const [aberto, setAberto] = useState(0);
  const [mostrarTudo, setMostrarTudo] = useState(false);

  // Estados da IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    loadDataset().then(async (d) => { setDs(d); await d.pronto; setFrio(true); })
      .catch((e) => setErr(String(e.message || e)));
    loadReforma().then(setReforma).catch(() => setReforma(null));
  }, []);

  const res = useMemo(() => {
    if (!ds || !texto.trim()) return null;
    const r = classify(texto, ds, { top: 14 });
    const list = mostrarTudo ? r.candidates : r.candidates.filter((c) => c.score > 0);
    return { ...r, list: list.length ? list : r.candidates };
  }, [ds, texto, mostrarTudo]);

  const pinput: ParamInput = { operacao, regime, finalidade, ufOrigem: ufO, ufDestino: ufD };

  const consultarIA = async () => {
    if (!texto.trim()) return;
    setAiLoading(true);
    setAiError('');
    try {
      const contexto = `Operação: ${operacao}, Regime: ${regime}, Finalidade: ${finalidade}, Origem: ${ufO}, Destino: ${ufD}`;
      const res = await fetch('/api/classificar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: texto, contextoOperacao: contexto }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na resposta do servidor.');
      }
      setAiResult(data);
    } catch (e: any) {
      setAiError(e.message || 'Falha ao consultar IA.');
    } finally {
      setAiLoading(false);
    }
  };

  if (err) return <div className="err">Não consegui carregar o dataset. Rode <code>npm run build:dados</code> e recarregue. <span className="mono">{err}</span></div>;
  if (!ds) return <div className="card"><span className="spin" /> carregando Tabela NCM vigente (10.515 códigos de 8 dígitos)…</div>;

  const semResultado = res && res.candidates.length === 0;

  return (
    <>
      <div className="card">
        <h2>Descrição da mercadoria</h2>
        <p className="hint">
          Escreva como no cadastro do produto ou na nota do fornecedor. Quanto mais <b>matéria</b>, <b>função</b> e{' '}
          <b>atributos técnicos</b> (peso, potência, composição, apresentação) você declarar, mais o agente consegue
          descer do capítulo para o subitem. Ele nunca inventa código: se o dado não basta, ele diz.
        </p>
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (aiResult) setAiResult(null);
          }}
          placeholder="ex.: Cadeira estofada giratória em polipropileno, base de aço cromado, para escritório"
        />
        <div className="chips">
          {EXEMPLOS.map((x) => (
            <button key={x} className="chip" onClick={() => { setTexto(x); setAiResult(null); }} type="button">{x}</button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="chip"
            style={{
              background: 'var(--primary, #0f172a)',
              color: '#fff',
              padding: '8px 14px',
              fontWeight: 600,
              cursor: aiLoading || !texto.trim() ? 'not-allowed' : 'pointer',
              opacity: aiLoading || !texto.trim() ? 0.6 : 1,
            }}
            onClick={consultarIA}
            disabled={aiLoading || !texto.trim()}
          >
            {aiLoading ? <><span className="spin" /> Processando com IA…</> : '✦ Classificar com IA Especialista'}
          </button>
        </div>

        <h3>Contexto da operação (para a parametrização fiscal)</h3>
        <div className="grid g4">
          <div>
            <label className="f" htmlFor="op">Operação</label>
            <select id="op" value={operacao} onChange={(e) => setOperacao(e.target.value as Operacao)}>
              <option value="interna">Venda interna (mesma UF)</option>
              <option value="interestadual">Venda interestadual</option>
              <option value="importacao">Entrada/importação</option>
              <option value="exportacao">Exportação</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="rg">Regime do emitente</label>
            <select id="rg" value={regime} onChange={(e) => setRegime(e.target.value as Regime)}>
              <option value="simples">Simples Nacional</option>
              <option value="presumido">Lucro Presumido</option>
              <option value="real">Lucro Real</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="fi">Finalidade do produto</label>
            <select id="fi" value={finalidade} onChange={(e) => setFinalidade(e.target.value as Finalidade)}>
              <option value="comercializacao">Revenda (mercadoria de terceiros)</option>
              <option value="industrializacao">Industrialização / insumo</option>
              <option value="consumo">Consumo próprio</option>
              <option value="ativo">Ativo imobilizado</option>
            </select>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label className="f" htmlFor="ufo">UF origem</label>
              <input id="ufo" type="text" maxLength={2} value={ufO} onChange={(e) => setUfO(e.target.value.toUpperCase())} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="f" htmlFor="ufd">UF destino</label>
              <input id="ufd" type="text" maxLength={2} value={ufD} onChange={(e) => setUfD(e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>
      </div>

      {aiError && (
        <div className="err" style={{ marginTop: 10 }}>
          Falha na classificação por IA: {aiError}
        </div>
      )}

      {aiResult && (
        <div className="card" style={{ border: '2px solid #2563eb', background: '#f8fafc', margin: '14px 0' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#1e40af' }}>Parecer Técnico Tributário (IA Especialista)</h3>
            <span className={`badge ${aiResult.confianca === 'ALTA' ? 'alta' : aiResult.confianca === 'MEDIA' ? 'media' : 'baixa'}`}>
              Confiabilidade {aiResult.confianca}
            </span>
          </div>

          <div className="taxgrid" style={{ marginTop: 12 }}>
            <Tax k="NCM Sugerido" v={fmtCode(aiResult.ncm)} />
            <Tax k="CST IBS/CBS" v={aiResult.cstIbsCbs} />
            <Tax k="cClassTrib" v={aiResult.cClassTrib || '—'} />
            <Tax k="Imposto Seletivo" v={aiResult.sujeitoImpostoSeletivo ? 'SIM' : 'NÃO'} />
            <Tax k="Descrição Oficial" v={aiResult.descricaoNcm} wide />
          </div>

          <div className="note info" style={{ marginTop: 12 }}>
            <div className="t">Fundamentação Normativa (NESH / LC 214 e 227)</div>
            <div className="x">{aiResult.fundamentacao}</div>
          </div>
        </div>
      )}

      {semResultado && !aiResult && (
        <div className="err">
          Nenhum código da Tabela NCM vigente descreve essa mercadoria. Reescreva em termos de <b>matéria</b> e{' '}
          <b>função</b> (ex.: “utensílio de mesa de plástico” em vez de “linha casa”) — ou clique em <b>Classificar com IA Especialista</b> acima.
        </div>
      )}

      {res?.list.map((c, i) => (
        <Resultado
          key={c.rec.d8} ds={ds} idx={i} cand={c} aberto={aberto === i}
          onOpen={() => setAberto(aberto === i ? -1 : i)}
          q={res.query} pin={pinput} forcar={mostrarTudo} frio={frio} reforma={reforma}
        />
      ))}

      {res && res.list.length > 0 && res.list.length < res.candidates.length && (
        <div className="row" style={{ marginTop: -4 }}>
          <button className="mini" type="button" onClick={() => setMostrarTudo(true)}>
            ver {res.candidates.length - res.list.length} candidato(s) de baixa aderência
          </button>
        </div>
      )}
    </>
  );
}

function Resultado({ ds, idx, cand, q, aberto, onOpen, pin, forcar, frio, reforma }: {
  ds: Dataset; idx: number; cand: Candidate; q: ParsedQuery; aberto: boolean;
  onOpen: () => void; pin: ParamInput; forcar: boolean; frio: boolean; reforma: Reforma | null;
}) {
  const { notes, confidence, band } = buildNotes(cand, q, ds, [cand]);
  const rec: Record8 = cand.rec;
  const tx = taxes(rec, ds);
  const path = describePath(ds, rec);
  const param: Param = useMemo(() => parameterize(rec, ds, pin), [rec, ds, pin]);
  const checklist = useMemo(() => catalogChecklist(rec, ds), [rec, ds]);
  const anoReforma = (rec.ini || '').endsWith('/2027') || (rec.ini || '') > '31/12/2026' ? 2027 : 2026;
  const ref: ReformaSugestao = useMemo(
    () => sugerirReforma(reforma, rec, pin, anoReforma, q.raw,
      { cst: (/CST (\d\d)/.exec(param.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '') || [])[1] }),
    [reforma, rec, pin, anoReforma, q.raw, param.blocks]);
  const criticas = notes.filter((n) => n.severidade === 'critico').length;

  return (
    <section className={`res ${band}`}>
      <div className="res-main">
        <span className={`res rank ${idx === 0 ? 'first' : ''}`}>#{idx + 1}</span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="ncm-code">{rec.ncm}</span>
            <span className={`badge ${band}`}>{Math.round(confidence * 100)}%</span>
            {rec.gen === 1 && <span className="badge grey">residual “Outros”</span>}
            {tx.st && <span className="badge blue">CEST</span>}
            {tx.extarif && <span className="badge blue">NCM-Ex</span>}
            {rec.is === 1 && <span className="badge red">IS 2027</span>}
            {criticas > 0 && <span className="badge red">{criticas} alerta(s) legal(is)</span>}
            {idx > 0 && !forcar && <span className="badge grey">alternativa</span>}
          </div>
          <div className="ncm-desc">{rec.desc.replace(/^[-–\s]+/, '')}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{BAND_TXT[band]}</div>
        </div>
        <div className={`conf ${band}`}>
          <div className="small muted">aderência {Math.round(cand.coverage * 100)}% · frase legal {cand.phrase ? 'sim' : 'não'}</div>
          <div className="bar"><div className="fill" style={{ width: `${Math.round(confidence * 100)}%` }} /></div>
        </div>
      </div>

      <div className="taxgrid">
        <Tax k="IPI (TIPI)" v={rec.ipi_nt ? 'NT' : fmt(tx.ipi)} />
        <Tax k="II (TEC)" v={fmt(tx.ii)} />
        <Tax k="TEC Mercosul" v={fmt(tx.tec)} />
        <Tax k="CEST" v={tx.cest.length ? tx.cest.map((c) => c.code).join(', ') : '—'} wide />
        <Tax k="Ato legal" v={rec.ato || '—'} wide />
        <Tax k="Vigência" v={`${rec.ini || '—'}${rec.fim && rec.fim !== '31/12/9999' ? ` → ${rec.fim}` : ''}`} wide />
      </div>

      <div className="row" style={{ margin: '0 16px 12px', gap: 8 }}>
        <button className="mini" type="button" onClick={onOpen}>
          {aberto ? 'ocultar fundamentação' : 'ver fundamentação, parametrização e atributos'}
        </button>
        <a className="mini" href="#parametrizar" title="abrir a aba de parametrização de ERP"
          onClick={() => { try { sessionStorage.setItem('ncm-abas', 'parametrizar'); } catch { /* ignora */ } }}>
          parametrizar no ERP →
        </a>
      </div>

      {aberto && (
        <div className="foldbody" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Hierarquia legal (RGI 1 → RGI 6)</h3>
          <ul className="path">
            {path.map((p, i) => (
              <li key={p.code}>
                <code>{fmtCode(p.code)}</code>{' '}
                <span className={i === path.length - 1 ? '' : 'muted'}>{labelForLevel(p.code.length)}: {p.desc}</span>
              </li>
            ))}
          </ul>

          <h3>Fundamentação e checagens</h3>
          {notes.map((n) => <Nota key={n.id + n.titulo} n={n} ds={ds} />)}

          <h3>Parametrização sugerida do item</h3>
          <div className="grid g3">
            {param.blocks.map((b) => (
              <div key={b.titulo} className="note" style={{ margin: 0 }}>
                <div className="t">{b.titulo} {b.codigo ? <span className="badge blue">{b.codigo}</span> : null}</div>
                <div className="x">{b.detalhe}</div>
                {b.notas.length > 0 && (
                  <ul className="x" style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                    {b.notas.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                )}
                {b.confirmar && <div className="src">⚠ sugestão — confirmar com o regulamento do estado e o texto legal antes de emitir.</div>}
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            CFOPs compatíveis: {param.cfops.slice(0, 6).map((c) => `${c.c} (${c.a})`).join(' · ')}
          </p>

          <h3>Reforma tributária do consumo — IBS / CBS / IS (LC 214/2025)</h3>
          <ReformaCard r={ref} ano={anoReforma} />

          <h3>Atributos exigidos no Catálogo de Produtos / DUIMP</h3>
          {!frio && <p className="small muted"><span className="spin" /> carregando CEST, atributos e base legal…</p>}
          {checklist.length === 0 ? (
            <p className="small muted">Sem atributos cadastrados para este NCM.</p>
          ) : (
            <>
              <p className="small muted">
                Se o produto for objeto de importação/exportação, estes campos são exigidos pelo CADA.{' '}
                {checklist.filter((c) => c.obrig).length} obrigatório(s).
              </p>
              <div className="grid g3">
                {checklist.slice(0, 9).map((a) => (
                  <div key={a.code} className="note" style={{ margin: 0 }}>
                    <div className="t">{a.nome} {a.obrig ? <span className="badge red">obrigatório</span> : <span className="badge grey">opcional</span>}</div>
                    <div className="x">{a.modalidade} · {a.forma || 'livre'}</div>
                    {a.orientacao && <div className="src">{a.orientacao}</div>}
                    {a.orgaos && <div className="src">Órgão: {a.orgaos}</div>}
                    {a.dominios.length > 0 && (
                      <div className="mini-list">
                        {a.dominios.slice(0, 8).map((d) => <span key={d[0]} className="badge grey mono">{d[0]} {d[1].slice(0, 34)}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>Transparência do cálculo</h3>
          <div className="kv">
            <dt>Termos casados</dt>
            <dd>{cand.matched.length ? cand.matched.map((m) => <span key={m.term} className="badge grey" style={{ marginRight: 4 }}>{m.term} <b className="muted">{m.where}</b></span>) : 'código digitado diretamente'}</dd>
            <dt>Não reconhecidos</dt><dd className="muted">{q.unmatched.length ? q.unmatched.join(', ') : '— todos reconhecidos na tabela'}</dd>
            <dt>Matéria detectada</dt><dd>{q.material || 'não informada'}</dd>
            <dt>Uso detectado</dt><dd>{q.uso || 'não informado'}</dd>
            <dt>Medidas/atributos</dt><dd>{q.medidas.length ? q.medidas.join(', ') : 'nenhum número com unidade'}</dd>
            <dt>Score bruto</dt><dd className="mono">{cand.score.toFixed(2)} · cobertura {(cand.coverage * 100).toFixed(0)}%</dd>
          </div>
        </div>
      )}
    </section>
  );
}

function Tax({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return <div className="tax" style={wide ? { minWidth: 160 } : undefined}><div className="k">{k}</div><div className="v mono">{v}</div></div>;
}

function ReformaCard({ r, ano }: { r: ReformaSugestao; ano: number }) {
  if (!r.temTabela) {
    return (
      <div className="note atencao">
        <div className="t">Tabela cClassTrib não carregada</div>
        <div className="x">{r.falta[0] || 'Rode `npm run build:reforma` (ou o botão da aba Regras) para baixar as tabelas oficiais da reforma e gere o dataset.'}</div>
      </div>
    );
  }
  return (
    <>
      <div className="taxgrid">
        <Tax k={`CBS (União) ${ano}`} v={r.aliquotas?.cbs !== undefined ? `${String(r.aliquotas.cbs).replace('.', ',')}%` : '—'} />
        <Tax k={`IBS UF+Mun ${ano}`} v={r.aliquotas?.ufFaixa ? `${r.aliquotas.ufFaixa} (faixa oficial)` : '—'} />
        <Tax k="Imposto Seletivo (2027)" v={r.is.tributa ? 'SIM — na tabela oficial' : (r.is.adv === null && r.is.are === null ? 'não indicado' : 'não indicado')} />
        {r.is.tributa && <Tax k="Alíquotas do IS" v={[r.is.adv != null ? `${String(r.is.adv).replace('.', ',')}%` : null, r.is.are != null ? `${String(r.is.are).replace('.', ',')} ${r.is.un || 'un'}` : null].filter(Boolean).join(' + ') || 'ver base legal'} />}
      </div>
      <table className="tb" style={{ marginTop: 10 }}>
        <thead><tr><th>CST-IBS/CBS</th><th>cClassTrib</th><th>tratamento</th><th>classificação oficial</th></tr></thead>
        <tbody>
          {r.cbsibs.map((c) => (
            <tr key={c.codigo}>
              <td className="mono">{c.cst} <span className="muted small">{c.cstNome}</span></td>
              <td className="mono"><b>{c.codigo}</b>{c.reducao && <span className="badge blue" style={{ marginLeft: 4 }}>redução</span>}</td>
              <td className="small">{c.tratamento || '—'}</td>
              <td className="small">{c.descricao}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.fundamentos.length > 0 && (
        <details className="fold" style={{ marginTop: 8 }}>
          <summary>Base legal das candidatas ({r.fundamentos.length}) — texto da LC 214/2025</summary>
          <div className="foldbody">
            {r.fundamentos.map((f) => (
              <div key={f.codigo} className="note info" style={{ margin: '0 0 8px' }}>
                <div className="t">{f.codigo} · {f.curto}{f.lbl && f.lbl !== f.curto ? ` — ${f.lbl}` : ''}</div>
                <div className="x">{f.texto}</div>
                <div className="src mono">{f.referencia.slice(0, 260)}</div>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="note atencao" style={{ marginTop: 8 }}>
        <div className="t">O que falta para fechar o código</div>
        <ul className="x" style={{ margin: 0, paddingLeft: 16 }}>
          {r.falta.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
        <div className="src">
          Candidatas derivadas das tabelas oficiais (dados abertos da Calculadora de Tributos do
          Consumo — RFB). O cClassTrib é do <i>contribuinte na operação</i>: confirme antes de emitir.
        </div>
      </div>
    </>
  );
}

function Nota({ n, ds }: { n: RuleNote; ds: Dataset }) {
  return (
    <div className={`note ${n.severidade || 'info'}`}>
      <div className="t">
        <span className={`badge ${n.kind === 'Nota Legal' ? 'red' : n.kind === 'Armadilha' ? 'media' : 'grey'}`} style={{ marginRight: 6 }}>{n.kind}</span>
        {n.id} — {n.titulo}
      </div>
      <div className="x">{n.texto}</div>
      {n.ncms && n.ncms.length > 0 && (
        <div className="mini-list">
          {n.ncms.map((c) => <span key={c} className="badge grey mono" title={ds.byD8.get(c.replace(/\D/g, ''))?.desc || ''}>{c}</span>)}
        </div>
      )}
      {n.fonte && <div className="src">Origem: {n.fonte}</div>}
    </div>
  );
}

function fmtCode(c: string) {
  if (c.length === 4) return `${c.slice(0, 4)}`;
  if (c.length === 6) return `${c.slice(0, 4)}.${c.slice(4)}`;
  if (c.length === 8) return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;
  return c;
}