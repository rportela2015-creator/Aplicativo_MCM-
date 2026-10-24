import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para o relatório.' }, { status: 400 });
    }

    const { format } = data; // 'html' or 'txt'

    if (format === 'html') {
      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; line-height: 1.6; }
    h1 { text-align: center; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    .header-info { text-align: center; margin-bottom: 30px; font-size: 0.9em; color: #7f8c8d; }
    .section { margin-bottom: 25px; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .parecer-tecnico { background-color: #f8f9fa; border-left: 5px solid #3498db; }
    .parecer-conformidade { background-color: #f0f7f4; border-left: 5px solid #2ecc71; }
    h2 { color: #2980b9; margin-top: 0; }
    .item-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; margin-bottom: 20px; background-color: #fff; }
    .item-header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
    .item-title { font-weight: bold; font-size: 1.1em; color: #2c3e50; }
    .item-ncm { font-size: 0.9em; color: #7f8c8d; }
    .grid-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
    .tax-block { padding: 10px; border-radius: 4px; background-color: #f9f9f9; }
    .tax-block.icms { border-left: 4px solid #4A90E2; }
    .tax-block.pis-cofins { border-left: 4px solid #F5A623; }
    .tax-block.reforma { border-left: 4px solid #7ED321; }
    .tax-title { font-weight: bold; margin-bottom: 8px; font-size: 0.95em; }
    .tax-row { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 4px; }
    .tax-label { color: #555; }
    .tax-value { font-weight: 500; }
    .instruction { margin-top: 15px; padding: 10px; background-color: #e8f4f8; border-radius: 4px; font-style: italic; font-size: 0.9em; border-left: 4px solid #3498db; }
  </style>
</head>
<body>
  <h1>Portela Contabilidade - Laudo de Auditoria Fiscal</h1>
  <div class="header-info">Data da geração: ${new Date().toLocaleString('pt-BR')}</div>

  <div class="section parecer-tecnico">
    <h2>Parecer Técnico do Documento</h2>
    <p>${data.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}</p>
  </div>

  <div class="section parecer-conformidade">
    <h2>Parecer Breve de Conformidade e Créditos</h2>
    <p>${data.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}</p>
  </div>

  <h2>Parametrização de ERP - Detalhamento de Itens</h2>
  ${data.itens && data.itens.length > 0 ? data.itens.map((item: any, i: number) => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-title">Item ${i + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}</div>
        <div class="item-ncm">NCM: ${item.ncm || 'N/A'} | CEST: ${item.cest || 'N/A'}</div>
      </div>

      <div class="grid-container">
        <div class="tax-block icms">
          <div class="tax-title">Bloco ICMS/ST</div>
          <div class="tax-row"><span class="tax-label">CFOP:</span> <span class="tax-value">${item.cfopEntrada || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">CST:</span> <span class="tax-value">${item.cstIcmsEntrada || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota:</span> <span class="tax-value">${item.aliqIcms || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Crédito:</span> <span class="tax-value">${item.permiteCredito ? 'Sim' : 'Não'}</span></div>
        </div>

        <div class="tax-block pis-cofins">
          <div class="tax-title">Bloco PIS/COFINS</div>
          <div class="tax-row"><span class="tax-label">CST:</span> <span class="tax-value">${item.cstPisCofinsEntrada || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota PIS:</span> <span class="tax-value">${item.aliqPis || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota COFINS:</span> <span class="tax-value">${item.aliqCofins || 'N/A'}</span></div>
        </div>

        <div class="tax-block reforma">
          <div class="tax-title">Bloco Reforma Tributária</div>
          <div class="tax-row"><span class="tax-label">cClassTrib:</span> <span class="tax-value">${item.cClassTrib || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota IBS:</span> <span class="tax-value">${item.aliqIbsTransitorio || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota CBS:</span> <span class="tax-value">${item.aliqCbsTransitorio || 'N/A'}</span></div>
          <div class="tax-row"><span class="tax-label">Regime:</span> <span class="tax-value">${item.regimeEspecial || 'N/A'}</span></div>
        </div>
      </div>

      <div class="instruction">
        <strong>Instrução:</strong> ${item.instrucaoCadastro || 'N/A'}
      </div>
    </div>
  `).join('') : '<p>Nenhum item processado nesta auditoria.</p>'}
</body>
</html>
      `;

      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': 'attachment; filename="relatorio_executivo.html"',
        },
      });
    } else {
      // Default to TXT / Markdown
      let txtContent = `# Portela Contabilidade - Laudo de Auditoria Fiscal\n`;
      txtContent += `Data da geração: ${new Date().toLocaleString('pt-BR')}\n\n`;

      txtContent += `## Parecer Técnico do Documento\n`;
      txtContent += `${data.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}\n\n`;

      txtContent += `## Parecer Breve de Conformidade e Créditos\n`;
      txtContent += `${data.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}\n\n`;

      txtContent += `## Parametrização de ERP - Detalhamento de Itens\n\n`;

      if (data.itens && data.itens.length > 0) {
        data.itens.forEach((item: any, i: number) => {
          txtContent += `### Item ${i + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}\n`;
          txtContent += `- NCM: ${item.ncm || 'N/A'} | CEST: ${item.cest || 'N/A'}\n\n`;

          txtContent += `#### [ICMS/ST]\n`;
          txtContent += `- CFOP: ${item.cfopEntrada || 'N/A'}\n`;
          txtContent += `- CST: ${item.cstIcmsEntrada || 'N/A'}\n`;
          txtContent += `- Alíquota: ${item.aliqIcms || 'N/A'}\n`;
          txtContent += `- Crédito: ${item.permiteCredito ? 'Sim' : 'Não'}\n\n`;

          txtContent += `#### [PIS/COFINS]\n`;
          txtContent += `- CST: ${item.cstPisCofinsEntrada || 'N/A'}\n`;
          txtContent += `- Alíquota PIS: ${item.aliqPis || 'N/A'}\n`;
          txtContent += `- Alíquota COFINS: ${item.aliqCofins || 'N/A'}\n\n`;

          txtContent += `#### [REFORMA TRIBUTÁRIA]\n`;
          txtContent += `- cClassTrib: ${item.cClassTrib || 'N/A'}\n`;
          txtContent += `- Alíquota IBS: ${item.aliqIbsTransitorio || 'N/A'}\n`;
          txtContent += `- Alíquota CBS: ${item.aliqCbsTransitorio || 'N/A'}\n`;
          txtContent += `- Regime Especial: ${item.regimeEspecial || 'N/A'}\n\n`;

          txtContent += `**Instrução de Cadastro:** ${item.instrucaoCadastro || 'N/A'}\n`;
          txtContent += `---------------------------------------------------\n\n`;
        });
      } else {
        txtContent += `Nenhum item processado nesta auditoria.\n`;
      }

      return new NextResponse(txtContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="relatorio_executivo.txt"',
        },
      });
    }
  } catch (error: any) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json(
      { error: 'Falha ao gerar o relatório executivo.' },
      { status: 500 }
    );
  }
}
