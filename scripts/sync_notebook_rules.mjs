import fs from 'fs';
import path from 'path';

const rulesPath = path.resolve('rules', 'rules.json');
const extraPath = path.resolve('rules', 'reforma-extra.json');

try {
  if (!fs.existsSync(rulesPath)) {
    console.error("Arquivo rules/rules.json não encontrado");
    process.exit(1);
  }

  const raw = fs.readFileSync(rulesPath, 'utf-8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed) || (parsed.rules && Array.isArray(parsed.rules))) {
     console.error("Formato inesperado em rules.json");
     process.exit(1);
  }

  const originalKeys = Object.keys(parsed).length;
  const originalStats = {};
  for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) {
          originalStats[key] = parsed[key].length;
      }
  }

  const regrasExtra = fs.existsSync(extraPath) ? JSON.parse(fs.readFileSync(extraPath, 'utf-8')) : [];

  let adicionadas = 0;
  let skipped = 0;

  const isDryRun = process.argv.includes('--dry-run');

  for (const regra of regrasExtra) {
    const listKey = regra.kind === 'Nota Legal' ? 'notas_legais' : 'armadilhas';

    if (!parsed[listKey]) {
        parsed[listKey] = [];
    }

    const list = parsed[listKey];
    const existingIds = new Set(list.map(r => r.id));

    if (!existingIds.has(regra.id)) {
      list.push(regra);
      adicionadas++;
      if (isDryRun) {
        console.log(`+ ${regra.id} (em ${listKey})`);
      }
    } else {
      skipped++;
    }
  }

  if (isDryRun) {
    console.log(`Dry-run: ${adicionadas} seriam adicionadas, ${skipped} puladas.`);
    process.exit(0);
  }

  // Sanity checks
  const newKeys = Object.keys(parsed).length;
  if (newKeys < originalKeys) {
      console.error(`Abortando: número de chaves raiz caiu de ${originalKeys} para ${newKeys}`);
      process.exit(1);
  }

  for (const key of Object.keys(originalStats)) {
      if (parsed[key] && parsed[key].length < originalStats[key]) {
          console.error(`Abortando: número de itens em '${key}' caiu de ${originalStats[key]} para ${parsed[key].length}`);
          process.exit(1);
      }
  }

  fs.writeFileSync(rulesPath, JSON.stringify(parsed, null, 2), 'utf-8');
  console.log(`✓ Sincronização concluída: ${adicionadas} regras normativas injetadas em rules/rules.json`);

} catch (err) {
  console.error("Erro na sincronização:", err);
  process.exit(1);
}
