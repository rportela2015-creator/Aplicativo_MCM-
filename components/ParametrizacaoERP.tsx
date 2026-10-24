'use client';

import React from 'react';

export default function ParametrizacaoERP({ data }: { data: any }) {
  if (!data || !data.itens || data.itens.length === 0) return null;

  const handleExportCSV = () => {
    if (!data.itens) return;

    // Create CSV content
    const headers = [
      'cProd', 'xProd', 'ncm', 'cest', 'cfopEntrada', 'cstIcmsEntrada', 'aliqIcms',
      'cstPisCofinsEntrada', 'aliqPis', 'aliqCofins', 'permiteCredito',
      'cClassTrib', 'aliqIbsTransitorio', 'aliqCbsTransitorio', 'regimeEspecial'
    ];

    const rows = data.itens.map((item: any) => {
      return headers.map(header => {
        const value = item[header] !== undefined && item[header] !== null ? String(item[header]) : '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parametrizacao_erp.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCopy = (item: any) => {
    const text = JSON.stringify(item, null, 2);
    navigator.clipboard.writeText(text);
    alert('Parâmetros copiados!');
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Parametrização de ERP</h3>
        <button type="button" onClick={handleExportCSV} className="chip" style={{ background: '#333', color: 'white' }}>
          Exportar CSV para ERP
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {data.itens.map((item: any, idx: number) => (
          <div key={idx} className="card" style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <strong>{item.cProd || 'N/A'} - {item.xProd || 'Produto não informado'}</strong>
                <div className="small">NCM: {item.ncm} | CEST: {item.cest}</div>
              </div>
              <button type="button" onClick={() => handleCopy(item)} className="chip">Copiar Parâmetros</button>
            </div>

            <div className="taxgrid" style={{ marginBottom: 16 }}>
              {/* Bloco ICMS/ST */}
              <div className="tax" style={{ borderLeft: '4px solid #4A90E2', paddingLeft: 8 }}>
                <div className="k">Bloco ICMS/ST</div>
                <div className="v">CFOP: {item.cfopEntrada}</div>
                <div className="v">CST: {item.cstIcmsEntrada}</div>
                <div className="v">Alíquota: {item.aliqIcms}</div>
                <div className="v">Crédito: {item.permiteCredito ? 'Sim' : 'Não'}</div>
              </div>

              {/* Bloco PIS/COFINS */}
              <div className="tax" style={{ borderLeft: '4px solid #F5A623', paddingLeft: 8 }}>
                <div className="k">Bloco PIS/COFINS</div>
                <div className="v">CST: {item.cstPisCofinsEntrada}</div>
                <div className="v">Alíquota PIS: {item.aliqPis}</div>
                <div className="v">Alíquota COFINS: {item.aliqCofins}</div>
              </div>

              {/* Bloco Reforma Tributária */}
              <div className="tax" style={{ borderLeft: '4px solid #7ED321', paddingLeft: 8 }}>
                <div className="k">Bloco Reforma Tributária</div>
                <div className="v">cClassTrib: {item.cClassTrib}</div>
                <div className="v">Alíquota IBS: {item.aliqIbsTransitorio}</div>
                <div className="v">Alíquota CBS: {item.aliqCbsTransitorio}</div>
                <div className="v">Regime: {item.regimeEspecial}</div>
              </div>
            </div>

            <div className="note info" style={{ marginTop: 8 }}>
              <strong>Instrução:</strong> {item.instrucaoCadastro}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
