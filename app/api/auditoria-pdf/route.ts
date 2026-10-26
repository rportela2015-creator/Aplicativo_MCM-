import { NextResponse } from 'next/server';
import { z } from 'zod';

const pdfDataSchema = z.object({
  parecerTecnicoXml: z.string().optional().nullable(),
  parecerConformidade: z.string().optional().nullable(),
  itens: z.array(z.object({
    cProd: z.string().optional().nullable(),
    xProd: z.string().optional().nullable(),
    ncm: z.string().optional().nullable(),
    cest: z.string().optional().nullable(),
    cfopEntrada: z.string().optional().nullable(),
    cstIcmsEntrada: z.string().optional().nullable(),
    aliqIcms: z.string().optional().nullable(),
    permiteCredito: z.boolean().optional().nullable(),
    cstPisCofinsEntrada: z.string().optional().nullable(),
    aliqPis: z.string().optional().nullable(),
    aliqCofins: z.string().optional().nullable(),
    cClassTrib: z.string().optional().nullable(),
    aliqIbsTransitorio: z.string().optional().nullable(),
    aliqCbsTransitorio: z.string().optional().nullable(),
    regimeEspecial: z.string().optional().nullable(),
    instrucaoCadastro: z.string().optional().nullable(),
  })).optional().nullable()
});

export async function POST(request: Request) {
  try {
    let data = await request.json();

    if (!data) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para o relatório.' }, { status: 400 });
    }

    const parsed = pdfDataSchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos para o relatório.', details: parsed.error.issues }, { status: 400 });
    }

    data = parsed.data;

    let relatorio = `Relatório de Auditoria Fiscal de Entrada\n`;
    relatorio += `Data da geração: ${new Date().toLocaleString('pt-BR')}\n\n`;

    relatorio += `Parecer Técnico do Documento\n`;
    relatorio += `${data.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}\n\n`;

    relatorio += `Parecer Breve de Conformidade e Créditos\n`;
    relatorio += `${data.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}\n\n`;

    relatorio += `Parametrização de ERP - Detalhamento de Itens\n\n`;

    if (data.itens && data.itens.length > 0) {
      data.itens.forEach((item: any, i: number) => {
        relatorio += `Item ${i + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}\n`;
        relatorio += `NCM: ${item.ncm || 'N/A'} | CEST: ${item.cest || 'N/A'}\n`;
        relatorio += `[ICMS/ST] CFOP: ${item.cfopEntrada || 'N/A'} | CST: ${item.cstIcmsEntrada || 'N/A'} | Alíquota: ${item.aliqIcms || 'N/A'} | Crédito: ${item.permiteCredito ? 'Sim' : 'Não'}\n`;
        relatorio += `[PIS/COFINS] CST: ${item.cstPisCofinsEntrada || 'N/A'} | PIS: ${item.aliqPis || 'N/A'} | COFINS: ${item.aliqCofins || 'N/A'}\n`;
        relatorio += `[REFORMA] cClassTrib: ${item.cClassTrib || 'N/A'} | IBS: ${item.aliqIbsTransitorio || 'N/A'} | CBS: ${item.aliqCbsTransitorio || 'N/A'} | Regime: ${item.regimeEspecial || 'N/A'}\n`;
        relatorio += `Instrução: ${item.instrucaoCadastro || 'N/A'}\n\n`;
      });
    }

    return new NextResponse(relatorio, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="laudo-auditoria.txt"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
