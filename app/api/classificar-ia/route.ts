import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chave GEMINI_API_KEY não encontrada no .env.local.' },
        { status: 500 }
      );
    }

    const { descricao, contextoOperacao } = await req.json();

    if (!descricao) {
      return NextResponse.json(
        { error: 'Descrição do item não informada.' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Você é um auditor fiscal especialista na Tabela NCM/SH e na Reforma Tributária Brasileira (LC 214 e LC 227).
Classifique a mercadoria abaixo determinando o código NCM (8 dígitos) e a parametrização para o período de transição (IBS/CBS/IS).

Produto: "${descricao}"
Contexto: "${contextoOperacao || 'Operação comercial interna padrão'}"`;

    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ncm: {
            type: Type.STRING,
            description: 'Código NCM com 8 dígitos sem pontos',
          },
          descricaoNcm: {
            type: Type.STRING,
            description: 'Descrição oficial sucinta do subitem',
          },
          confianca: {
            type: Type.STRING,
            enum: ['ALTA', 'MEDIA', 'BAIXA'],
          },
          cstIbsCbs: {
            type: Type.STRING,
            description: 'CST de IBS/CBS sugerido (ex.: 000, 200, 400)',
          },
          cClassTrib: {
            type: Type.STRING,
            description: 'Código cClassTrib ou vazio',
          },
          sujeitoImpostoSeletivo: {
            type: Type.BOOLEAN,
            description: 'Se incide Imposto Seletivo',
          },
          fundamentacao: {
            type: Type.STRING,
            description: 'Justificativa legal sucinta (máximo 2 frases)',
          },
        },
        required: [
          'ncm',
          'descricaoNcm',
          'confianca',
          'cstIbsCbs',
          'sujeitoImpostoSeletivo',
          'fundamentacao',
        ],
      },
    };

    // Lista de modelos em ordem de prioridade para contornar picos de tráfego (503)
    const modelos = ['gemini-3.6-flash', 'gemini-2.5-flash'];
    let responseText = '';
    let ultimoErro: any = null;

    for (const model of modelos) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });
        if (res.text) {
          responseText = res.text;
          break;
        }
      } catch (err: any) {
        ultimoErro = err;
        console.warn(`Tentativa com ${model} falhou, tentando próximo modelo...`, err?.message || err);
      }
    }

    if (!responseText) {
      throw ultimoErro || new Error('Nenhum modelo respondeu à solicitação.');
    }

    const resultado = JSON.parse(responseText);
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error('Erro na classificação por IA:', error);
    return NextResponse.json(
      { error: error.message || 'Falha ao processar classificação por IA.' },
      { status: 500 }
    );
  }
}