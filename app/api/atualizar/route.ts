import { spawn } from 'node:child_process';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 1500;

const run = (cmd: string, args: string[], timeoutMs: number) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn(cmd, args, { cwd: process.cwd() });
    let out = '', er = '';
    const killer = setTimeout(() => { p.kill('SIGKILL'); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (er += d));
    p.on('close', (code) => { clearTimeout(killer); resolve({ code: code ?? -1, stdout: out, stderr: er }); });
  });

/**
 * POST /api/atualizar?tipo=fontes|completo|reforma
 *  - fontes   : só a Tabela NCM/atributos (Siscomex) e as tabelas derivadas
 *  - completo : fontes + pipeline (regenera public/data)
 *  - reforma  : tabelas oficiais da reforma do consumo (cClassTrib/IS/alíquotas) + pipeline.
 *               A parte do Imposto Seletivo é 1 requisição por NCM e pode levar dezenas de
 *               minutos; o script retoma do cache se for interrompido.
 */
export async function POST(req: Request) {
  const tipo = new URL(req.url).searchParams.get('tipo') || 'completo';
  const fontes = await run('python3', ['scripts/baixar_fontes.py'], 240_000);
  const partes = [`$ python3 scripts/baixar_fontes.py\n${fontes.stdout}${fontes.stderr ? `\n[stderr]\n${fontes.stderr}` : ''}`];
  if (fontes.code !== 0) {
    return NextResponse.json({ ok: false, tipo, exitCode: fontes.code, stdout: partes.join('\n\n') }, { status: 502 });
  }
  if (tipo === 'reforma') {
    const ref = await run('python3', ['scripts/baixar_reforma.py'], 300_000);
    partes.push(`$ python3 scripts/baixar_reforma.py\n${ref.stdout}${ref.stderr ? `\n[stderr]\n${ref.stderr}` : ''}`);
    const is = await run('python3', ['scripts/baixar_is.py'], 1_500_000);
    partes.push(`$ python3 scripts/baixar_is.py\n${is.stdout}${is.stderr ? `\n[stderr]\n${is.stderr}` : ''}`);
    const pipe2 = await run('python3', ['scripts/pipeline.py'], 180_000);
    partes.push(`$ python3 scripts/pipeline.py\n${pipe2.stdout}${pipe2.stderr ? `\n[stderr]\n${pipe2.stderr}` : ''}`);
    const code = pipe2.code || 0;
    return NextResponse.json({ ok: code === 0, tipo, exitCode: code, stdout: partes.join('\n\n') },
      { status: code === 0 ? 200 : 502 });
  }
  if (tipo === 'completo') {
    const pipe = await run('python3', ['scripts/pipeline.py'], 180_000);
    partes.push(`$ python3 scripts/pipeline.py\n${pipe.stdout}${pipe.stderr ? `\n[stderr]\n${pipe.stderr}` : ''}`);
    return NextResponse.json({ ok: pipe.code === 0, tipo, exitCode: pipe.code, stdout: partes.join('\n\n') },
      { status: pipe.code === 0 ? 200 : 502 });
  }
  return NextResponse.json({ ok: true, tipo, exitCode: 0, stdout: partes.join('\n\n') });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    uso: 'POST /api/atualizar?tipo=completo|fontes|reforma',
    fontes: 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json',
  });
}
