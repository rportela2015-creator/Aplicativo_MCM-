import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getFiscalContext } from '@/lib/fiscal-context';
import { askOmniRoute } from '@/lib/omniroute';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const regime = formData.get('regime') as string;
    const finalidade = formData.get('finalidade') as string;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parsedContent = '';

    if (file.name.toLowerCase().endsWith('.xml')) {
      const xmlString = buffer.toString('utf-8');
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsedXml = parser.parse(xmlString);

      const nfe = parsedXml.nfeProc?.NFe?.infNFe || parsedXml.NFe?.infNFe;

      if (!nfe) {
        return NextResponse.json({ error: 'XML de NF-e inválido.' }, { status: 400 });
      }

      // Simplificando o XML para poupar tokens
      const resumo = {
        ide: nfe.ide,
        emit: nfe.emit,
        dest: nfe.dest,
        det: Array.isArray(nfe.det) ? nfe.det.map((d: any) => ({
          prod: d.prod,
          imposto: d.imposto
        })) : [{ prod: nfe.det?.prod, imposto: nfe.det?.imposto }]
      };

      parsedContent = JSON.stringify(resumo, null, 2);
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      parsedContent = pdfData.text;
    } else {
      return NextResponse.json({ error: 'Formato de arquivo não suportado. Apenas XML ou PDF.' }, { status: 400 });
    }

    const fiscalContext = await getFiscalContext();

    const userPrompt = `
Por favor, analise a seguinte nota fiscal de entrada.
Regime do Destinatário: ${regime || 'Não informado'}
Finalidade da Aquisição: ${finalidade || 'Não informado'}

Conteúdo da Nota Fiscal:
${parsedContent}

Responda em formato JSON estrito com as seguintes chaves:
{
  "cfop_entrada_sugerido": "string",
  "credito_permitido": boolean,
  "itens": [
    {
      "ncm": "string",
      "cClassTrib_sugerido": "string",
      "alerta_reforma": "string"
    }
  ]
}
`;

    const result = await askOmniRoute(fiscalContext, userPrompt);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Erro na auditoria de entrada:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}