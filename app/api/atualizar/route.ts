import { spawn } from 'node:child_process';
import { NextResponse } from 'next/server';
import { bearerValido, criarTrava, ultimosChars } from '@/lib/seguranca';
import { planoAtualizacao, tipoSchema, TIPOS_ATUALIZACAO } from '@/lib/atualizar';

export const dynamic = 'force-dynamic';
export const maxDuration = 1500;

const trava = criarTrava();

const run = (cmd: string, args: string[], timeoutMs: number) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn(cmd, args, { cwd: process.cwd() });
    let out = '', er = '';
    const killer = setTimeout(() => { p.kill('SIGKILL'); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (er += d));
    p.on('error', (e) => { clearTimeout(killer); resolve({ code: -1, stdout: out, stderr: er + String(e) }); });
    p.on('close', (code) => { clearTimeout(killer); resolve({ code: code ?? -1, stdout: out, stderr: er }); });
  });

/**
 * POST /api/atualizar?tipo=fontes|completo|reforma
 *  - fontes   : só a Tabela NCM/atributos (Siscomex) e as tabelas derivadas
 *  - completo : fontes + pipeline (regenera public/data)            [padrão]
 *  - reforma  : tabelas oficiais da reforma do consumo (cClassTrib/IS/alíquotas) + pipeline.
 *               Não baixa as fontes do Siscomex. O Imposto Seletivo é 1 requisição por NCM e
 *               pode levar dezenas de minutos; o script retoma do cache se for interrompido.
 *
 * SEGURANÇA: a rota executa processos e grava em disco. Fica DESLIGADA por padrão e exige
 *   ENABLE_UPDATE_ROUTE=true  +  UPDATE_TOKEN definido  +  "Authorization: Bearer <token>".
 *   Uma execução por vez (409 se já houver outra). Em hospedagem de FS efêmero (ex.: Colab)
 *   mantenha desligada: gere os dados em CI/local e commite public/data.
 */
export async function POST(req: Request) {
  if (process.env.ENABLE_UPDATE_ROUTE !== 'true') {
    return NextResponse.json(
      { ok: false, error: 'Rota de atualização desabilitada. Defina ENABLE_UPDATE_ROUTE=true e UPDATE_TOKEN para habilitar.' },
      { status: 403 },
    );
  }
  const token = process.env.UPDATE_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'UPDATE_TOKEN não configurado no servidor.' }, { status: 403 });
  }
  if (!bearerValido(req.headers.get('authorization'), token)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const parsed = tipoSchema.safeParse(new URL(req.url).searchParams.get('tipo') ?? undefined);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Parâmetro tipo inválido.', tiposValidos: TIPOS_ATUALIZACAO }, { status: 400 });
  }
  const tipo = parsed.data;

  if (!trava.tentar()) {
    return NextResponse.json({ ok: false, error: 'Já existe uma atualização em andamento.' }, { status: 409 });
  }
  try {
    const partes: string[] = [];
    let exitCode = 0;
    for (const passo of planoAtualizacao(tipo)) {
      const r = await run(passo.cmd, passo.args, passo.timeoutMs);
      partes.push(`$ ${passo.cmd} ${passo.args.join(' ')}\n${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ''}`);
      if (r.code !== 0) { exitCode = r.code; break; }
    }
    return NextResponse.json(
      { ok: exitCode === 0, tipo, exitCode, stdout: ultimosChars(partes.join('\n\n')) },
      { status: exitCode === 0 ? 200 : 502 },
    );
  } finally {
    trava.liberar();
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    habilitado: process.env.ENABLE_UPDATE_ROUTE === 'true',
    uso: 'POST /api/atualizar?tipo=completo|fontes|reforma (Authorization: Bearer <UPDATE_TOKEN>)',
    fontes: 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json',
  });
}
