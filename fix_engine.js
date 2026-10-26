const fs = require('fs');
let content = fs.readFileSync('lib/engine.ts', 'utf8');
content = content.replace(
  "if (base.endsWith('i') || ['reis', 'teis', 'vais', 'rais'].includes(w.slice(-4))) w = base + 'io';",
  "if (base.endsWith('i') || ['reis', 'teis', 'vais', 'rais'].includes(w.slice(-4))) w = base + 'o';"
);
fs.writeFileSync('lib/engine.ts', content);
