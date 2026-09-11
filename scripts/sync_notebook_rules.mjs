import fs from 'fs';
import path from 'path';

const rulesPath = path.resolve('rules', 'rules.json');

const regrasReformaNotebook = [
  {
    id: "REF-CCONST-01",
    titulo: "Construção Civil e Materiais de Construção (LC 214/25, Art. 252 e 255)",
    kind: "Nota Legal",
    severidade: "critico",
    texto: "Na aquisição de tijolos, blocos e materiais de construção, o prestador de serviços em regime regular só pode creditar IBS/CBS relativo aos materiais até o limite do débito sobre o serviço quando o tomador for não-contribuinte (§5º do art. 255). Alíquota com redução de 50% aplicável na prestação.",
    ncms: ["68101100", "68101900", "68109100", "69041000"],
    fonte: "LC 214/2025 art. 255, §5º e DERE Anexo I"
  },
  {
    id: "REF-CESTA-01",
    titulo: "Cesta Básica Nacional de Alimentos — Alíquota Zero (Art. 125)",
    kind: "Nota Legal",
    severidade: "info",
    texto: "Ficam reduzidas a zero as alíquotas do IBS e da CBS para itens essenciais do Anexo I (arroz, feijão, leite, pão francês, farinhas). cClassTrib 200003.",
    ncms: ["10063011", "10063021", "07133319", "04012010", "19059090"],
    fonte: "LC 214/2025 art. 125 e Anexo I"
  },
  {
    id: "REF-IS-01",
    titulo: "Incidência de Imposto Seletivo (2027)",
    kind: "Armadilha",
    severidade: "critico",
    texto: "Mercadorias do setor de bebidas alcoólicas, produtos fumígenos e bebidas açucaradas sujeitam-se ao Imposto Seletivo cumulativo na saída a partir de 2027.",
    ncms: ["22030000", "22041010", "22083020", "24022000"],
    fonte: "LC 214/2025 e LC 227/2026"
  },
  {
    id: "REF-AGRO-01",
    titulo: "Insumos Agropecuários e Aquícolas — Redução de 60% e Diferimento (Art. 138)",
    kind: "Nota Legal",
    severidade: "info",
    texto: "Redução de 60% com possibilidade de diferimento (cClassTrib 515001) para fertilizantes e defensivos do Anexo IX com registro no MAPA.",
    ncms: ["31010000", "31021010", "38249977", "38249979"],
    fonte: "LC 214/2025 art. 138 e Anexo IX"
  }
];

try {
  let list = [];
  let isArray = true;
  let rawObj = {};

  if (fs.existsSync(rulesPath)) {
    const raw = fs.readFileSync(rulesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && Array.isArray(parsed.rules)) {
      list = parsed.rules;
      isArray = false;
      rawObj = parsed;
    }
  }

  const existingIds = new Set(list.map(r => r.id));
  let adicionadas = 0;

  for (const regra of regrasReformaNotebook) {
    if (!existingIds.has(regra.id)) {
      list.push(regra);
      adicionadas++;
    }
  }

  const payload = isArray ? list : { ...rawObj, rules: list };
  fs.writeFileSync(rulesPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`✓ Sincronização concluída: ${adicionadas} regras normativas injetadas em rules/rules.json`);
} catch (err) {
  console.error("Erro na sincronização:", err);
  process.exit(1);
}