import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { metadata, parecerTecnico, parecerConformidade, itens } = body;

    // Montagem do Relatório Executivo em formato Texto Estruturado / Markdown
    let relatorio = `======================================================================\n`;
    relatorio += `         LAUDO DE AUDITORIA FISCAL E PARAMETRIZAÇÃO ERP               \n`;
    relatorio += `                     PORTELA CONTABILIDADE                            \n`;
    relatorio += `======================================================================\n\n`;

    if (metadata) {
      relatorio += `[DADOS DO DOCUMENTO]\n`;
      relatorio += `• Emitente: ${metadata.emitente || "N/D"}\n`;
      relatorio += `• CNPJ Emitente: ${metadata.cnpjEmitente || "N/D"}\n`;
      relatorio += `• Número NF-e: ${metadata.nNF || "N/D"} | Série: ${metadata.serie || "N/D"}\n`;
      relatorio += `• Data de Emissão: ${metadata.dhEmi || "N/D"}\n`;
      relatorio += `• Regime Adquirente: ${metadata.regime || "N/D"} | Finalidade: ${metadata.finalidade || "N/D"}\n\n`;
    }

    relatorio += `----------------------------------------------------------------------\n`;
    relatorio += `1. PARECER TÉCNICO DO XML\n`;
    relatorio += `----------------------------------------------------------------------\n`;
    relatorio += `${parecerTecnico || "Nenhum parecer técnico gerado."}\n\n`;

    relatorio += `----------------------------------------------------------------------\n`;
    relatorio += `2. PARECER DE CONFORMIDADE E CRÉDITOS\n`;
    relatorio += `----------------------------------------------------------------------\n`;
    relatorio += `${parecerConformidade || "Nenhum parecer de conformidade gerado."}\n\n`;

    relatorio += `----------------------------------------------------------------------\n`;
    relatorio += `3. CARTÃO DE PROGRAMAÇÃO VISUAL / PARÂMETROS PARA O ERP\n`;
    relatorio += `----------------------------------------------------------------------\n\n`;

    if (itens && Array.isArray(itens)) {
      itens.forEach((item: any, index: number) => {
        relatorio += `[ITEM ${index + 1}] ${item.cProd || ""} - ${item.xProd || "Produto sem descrição"}\n`;
        relatorio += `  • NCM: ${item.ncm || "N/D"} | CEST: ${item.cest || "N/D"}\n`;
        relatorio += `  • CFOP Entrada Sugerido: ${item.cfopEntrada || "N/D"}\n`;
        relatorio += `  • CST ICMS Entrada: ${item.cstIcmsEntrada || "N/D"} | Alíquota: ${item.aliqIcms || "0"}%\n`;
        relatorio += `  • CST PIS/COFINS: ${item.cstPisCofinsEntrada || "N/D"}\n`;
        relatorio += `  • Reforma Tributária (LC 214/25) - cClassTrib: ${item.cClassTrib || "N/D"}\n`;
        relatorio += `  • Permite Crédito?: ${item.permiteCredito ? "SIM" : "NÃO"}\n`;
        relatorio += `  • Instrução para Cadastro: ${item.instrucaoCadastro || "N/D"}\n`;
        relatorio += `--------------------------------------------------------------------\n`;
      });
    }

    // Retorna o relatório como texto plano para download direto (.txt)
    return new NextResponse(relatorio, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="laudo-auditoria-${metadata?.nNF || "fiscal"}.txt"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
