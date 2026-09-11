'use client';

import { useEffect, useState } from 'react';
import Classificar from '@/components/Classificar';
import Lote from '@/components/Lote';
import Consultar from '@/components/Consultar';
import Regras from '@/components/Regras';
import Parametrizar from '@/components/Parametrizar';
import ReformaTab from '@/components/Reforma';

const TABS = [
  { id: 'classificar', nome: '1 · Classificar produto', hint: 'descrição → candidatos de NCM com RGI, tributos e parametrização' },
  { id: 'lote', nome: '2 · Lote (CSV)', hint: 'centenas de itens de uma vez, com triagem por confiança' },
  { id: 'consultar', nome: '3 · Consultar NCM', hint: 'busca na tabela oficial por código, palavra ou capítulo' },
  { id: 'parametrizar', nome: '4 · Parametrização de ERP', hint: 'cadastro + cenário → códigos e maqueta de XML da NF-e/NFS-e' },
  { id: 'reforma', nome: '5 · Reforma (IBS/CBS/IS)', hint: 'tabela cClassTrib, CST-IBS/CBS, IS e alíquotas da transição' },
  { id: 'regras', nome: '6 · Regras e fontes', hint: 'RGI, Notas Legais, armadilhas, vigência e atualização' },
] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('classificar');
  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem('ncm-abas');
      if (salvo && TABS.some((t) => t.id === salvo)) { setTab(salvo as typeof tab); sessionStorage.removeItem('ncm-abas'); }
    } catch { /* sem storage */ }
  }, []);
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <h1>Agente de Classificação Fiscal por NCM</h1>
            <span className="tag">Tabela NCM vigente · Portal Único Siscomex</span>
            <span className="tag">10.515 códigos validados</span>
          </div>
          <p className="sub">
            Classificação de mercadorias pela nomenclatura oficial com a cadeia de decisão visível: capítulo → posição
            → subposição → item/subitem, RGI aplicada, Notas Legais que podem deslocar o produto de capítulo, IPI/II,
            CEST e sugestão de CST/CSOSN, CFOP e atributos do Catálogo de Produtos — mais as tabelas da
            reforma do consumo (CST-IBS/CBS, <b>cClassTrib</b> e Imposto Seletivo) e a <b>parametrização de ERP</b>
            com a maqueta de XML do item.
          </p>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} title={t.hint}
                onClick={() => setTab(t.id)}>{t.nome}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap" id="parametrizar">
        <div className="disclaimer">
          <span style={{ fontSize: 18 }}>⚖️</span>
          <div>
            <b>Isto é apoio à decisão, não parecer fiscal.</b> Classificação de mercadoria é ato complexo e exige
            conferência do texto legal (Notas de Seção/Capítulo, Notas Explicativas do Sistema Harmonizado, Resoluções
            Gecex, convênios CONFAZ) e, quando houver dúvida relevante, consulta formal à RFB ou solução de consulta.
            Alíquotas de PIS/COFINS, ICMS e regimes especiais <b>não</b> são declaradas aqui como definitivas.
          </div>
        </div>

        {tab === 'classificar' && <Classificar />}
        {tab === 'lote' && <Lote />}
        {tab === 'consultar' && <Consultar />}
        {tab === 'parametrizar' && <Parametrizar />}
        {tab === 'reforma' && <ReformaTab />}
        {tab === 'regras' && <Regras />}

        <footer className="small muted" style={{ marginTop: 26, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          Motor local, sem envio de dados a terceiros: a descrição que você digita é processada no seu navegador
          contra o dataset estático gerado das fontes oficiais. Pipeline: <code className="mono">scripts/baixar_fontes.py</code>{' '}
          → <code className="mono">scripts/pipeline.py</code> → <code className="mono">public/data/</code>.
        </footer>
      </main>
    </>
  );
}
