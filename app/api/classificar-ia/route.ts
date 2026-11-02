import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getMapaD8 } from '@/lib/ai/ncm-server';
import { validarNcmIA } from '@/lib/ai/validar';
import { getApiKey, getModels } from '@/lib/ai/config';
import { gerarComFallback } from '@/lib/ai/fallback';
import { limiteIA } from '@/lib/ai/limite';
import { ipDoCliente } from '@/lib/seguranca';

export async function POST(req: Request) {
  const limite = limiteIA.check(ipDoCliente(req.headers));
  if (!limite.ok) {
    return NextResponse.json(
      { error: 'Muitas requisições. Aguarde e tente novamente.' },
      { status: 429, headers: { 'Retry-After': String(limite.retryAfter) } },
    );
  }
  try {
    const apiKey = getApiKey();
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

    // Modelos em ordem de prioridade (GEMINI_MODELS) para contornar picos de tráfego (503)
    const responseText = await gerarComFallback(ai, getModels(), { contents: prompt, config });

    const resultado = JSON.parse(responseText);

    const mapaD8 = getMapaD8();
    const validacao = validarNcmIA(resultado, mapaD8);

    if (!validacao.valido) {
      resultado.ncm = "";
      resultado.confianca = "BAIXA";
      resultado.valido = false;
      resultado.descricaoNcm = "";
      resultado.aviso = validacao.aviso;
    } else {
      resultado.ncm = validacao.ncm;
      resultado.confianca = validacao.confianca;
      resultado.valido = true;
      resultado.descricaoNcm = validacao.descricaoNcm;
    }

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error('Erro na classificação por IA:', error);
    return NextResponse.json(
      { error: error.message || 'Falha ao processar classificação por IA.' },
      { status: 500 }
    );
  }
}
