'use client';

import { useState } from 'react';

export default function AuditoriaEntrada() {
  const [file, setFile] = useState<File | null>(null);
  const [regime, setRegime] = useState('Simples Nacional');
  const [finalidade, setFinalidade] = useState('Revenda/Comercialização');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/auditoria-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error(`Erro HTTP ${res.status} ao gerar PDF.`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'auditoria_entrada.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setPdfError(err.message || 'Falha ao baixar o PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('Selecione um arquivo XML ou PDF.');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('regime', regime);
    formData.append('finalidade', finalidade);

    try {
      const res = await fetch('/api/auditoria-entrada', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Falha ao processar o documento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Auditoria de Entrada (OmniRoute)</h2>
      <p className="hint">
        Faça o upload da nota fiscal para análise com IA.
      </p>

      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Arquivo da Nota Fiscal (.xml, .pdf)</span>
          <input
            type="file"
            accept=".xml,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>

        <label className="field">
          <span>Regime da Empresa Adquirente</span>
          <select value={regime} onChange={(e) => setRegime(e.target.value)}>
            <option value="Simples Nacional">Simples Nacional</option>
            <option value="Regime Regular">Regime Regular</option>
          </select>
        </label>

        <label className="field">
          <span>Finalidade da Aquisição</span>
          <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
            <option value="Revenda/Comercialização">Revenda/Comercialização</option>
            <option value="Industrialização">Industrialização</option>
            <option value="Uso/Consumo">Uso/Consumo</option>
            <option value="Ativo Imobilizado">Ativo Imobilizado</option>
          </select>
        </label>

        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={loading || !file}>
            Auditar Documento via OmniRoute
          </button>
        </div>
      </form>

      {loading && <div style={{ marginTop: 20 }}>Analisando documento via IA...</div>}

      {error && (
        <div className="note error" style={{ marginTop: 20 }}>
          <div className="t">Erro na auditoria</div>
          <div className="x">{error}</div>
        </div>
      )}

      {data && (
        <div style={{ marginTop: 24 }}>
          <h3>Resultados da Auditoria</h3>

          <div className="taxgrid" style={{ marginBottom: 16 }}>
            <div className="tax">
              <div className="k">CFOP de Entrada Sugerido</div>
              <div className="v mono">{data.cfopEntradaSugerido || 'N/A'}</div>
            </div>
            <div className="tax">
              <div className="k">Direito a Crédito</div>
              <div className="v">
                {data.direitoCredito ? (
                  <span className="badge blue">Sim</span>
                ) : (
                  <span className="badge media">Não</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: 'var(--brand)', color: 'white' }}
            >
              {pdfLoading ? 'Gerando PDF...' : 'Baixar Relatório em PDF'}
            </button>
            {pdfError && <div className="note error" style={{ marginTop: 8 }}>{pdfError}</div>}
          </div>

          {(data.itens && data.itens.length > 0) ? (
            <table className="tb" style={{ marginTop: 24 }}>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>NCM</th>
                  <th>cClassTrib Sugerido</th>
                  <th>Parecer / Alerta da Reforma</th>
                </tr>
              </thead>
              <tbody>
                {data.itens.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td>{item.produto || item.descricao || '—'}</td>
                    <td className="mono">{item.ncm || '—'}</td>
                    <td className="mono">{item.cClassTrib || '—'}</td>
                    <td className="small">{item.parecer || item.alertaReforma || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="note info">Nenhum item retornado.</div>
          )}
        </div>
      )}
    </div>
  );
}
