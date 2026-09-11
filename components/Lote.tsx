'use client';

import { useMemo, useState } from 'react';
import { Dataset, Reforma, loadDataset, loadReforma } from '@/lib/data';
import { buildNotes, classify } from '@/lib/engine';
import { parameterize } from '@/lib/parametrizacao';

import { sugerirReforma } from '@/lib/reforma';
import { useEffect } from 'react';

type Linha = {
  id: number; original: string; ncm: string; descricao: string; band: string; conf: number;
  ipi: string; ii: string; cest: string; alerta: string; alternativas: string; status: string;
  cclasstrib: string; is2027: string; cfop: string;
};

const PARAM_PADRAO = { operacao: 'interna', regime: 'presumido', finalidade: 'comercializacao' } as const;

const CAMPOS = ['descricao', 'produto', 'descrição', 'desc', 'nome', 'item', 'material', 'description', 'descrição'];

/** CSV mínimo: aspas duplas RFC-4180, separador ; ou , ou tab */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const sep = text.slice(0, 4000).split('\n').slice(0, 3).join('\n');
  const delim = (sep.match(/\t/g) || []).length > (sep.match(/;/g) || []).length ? '\t'
    : (sep.match(/;/g) || []).length >= (sep.match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
      continue;
    }
    if (c === '"') { q = true; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (c === '\r') continue;
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;

export default function Lote() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [linhas, setLinhas] = useState<string[]>([]);
  const [nome, setNome] = useState('');
  const [rodando, setRodando] = useState(false);
  const [prog, setProg] = useState(0);
  const [saida, setSaida] = useState<Linha[]>([]);
  const [paste, setPaste] = useState('');
  const [reforma, setReforma] = useState<Reforma | null>(null);

  useEffect(() => { loadDataset().then(async (d) => { setDs(d); await d.pronto; }).catch(() => setDs(null)); }, []);
  useEffect(() => { loadReforma().then(setReforma).catch(() => setReforma(null)); }, []);

  const aceitar = (txt: string, arquivo = '') => {
    const rows = parseCsv(txt);
    if (!rows.length) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    let idx = head.findIndex((h) => CAMPOS.some((c) => h.includes(c)));
    let corpo = rows.slice(1);
    if (idx < 0) { idx = 0; corpo = rows; }      // sem cabeçalho: primeira coluna
    const extrair = (r: string[]) => (r[idx] || r.find((x) => x.trim().length > 2) || '').trim();
    setLinhas(corpo.map(extrair).filter(Boolean));
    setNome(arquivo);
    setSaida([]);
  };

  const rodar = async () => {
    if (!ds || !linhas.length) return;
    setRodando(true); setProg(0);
    const out: Linha[] = [];
    const passo = Math.max(1, Math.floor(linhas.length / 60));
    for (let i = 0; i < linhas.length; i++) {
      const r = classify(linhas[i], ds, { top: 6 });
      const c = r.candidates[0];
      if (!c) {
        out.push({ id: i + 1, original: linhas[i], ncm: '', descricao: '', band: 'baixa', conf: 0,
          ipi: '', ii: '', cest: '', alerta: 'nenhum código da Tabela NCM descreve o texto', alternativas: '',
          cclasstrib: '', is2027: '', cfop: '', status: 'REVISAR — sem candidato' });
      } else {
        const n = buildNotes(c, r.query, ds, r.candidates);
        const alertas = n.notes.filter((x) => x.severidade === 'critico').map((x) => x.id);
        const prm = parameterize(c.rec, ds, PARAM_PADRAO);
        const ref = sugerirReforma(reforma, c.rec, PARAM_PADRAO, 2026, linhas[i],
          { cst: (/CST (\d\d)/.exec(prm.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '') || [])[1] });
        out.push({
          id: i + 1, original: linhas[i], ncm: c.rec.ncm, descricao: c.rec.desc.replace(/^[-–\s]+/, ''),
          band: n.band, conf: Math.round(n.confidence * 100),
          ipi: c.rec.ipi_nt ? 'NT' : c.rec.ipi === null ? '' : `${c.rec.ipi}`,
          ii: c.rec.ii === null ? '' : `${c.rec.ii}`,
          cest: (c.rec.cest || []).join(' '),
          alerta: [...new Set([...alertas, ...(n.notes.filter((x) => x.id.startsWith('dado-ausente')).map(() => 'dado técnico ausente'))])].join(' | '),
          alternativas: r.candidates.slice(1, 4).map((x) => x.rec.ncm).join(' '),
          cclasstrib: ref.cbsibs.map((x) => `${x.cst}/${x.codigo}`).join(' '),
          cfop: parameterize(c.rec, ds, PARAM_PADRAO as any).cfops[0]?.c || '',
          is2027: ref.is.tributa ? 'SIM' : (c.rec.is === 0 ? 'nao' : ''),
          status: n.band === 'alta' ? 'APROVAR (checagem humana simples)'
            : n.band === 'media' ? 'CONFERIR DADOS' : 'NÃO USAR — falta informação',
        });
      }
      if (i % passo === 0) { setProg(Math.round((i / linhas.length) * 100)); await new Promise((r2) => setTimeout(r2, 0)); }
    }
    setProg(100); setSaida(out); setRodando(false);
  };

  const resumo = useMemo(() => {
    if (!saida.length) return null;
    const c = { alta: 0, media: 0, baixa: 0 };
    saida.forEach((l) => { c[l.band as keyof typeof c]++; });
    return { ...c, total: saida.length,
      comCest: saida.filter((l) => l.cest).length, comAlerta: saida.filter((l) => l.alerta).length };
  }, [saida]);

  const csv = () => [
    'id;descricao_original;ncm_sugerida;descricao_oficial;confianca_pct;banda;ipi_pct;ii_pct;cest;'
    + 'cclasstrib_candidatos;is_2027;cfop;alertas;alternativas;status',
    ...saida.map((l) => [l.id, esc(l.original), l.ncm, esc(l.descricao), l.conf, l.band, l.ipi, l.ii,
      l.cest, esc(l.cclasstrib), l.is2027, l.cfop, esc(l.alerta), l.alternativas, esc(l.status)].join(';')),
  ].join('\n');

  return (
    <div className="card">
      <h2>Classificação em lote</h2>
      <p className="hint">
        Solte um CSV/TSV (ou cole as linhas). O agente usa a posição de <b>maior aderência</b> e marca a necessidade de
        revisão — ele não grava nada em sistema nenhum. Para cadastro em massa, revise as linhas &quot;CONFERIR/NÃO USAR&quot;.
      </p>

      <div className="row" style={{ alignItems: 'stretch' }}>
        <label className="btn ghost" style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer', border: '1px dashed #a9c1e6' }}>
          Selecionar arquivo .csv / .tsv / .txt
          <input type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              aceitar(await f.text(), f.name);
            }} />
        </label>
        <button className="btn" type="button" onClick={rodar} disabled={!linhas.length || rodando || !ds}>
          {rodando ? <><span className="spin" /> classificando {prog}%</> : `Classificar ${linhas.length} linha(s)`}
        </button>
        {saida.length > 0 && (
          <a className="btn ghost" style={{ textDecoration: 'none' }}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + csv())}`}
            download={`ncm-classificado${nome ? '-' + nome.replace(/\..*$/, '') : ''}.csv`}>
            ↓ baixar CSV com {saida.length} linhas
          </a>
        )}
        {linhas.length > 0 && <button className="mini" type="button" onClick={() => { setLinhas([]); setSaida([]); }}>limpar</button>}
      </div>

      <textarea
        style={{ marginTop: 12 }}
        placeholder={'ou cole aqui (uma descrição por linha, ou CSV com coluna "descricao"):\nNotebook 1,4 kg tela 14 pol\nCadeira estofada giratória\nCerveja lata 350 ml'}
        value={paste} onChange={(e) => setPaste(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="mini" type="button" onClick={() => aceitar(paste, 'colado')} disabled={!paste.trim()}>usar texto colado ({paste.split(/\n/).filter(Boolean).length} linhas)</button>
      </div>

      {resumo && (
        <div className="row" style={{ marginTop: 14 }}>
          <span className="badge alta">{resumo.alta} alta</span>
          <span className="badge media">{resumo.media} média</span>
          <span className="badge baixa">{resumo.baixa} baixa</span>
          <span className="badge grey">{resumo.comCest} com CEST</span>
          <span className="badge grey">{resumo.comAlerta} com alerta legal</span>
        </div>
      )}

      {saida.length > 0 && (
        <div className="scroll" style={{ marginTop: 12 }}>
          <table className="tb">
            <thead><tr>
              <th>#</th><th>descrição original</th><th>NCM</th><th>conf.</th><th>IPI</th><th>II</th>
              <th>CEST</th><th>alertas</th><th>alternativas</th><th>status</th>
            </tr></thead>
            <tbody>
              {saida.map((l) => (
                <tr key={l.id}>
                  <td className="num">{l.id}</td>
                  <td style={{ maxWidth: 260 }}>{l.original}</td>
                  <td className="mono">{l.ncm || '—'}</td>
                  <td><span className={`badge ${l.band}`}>{l.conf}%</span></td>
                  <td className="num">{l.ipi || '—'}</td>
                  <td className="num">{l.ii || '—'}</td>
                  <td className="mono">{l.cest || '—'}</td>
                  <td className="small muted">{l.alerta || '—'}</td>
                  <td className="mono small">{l.alternativas || '—'}</td>
                  <td className="small">{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
