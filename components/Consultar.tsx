'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dataset, Record8, describePath, labelForLevel, loadDataset } from '@/lib/data';
import { taxes } from '@/lib/engine';
import { catalogChecklist } from '@/lib/parametrizacao';

const CAP: Record<string, string> = {};

export default function Consultar() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [q, setQ] = useState('');
  const [cap, setCap] = useState('');
  const [sóCest, setSoCest] = useState(false);
  const [off, setOff] = useState(0);
  const [sel, setSel] = useState<Record8 | null>(null);
  const TAM = 40;

  useEffect(() => { loadDataset().then(async (d) => { setDs(d); await d.pronto; }).catch(() => setDs(null)); }, []);

  const lista = useMemo(() => {
    if (!ds) return [];
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const needle = norm(q.trim());
    const díg = q.replace(/\D/g, '');
    return ds.records.filter((r) => {
      if (cap && !r.d8.startsWith(cap)) return false;
      if (sóCest && (r.cest?.length || 0) === 0) return false;
      if (díg.length >= 2) return r.d8.startsWith(díg);
      if (!needle) return false;
      return norm(r.desc).includes(needle) || r.path.some((p) => norm(ds.hier[p] || '').includes(needle));
    });
  }, [ds, q, cap, sóCest]);

  const capitulos = useMemo(() => {
    if (!ds) return [];
    if (Object.keys(CAP).length) return Object.entries(CAP).map(([k, v]) => [k, v] as [string, string]);
    for (const r of ds.records) if (!CAP[r.d8.slice(0, 2)]) CAP[r.d8.slice(0, 2)] = (ds.hier[r.d8.slice(0, 2)] || r.d8.slice(0, 2));
    return Object.entries(CAP).sort((a, b) => a[0].localeCompare(b[0]));
  }, [ds]);

  if (!ds) return <div className="card"><span className="spin" /> carregando…</div>;

  const buscaAtiva = q.trim().length > 0 || cap || sóCest;

  return (
    <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
      <div className="card" style={{ marginBottom: 0 }}>
        <h2>Consultar a Tabela NCM vigente</h2>
        <p className="hint">
          {ds.records.length.toLocaleString('pt-BR')} códigos de 8 dígitos, cada um resolvido contra o texto oficial da
          Tabela NCM (Siscomex). Use dígitos para buscar por código (ex.: <code className="mono">8471</code>) ou
          palavras para buscar na hierarquia completa.
        </p>
        <div className="grid g3">
          <div>
            <label className="f" htmlFor="cq">Código ou palavra</label>
            <input id="cq" type="text" value={q} onChange={(e) => { setQ(e.target.value); setOff(0); setSel(null); }}
              placeholder="ex.: 8471 · cerveja · assento" />
          </div>
          <div>
            <label className="f" htmlFor="cc">Capítulo</label>
            <select id="cc" value={cap} onChange={(e) => { setCap(e.target.value); setOff(0); }}>
              <option value="">todos</option>
              {capitulos.map(([k, v]) => <option key={k} value={k}>{k} — {v.slice(0, 58)}</option>)}
            </select>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <label className="row small" style={{ margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={sóCest} onChange={(e) => { setSoCest(e.target.checked); setOff(0); }} />
              apenas com CEST (substituição tributária) · {lista.length.toLocaleString('pt-BR')} resultado(s)
            </label>
          </div>
        </div>

        {!buscaAtiva ? (
          <p className="muted" style={{ marginTop: 18 }}>Digite algo para listar. Sugestões: <button className="mini" type="button" onClick={() => setQ('8517')}>8517</button> <button className="mini" type="button" onClick={() => setQ('assentos')}>assentos</button> <button className="mini" type="button" onClick={() => setQ('cerveja')}>cerveja</button></p>
        ) : (
          <div className="scroll" style={{ marginTop: 12 }}>
            <table className="tb">
              <thead><tr><th>NCM</th><th>descrição oficial</th><th>IPI</th><th>II</th><th>CEST</th><th>nível</th></tr></thead>
              <tbody>
                {lista.slice(off, off + TAM).map((r) => (
                  <tr key={r.d8} style={{ cursor: 'pointer', background: sel?.d8 === r.d8 ? '#eef4ff' : undefined }}
                    onClick={() => setSel(r)}>
                    <td className="mono">{r.ncm}</td>
                    <td>{r.desc.replace(/^[-–\s]+/, '').slice(0, 190)}</td>
                    <td className="num">{r.ipi_nt ? 'NT' : r.ipi ?? '—'}</td>
                    <td className="num">{r.ii ?? '—'}</td>
                    <td className="mono small">{r.cest?.[0] || '—'}</td>
                    <td className="small muted">{r.lvl}{r.gen ? ' · residual' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista.length > TAM && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="mini" type="button" onClick={() => setOff(Math.max(0, off - TAM))}>← anterior</button>
            <span className="small muted">{off + 1}–{Math.min(lista.length, off + TAM)} de {lista.length.toLocaleString('pt-BR')}</span>
            <button className="mini" type="button" onClick={() => setOff(Math.min(lista.length - 1, off + TAM))}>próximo →</button>
          </div>
        )}
      </div>

      {sel && (
        <div className="card" style={{ marginBottom: 0, position: 'sticky', top: 16, alignSelf: 'start', maxHeight: '88vh', overflow: 'auto' }}>
          <div className="row">
            <span className="ncm-code">{sel.ncm}</span>
            <span className="spacer" />
            <button className="mini" type="button" onClick={() => setSel(null)}>fechar</button>
          </div>
          <p style={{ marginTop: 6 }}>{sel.desc.replace(/^[-–\s]+/, '')}</p>
          <h3>Hierarquia</h3>
          <ul className="path">
            {describePath(ds, sel).map((p, i) => (
              <li key={p.code}><code>{p.code}</code> <span className={i ? 'muted' : ''}>{labelForLevel(p.code.length)}: {p.desc}</span></li>
            ))}
          </ul>
          <h3>Tributação</h3>
          <dl className="kv">
            {(() => { const t = taxes(sel, ds); return (<>
              <dt>IPI (TIPI)</dt><dd>{t.ipiNt ? 'Não tributado (NT)' : t.ipi === null ? 'sem registro' : `${t.ipi}%`}</dd>
              <dt>II aplicado</dt><dd>{t.ii === null ? '—' : `${t.ii}%`}</dd>
              <dt>TEC Mercosul</dt><dd>{t.tec === null ? '—' : `${t.tec}%`}</dd>
              <dt>Marcador</dt><dd>{t.bitbk || '—'}{t.extarif ? ' · há NCM-Ex (Ex-tarifário) para a posição' : ''}</dd>
              <dt>Exceção nacional</dt><dd className="small">{t.excecao || '—'}</dd>
              <dt>CEST</dt><dd>{t.cest.length ? t.cest.map((c) => `${c.code}${c.d ? ` — ${c.d.slice(0, 90)}` : ''}`).join(' / ') : 'não listado'}</dd>
              <dt>Segmento ST</dt><dd className="small">{t.cest[0]?.s || '—'}</dd>
              <dt>Ato</dt><dd className="small">{sel.ato || '—'}</dd>
              <dt>Vigência</dt><dd className="small">{sel.ini || '—'} → {sel.fim || '—'}</dd>
            </>); })()}
          </dl>
          {catalogChecklist(sel, ds).length > 0 && (<>
            <h3>Atributos do Catálogo</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {catalogChecklist(sel, ds).slice(0, 12).map((a) => (
                <li key={a.code}><span className="mono">{a.code}</span> {a.nome} {a.obrig ? <span className="badge red">obrig.</span> : null}</li>
              ))}
            </ul>
          </>)}
        </div>
      )}
    </div>
  );
}
