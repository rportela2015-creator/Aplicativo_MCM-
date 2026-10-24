import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para o PDF.' }, { status: 400 });
    }

    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // We wrap the doc end in a promise to properly return the buffer when it is done
    const pdfBufferPromise = new Promise<Buffer>((resolve) => {
        doc.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
    });

    // --- Header ---
    doc.fontSize(20).text('Relatório de Auditoria Fiscal de Entrada', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Data da geração: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.moveDown(2);

    // --- Summary ---
    doc.fontSize(14).text('Parecer Técnico do Documento');
    doc.moveDown(0.5);
    doc.fontSize(10).text(data.parecerTecnicoXml || 'Nenhum parecer técnico disponível.');
    doc.moveDown(1.5);

    doc.fontSize(14).text('Parecer Breve de Conformidade e Créditos');
    doc.moveDown(0.5);
    doc.fontSize(10).text(data.parecerConformidade || 'Nenhum parecer de conformidade disponível.');
    doc.moveDown(2);

    // --- Detail ---
    doc.fontSize(14).text('Parametrização de ERP - Detalhamento de Itens');
    doc.moveDown(1);

    if (data.itens && data.itens.length > 0) {
      data.itens.forEach((item: any, i: number) => {
        doc.rect(50, doc.y, 500, 110).stroke('#cccccc');
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Item ${i + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}`, { indent: 10, underline: true });
        doc.fontSize(10).text(`NCM: ${item.ncm || 'N/A'} | CEST: ${item.cest || 'N/A'}`, { indent: 10 });
        doc.moveDown(0.5);

        doc.fontSize(9).text(`[ICMS/ST] CFOP: ${item.cfopEntrada || 'N/A'} | CST: ${item.cstIcmsEntrada || 'N/A'} | Alíquota: ${item.aliqIcms || 'N/A'} | Crédito: ${item.permiteCredito ? 'Sim' : 'Não'}`, { indent: 10 });
        doc.text(`[PIS/COFINS] CST: ${item.cstPisCofinsEntrada || 'N/A'} | PIS: ${item.aliqPis || 'N/A'} | COFINS: ${item.aliqCofins || 'N/A'}`, { indent: 10 });
        doc.text(`[REFORMA] cClassTrib: ${item.cClassTrib || 'N/A'} | IBS: ${item.aliqIbsTransitorio || 'N/A'} | CBS: ${item.aliqCbsTransitorio || 'N/A'} | Regime: ${item.regimeEspecial || 'N/A'}`, { indent: 10 });
        doc.moveDown(0.5);
        doc.text(`Instrução: ${item.instrucaoCadastro || 'N/A'}`, { indent: 10, oblique: true });

        doc.moveDown(2);
      });
    } else {
        doc.fontSize(12).font('Helvetica-Oblique').text('Nenhum item processado nesta auditoria.');
    }

    doc.end();

    const pdfBuffer = await pdfBufferPromise;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="auditoria_entrada.pdf"',
      },
    });
  } catch (error: any) {
    console.error('Erro ao gerar PDF:', error);
    return NextResponse.json(
      { error: 'Falha ao gerar o relatório PDF.' },
      { status: 500 }
    );
  }
}
