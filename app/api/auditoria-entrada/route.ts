import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getFiscalContext } from '@/lib/fiscal-context';
import { GoogleGenAI, Type } from '@google/genai';
import { getMapaD8 } from '@/lib/ai/ncm-server';
import { validarNcmIA } from '@/lib/ai/validar';

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
    let isXml = false;
    let originalItens: Record<string, any> = {};

    if (file.name.toLowerCase().endsWith('.xml')) {
      isXml = true;
      const xmlString = buffer.toString('utf-8');
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsedXml = parser.parse(xmlString);

      const nfe = parsedXml.nfeProc?.NFe?.infNFe || parsedXml.NFe?.infNFe;

      if (!nfe) {
        return NextResponse.json({ error: 'XML de NF-e inválido.' }, { status: 400 });
      }

      // Extração determinística do XML
      const emit = {
        cnpj: nfe.emit?.CNPJ,
        nome: nfe.emit?.xNome,
        crt: nfe.emit?.CRT,
      };

      const dest = {
        cnpj: nfe.dest?.CNPJ,
        cpf: nfe.dest?.CPF,
        nome: nfe.dest?.xNome,
      };

      const itens = Array.isArray(nfe.det) ? nfe.det : (nfe.det ? [nfe.det] : []);

      const detExtraido = itens.map((d: any) => {
        const item = {
          cProd: d.prod?.cProd,
          xProd: d.prod?.xProd,
          NCM: d.prod?.NCM,
          CEST: d.prod?.CEST,
          CFOP: d.prod?.CFOP,
          vProd: d.prod?.vProd,
          imposto: d.imposto
        };
        if (item.cProd) {
          originalItens[item.cProd.toString()] = item;
        }
        return item;
      });

      const resumo = {
        emit,
        dest,
        itens: detExtraido
      };

      parsedContent = JSON.stringify(resumo, null, 2);
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text;

      // Basic deterministic extraction for PDF to help the AI (DANFE structure)
      const emitMatch = text.match(/CNPJ:\s*([\d\.\-\/]+)/);
      const destMatch = text.match(/DESTINATÁRIO[\s\S]*?CNPJ\/CPF:\s*([\d\.\-\/]+)/);

      const cfops = [...text.matchAll(/CFOP:\s*(\d{4})/g)].map(m => m[1]);
      const ncms = [...text.matchAll(/NCM[\/\s]*SH[:\s]*([\d\.]+)/g)].map(m => m[1]);

      const resumoPdf = {
        textoIntegral: text,
        extracaoAuxiliar: {
          emitenteCnpj: emitMatch ? emitMatch[1] : null,
          destinatarioCnpjCpf: destMatch ? destMatch[1] : null,
          cfopsEncontrados: [...new Set(cfops)],
          ncmsEncontrados: [...new Set(ncms)]
        }
      };

      parsedContent = JSON.stringify(resumoPdf, null, 2);
    } else {
      return NextResponse.json({ error: 'Formato de arquivo não suportado. Apenas XML ou PDF.' }, { status: 400 });
    }

    const fiscalContext = await getFiscalContext();

    const userPrompt = `
Por favor, analise a seguinte nota fiscal de entrada considerando o contexto fiscal.
Regime do Destinatário: ${regime || 'Não informado'}
Finalidade da Aquisição: ${finalidade || 'Não informado'}

Conteúdo da Nota Fiscal (XML parseado ou texto de PDF):
${parsedContent}

Responda usando o seguinte JSON Schema, exatamente:
{
  "statusGlobal": "Regular | Atenção | Inconsistente",
  "parecerTecnicoXml": "Avaliação minuciosa da NF-e emitida pelo fornecedor (alíquotas interestaduais, retenções, consistência).",
  "parecerConformidade": "Resumo executivo sobre direito a créditos, riscos, DIFAL e estornos.",
  "itens": [
    {
      "cProd": "string",
      "xProd": "string",
      "ncm": "string",
      "cest": "string",
      "cfopEntrada": "string",
      "cstIcmsEntrada": "string",
      "aliqIcms": "string",
      "cstPisCofinsEntrada": "string",
      "aliqPis": "string",
      "aliqCofins": "string",
      "permiteCredito": true,
      "cClassTrib": "string",
      "aliqIbsTransitorio": "string",
      "aliqCbsTransitorio": "string",
      "regimeEspecial": "string",
      "instrucaoCadastro": "Instrução cirúrgica com a regra aplicada"
    }
  ]
}
`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const ai = new GoogleGenAI({ apiKey });

    // Fallback model array for this route as well
    const modelos = ['gemini-3.8-flash', 'gemini-3.6-flash'];
    let textResponse = '';
    let ultimoErro: any = null;

    for (const model of modelos) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            { role: 'user', parts: [{ text: fiscalContext + '\n\n' + userPrompt }] }
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                statusGlobal: { type: Type.STRING },
                parecerTecnicoXml: { type: Type.STRING },
                parecerConformidade: { type: Type.STRING },
                itens: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cProd: { type: Type.STRING },
                      xProd: { type: Type.STRING },
                      ncm: { type: Type.STRING },
                      cest: { type: Type.STRING },
                      cfopEntrada: { type: Type.STRING },
                      cstIcmsEntrada: { type: Type.STRING },
                      aliqIcms: { type: Type.STRING },
                      cstPisCofinsEntrada: { type: Type.STRING },
                      aliqPis: { type: Type.STRING },
                      aliqCofins: { type: Type.STRING },
                      permiteCredito: { type: Type.BOOLEAN },
                      cClassTrib: { type: Type.STRING },
                      aliqIbsTransitorio: { type: Type.STRING },
                      aliqCbsTransitorio: { type: Type.STRING },
                      regimeEspecial: { type: Type.STRING },
                      instrucaoCadastro: { type: Type.STRING },
                    },
                    required: ['cProd', 'xProd', 'ncm', 'cClassTrib']
                  }
                }
              },
              required: ['statusGlobal', 'parecerTecnicoXml', 'parecerConformidade', 'itens']
            }
          }
        });
        if (response.text) {
          textResponse = typeof response.text === 'function' ? (response as any).text() : response.text;
          break;
        }
      } catch (err: any) {
        ultimoErro = err;
        console.warn(`Tentativa com ${model} falhou, tentando próximo modelo...`, err?.message || err);
      }
    }

    if (!textResponse) {
      throw ultimoErro || new Error('Nenhum modelo respondeu à solicitação.');
    }

    const result = JSON.parse(textResponse);
    const mapaD8 = getMapaD8();

    if (result.itens && Array.isArray(result.itens)) {
      result.itens = result.itens.map((item: any) => {
        // Reconcile NCM from XML
        if (isXml && item.cProd && originalItens[item.cProd.toString()]) {
          const originalNcm = originalItens[item.cProd.toString()].NCM;
          if (originalNcm) {
             item.ncm = originalNcm.toString();
          }
        }

        // Validate NCM
        const validacao = validarNcmIA({ ncm: item.ncm }, mapaD8);
        if (!validacao.valido) {
          item.ncmValidado = false;
          item.confianca = "BAIXA";
        } else {
          item.ncmValidado = true;
          item.confianca = validacao.confianca || "MEDIA";
        }
        return item;
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Erro na auditoria de entrada:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
