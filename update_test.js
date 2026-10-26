const fs = require('fs');

let content = fs.readFileSync('tests/engine.test.mjs', 'utf8');

const stemTests = `
// ------------------------------------------------------------------ testes de stemming (redução morfológica)
{
  const CASES = [
    { in: 'pneu', out: 'pneu' },
    { in: 'pneus', out: 'pneu' },
    { in: 'automovel', out: 'automovel' },
    { in: 'automoveis', out: 'automoveio' },
    { in: 'portateis', out: 'portateio' },
    { in: 'portatil', out: 'portatil' },
    { in: 'finais', out: 'finaio' },
    { in: 'reis', out: 'reis' }, // length < 5
    { in: 'ar-condicionados', out: 'ar-condicionado' },
    { in: 'computadores', out: 'computadore' },
    { in: 'celulares', out: 'celulare' }
  ];

  console.log('\\n--- teste de stemming morfológico ---');
  for (const c of CASES) {
    const got = engine.stem(c.in);
    assert.equal(got, c.out, \`stem('\${c.in}') falhou: esperado '\${c.out}', obtido '\${got}'\`);
    console.log(\`OK  \${c.in} -> \${got}\`);
  }
}
`;

content = content.replace('// ------------------------------------------------------------------ casos específicos', stemTests + '\\n// ------------------------------------------------------------------ casos específicos');

fs.writeFileSync('tests/engine.test.mjs', content);
