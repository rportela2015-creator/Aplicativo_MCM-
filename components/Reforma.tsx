'use client';

import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import { ClassTrib, Reforma as ReformaData, loadReforma } from '@/lib/data';
import { aliquotasReforma, buscarClassificacoes } from '@/lib/reforma';

const fmt = (n?: number | null) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}%`);

export default function ReformaTab() {
  const [rf, setRf] = useState<ReformaData | null | undefined>(undefined);
  const [txt, setTxt] = useState('');
  const [cst, setCst] = useState('');
  const [soReducao, setSoReducao] = useState(false);
  const [detalhe, setDetalhe] = useState('');
  const [aba, setAba] = useState<'cbsibs' | 'is'>('cbsibs');

  useEffect(() => { loadReforma().then(setRf).catch(() => setRf(null)); }, []);

  const lista: ClassTrib[] = useMemo(() => {
    if (!rf || !rf.disponivel) return [];
    return aba === 'cbsibs' ? buscarClassificacoes(rf, txt, cst, soReducao) : (rf.is_classificacoes || []);
  }, [rf, aba, txt, cst, soReducao]);

  if (rf === undefined) return <div className="card"><span className="spin" /> carregando tabelas da reforma…</div>;
  if (!rf || !rf.disponivel) {
    return (
      <div className="card">
        <h2>Tabelas da reforma não carregadas</h2>
        <p className="hint">
          O dataset foi gerado sem as tabelas oficiais de IBS/CBS/IS. Gere-as e recompile o dataset:
        </p>
        <pre className="x mono" style={{ whiteSpace: 'pre-wrap' }}>npm run build:reforma   # baixa as tabelas oficiais e publica public/data/reforma.json</pre>
      </div>
    );
  }
  const anos = aliquotasReforma(rf);

  return (
    <>
      <div className="card">
        <h2>Reforma Tributária do Consumo — IBS, CBS e Imposto Seletivo</h2>
        <p className="hint">
          Tabelas oficiais carregadas sem recorte: <b>{rf.classificacoes.length}</b> códigos{' '}
          <span className="mono">cClassTrib</span> em <b>{rf.cst.length}</b> situações (CST-IBS/CBS),{' '}
          <b>{(rf.is_classificacoes || []).length}</b> códigos do Imposto Seletivo e{' '}
          <b>{Object.keys(rf.fundamentacoes || {}).length}</b> fundamentações da LC 214/2025.
          Fonte: {rf.fonte} · coleta {rf.coletado_em ? new Date(rf.coletado_em).toLocaleString('pt-BR') : '—'}.
        </p>
        {!!rf.falhas && Object.keys(rf.falhas).length > 0 && (
          <div className="note critico">
            <div className="t">Parte das tabelas veio do cache local</div>
            <div className="x">{Object.entries(rf.falhas).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
          </div>
        )}
        <p className="small muted">
          O <b>NCM não define o cClassTrib</b>: o código codifica a <i>situação da operação</i>{' '}
          (onerosidade, destino, benefício, suspensão, estorno). Use esta aba para escolher o par
          CST/cClassTrib e o bloco “Reforma” do resultado para ver as candidatas do seu cenário.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Alíquotas de referência e transição</h3>
        <div className="scroll">
          <table className="tb">
            <thead><tr><th>ano</th><th className="num">CBS (União)</th><th className="num">IBS — faixa das 27 UFs</th></tr></thead>
            <tbody>
              {anos.map((a) => (
                <tr key={a.ano}>
                  <td className="mono">{a.ano}</td>
                  <td className="num">{fmt(a.cbs)}</td>
                  <td className="num">{a.uf && a.uf.length ? (a.uf[0] === a.uf[a.uf.length - 1] ? fmt(a.uf[0]) : `${fmt(a.uf[0])} – ${fmt(a.uf[a.uf.length - 1])}`) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Percentual do produto da arrecadação destinado aos entes durante a transição — CBS:{' '}
          {(rf.transicao?.cbs_destino || []).map((t) => `${new Date(t.inicioVigencia).getFullYear()}: ${t.valor}%`).join(' · ')}.{' '}
          IBS: {(rf.transicao?.ibs_destino || []).map((t) => `${new Date(t.inicioVigencia).getFullYear()}: ${t.valor}%`).join(' · ')}.
          Em 2026 a CBS e o IBS são cobrados em alíquotas-teste e <i>não</i> substituem PIS/COFINS, IPI, ICMS e ISS.
        </p>
        {rf.is_por_ncm ? (
          <p className="small muted">
            Imposto Seletivo por NCM: {rf.is_consultados?.toLocaleString('pt-BR')} de {rf.is_total?.toLocaleString('pt-BR')}{' '}
            NCMs consultados na tabela oficial (base {rf.is_parcial ? 'parcial — em atualização' : 'completa'}) com data{' '}
            {rf.is_data}. Os NCMs marcados aparecem com o selo <span className="badge red">IS 2027</span> no resultado.
          </p>
        ) : (
          <p className="small muted">Sem a tabela de IS por NCM — rode <span className="mono">python3 scripts/baixar_is.py</span>.</p>
        )}
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={`tab ${aba === 'cbsibs' ? 'on' : ''}`} type="button" onClick={() => setAba('cbsibs')}>
            cClassTrib do IBS/CBS ({rf.classificacoes.length})
          </button>
          <button className={`tab ${aba === 'is' ? 'on' : ''}`} type="button" onClick={() => setAba('is')}>
            cClassTrib do Imposto Seletivo ({(rf.is_classificacoes || []).length})
          </button>
        </div>

        {aba === 'cbsibs' && (
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label className="field">
              <span>busca (código, palavra)</span>
              <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="ex.: cesta básica, bonificação, 410001" />
            </label>
            <label className="field">
              <span>CST-IBS/CBS</span>
              <select value={cst} onChange={(e) => setCst(e.target.value)}>
                <option value="">todos</option>
                {rf.cst.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={soReducao} onChange={(e) => setSoReducao(e.target.checked)} /> só com redução de alíquota
            </label>
            <span className="small muted">{lista.length} código(s)</span>
          </div>
        )}

        <div className="scroll" style={{ marginTop: 10 }}>
          <table className="tb">
            <thead>
              <tr><th>cClassTrib</th><th>CST</th><th>tipo de alíquota</th><th>tratamento</th><th>marcações</th><th>DFe</th></tr>
            </thead>
            <tbody>
              {(aba === 'cbsibs' ? lista : (rf.is_classificacoes || [])).slice(0, 400).map((c) => (
                <tr key={c.c} onClick={() => setDetalhe(detalhe === c.c ? '' : c.c)} style={{ cursor: 'pointer' }}>
                  <td className="mono"><b>{c.c}</b></td>
                  <td className="mono">{c.cst} <span className="small muted">{c.cn}</span></td>
                  <td className="small">{c.ta || '—'}</td>
                  <td className="small">{c.tt || '—'}</td>
                  <td className="small">
                    {c.red && <span className="badge blue">redução</span>}{' '}
                    {c.des && <span className="badge grey">exige gDeson</span>}{' '}
                    {c.cpF && <span className="badge grey">créd. presumido</span>}{' '}
                    {c.rb && <span className="badge grey">vedado c/ susp.</span>}
                  </td>
                  <td className="mono small muted">{(c.df || []).join(' ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Clique numa linha para ver a descrição completa e a base legal.</p>

        {detalhe && (() => {
          const c = (aba === 'cbsibs' ? rf.classificacoes : rf.is_classificacoes || []).find((x) => x.c === detalhe);
          const f = rf.fundamentacoes?.[detalhe];
          if (!c) return null;
          return (
            <div className="note info" style={{ marginTop: 10 }}>
              <div className="t">{c.c} — CST {c.cst} · {c.cn}</div>
              <div className="x">{c.d}</div>
              {f && (
                <>
                  <div className="src"><b>{f.tc}{f.lbl ? ` · ${f.lbl}` : ''}</b> — {f.t}</div>
                  <details className="fold" style={{ marginTop: 6 }}>
                    <summary>íntegra da referência normativa</summary>
                    <div className="foldbody"><div className="x mono" style={{ whiteSpace: 'pre-wrap' }}>{f.ref}</div></div>
                  </details>
                </>
              )}
              {c.df && c.df.length > 0 && <div className="src">Documentos: {c.df.join(', ')}</div>}
            </div>
          );
        })()}
      </div>
    </>
  );
}
