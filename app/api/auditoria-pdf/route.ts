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
    doc.fontSize(14).text('Resumo Operacional');
    doc.moveDown(0.5);
    doc.fontSize(12).text(`CFOP de Entrada Sugerido: ${data.cfopEntradaSugerido || 'N/A'}`);
    doc.text(`Direito a Crédito: ${data.direitoCredito ? 'Sim' : 'Não'}`);
    doc.moveDown(2);

    // --- Detail ---
    doc.fontSize(14).text('Detalhamento de Itens');
    doc.moveDown(1);

    if (data.itens && data.itens.length > 0) {
      data.itens.forEach((item: any, i: number) => {
        doc.fontSize(12).text(`Item ${i + 1}: ${item.produto || item.descricao || 'N/A'}`, { underline: true });
        doc.fontSize(10).text(`NCM: ${item.ncm || 'N/A'}`);
        doc.text(`cClassTrib: ${item.cClassTrib || 'N/A'}`);
        doc.text(`Parecer / Alerta da Reforma: ${item.parecer || item.alertaReforma || 'N/A'}`);
        doc.moveDown(1);
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
