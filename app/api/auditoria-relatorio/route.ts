import { NextResponse } from 'next/server';
import { z } from 'zod';

const PayloadSchema = z.object({
  format: z.enum(['html', 'txt']),
  results: z.array(z.any()),
  stats: z.object({
    total: z.number(),
    comDivergencia: z.number(),
    semDivergencia: z.number()
  })
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = PayloadSchema.parse(body);

    const { format, results, stats } = parsed;

    if (format === 'txt') {
      const lines = [
        'RELATÓRIO DE AUDITORIA DE NOTAS FISCAIS',
        '=======================================',
        `Data: ${new Date().toLocaleDateString('pt-BR')}`,
        '',
        'RESUMO',
        `Total de itens auditados: ${stats.total}`,
        `Itens com divergência: ${stats.comDivergencia}`,
        `Itens sem divergência: ${stats.semDivergencia}`,
        '',
        'DETALHES DOS ITENS COM DIVERGÊNCIA',
        '----------------------------------'
      ];

      for (const item of results) {
        if (!item.isValid) {
          lines.push(`- Produto: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}`);
          lines.push(`  NCM Original: ${item.ncmOriginal || 'N/A'}`);
          lines.push(`  NCM Sugerida: ${item.ncmSugerida?.ncm || 'N/A'}`);
          lines.push(`  Confiança: ${item.ncmSugerida?.confianca || 'N/A'}`);
          lines.push(`  Motivo: ${item.motivo || 'N/A'}`);
          lines.push('');
        }
      }

      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="auditoria_relatorio.txt"'
        }
      });
    } else {
      // HTML Format with strict escaping
      const esc = (s: any) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Auditoria</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { color: #1a56db; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
  .summary { background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
  .item { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
  .danger { color: #dc2626; font-weight: bold; }
</style>
</head>
<body>
  <h1>Relatório de Auditoria Fiscal</h1>
  <div class="summary">
    <p><strong>Total de itens:</strong> ${stats.total}</p>
    <p><strong>Com divergência:</strong> <span class="danger">${stats.comDivergencia}</span></p>
    <p><strong>Sem divergência:</strong> ${stats.semDivergencia}</p>
  </div>
  <h2>Detalhes (Divergências)</h2>
`;

      for (const item of results) {
        if (!item.isValid) {
          html += `
  <div class="item">
    <h3>Produto ${esc(item.cProd)}: ${esc(item.xProd)}</h3>
    <p><strong>NCM XML:</strong> ${esc(item.ncmOriginal)}</p>
    <p><strong>NCM Sugerida:</strong> ${esc(item.ncmSugerida?.ncm)}</p>
    <p><strong>Confiança:</strong> ${esc(item.ncmSugerida?.confianca)}</p>
    <p><strong>Motivo:</strong> ${esc(item.motivo)}</p>
  </div>`;
        }
      }

      html += `
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="auditoria_relatorio.html"',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
        }
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
