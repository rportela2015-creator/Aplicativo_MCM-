# Classificador de NCM + Parametrização Fiscal

Agente que recebe a **descrição comercial de um produto** e devolve a **NCM sugerida** com
justificativa auditável, **tributos** (IPI da TIPI, II da TEC com exceção nacional, PIS/COFINS de
referência, ICMS de referência, NT/zeros onde a tabela assim determina), a **parametrização para o
ERP** (CST/CSOSN, CEST, CFOP, NCM-Ex/ex-tarifário, checklist do Catálogo de Produtos/DUIMP) e o
**enquadramento na reforma do consumo** (CST-IBS/CBS + `cClassTrib`, Imposto Seletivo por NCM,
alíquotas da transição). Interface em português.

**Direitos antidumping não são cobertos** — não há feed público legível por máquina para as
Resoluções Gecex de encerramento/reaplicação de direitos; o app não finge cobrir o que não tem.

> **Isto é apoio à decisão, não parecer fiscal.** Toda sugestão vem com a hierarquia oficial,
> as regras aplicadas e os dados que faltam para fechar o código. Quem assina a classificação
> é o contribuinte (ou seu contador/advogado).

---

## O que tem na tela

| Aba | Faz o quê |
|---|---|
| **1 · Classificar produto** | Descrição → ranking de NCMs com barra de confiança, badges (CEST, NCM-Ex, residual), grade de tributos e a dobra “por que este código” (hierarquia, RGI/RLI aplicadas, notas legais, armadilhas, transparência do score) + checklist CADA/DUIMP. |
| **2 · Lote (CSV)** | Colar texto ou subir CSV (`;`, `,` ou tab, RFC-4180). Classifica em lotes com progresso, exporta CSV para Excel (`;` + BOM, 15 colunas — inclui `cclasstrib_candidatos`, `is_2027` e `cfop`)
e triagem APROVAR / CONFERIR / NÃO USAR. Arquivo de amostra: `exemplos/produtos-exemplo.csv`. |
| **3 · Consultar NCM** | Busca por dígitos (prefixo de código) ou por palavra, filtro por capítulo e “só com CEST”, tabela paginada com painel lateral (hierarquia, tributação, atributos). |
| **4 · Parametrização de ERP** | Formulário de cadastro + cenário (CNPJ, IE, município, regime, modelo,
operação, destinatário, ST, frete…) → os **códigos** que o emissor precisa (`NCM`, `CEF`, CFOP, CST/CSOSN,
CST do IPI, PIS/COFINS, `CST-IBS/CBS` + `cClassTrib`, IS) com a **maqueta de XML** por grupo de tag,
a conferência de schema e a tabela de campos (planilha) selada contra as fontes oficiais. |
| **5 · Reforma (IBS/CBS/IS)** | Tabelas oficiais da reforma do consumo: 18 CST-IBS/CBS, 164 `cClassTrib`
com a fundamentação da LC 214/2025, 30 códigos do Imposto Seletivo, alíquotas de referência por ano/UF e a
destinação da arrecadação na transição. |
| **6 · Regras e fontes** | A rotina de classificação, RGI/RLI, notas legais por capítulo, as armadilhas com sua base legal, contagens por fonte, vigência e botão que baixa as fontes e regenera o dataset (`POST /api/atualizar`). |

## Reforma do consumo (IBS / CBS / IS)

O app **não improvisa código da reforma**: as tabelas vêm dos dados abertos da Calculadora de
Tributos do Consumo (RFB), obtidos ao ler o bundle público do próprio serviço (sem chave, sem
captcha) — `scripts/baixar_reforma.py`:

| Endpoint oficial | O que entra no app |
|---|---|
| `situacoes-tributarias/cbs-ibs` | 18 CST-IBS/CBS (000 … 830) |
| `classificacoes-tributarias/cbs-ibs/<CST>` | 164 `cClassTrib` com tipo de alíquota, tratamento, indicadores (redução, vedação c/ suspensão, exige `gDeson`, crédito presumido) e DFe habilitados |
| `fundamentacoes-legais` | a norma por código (LC 214/2025 + trecho do livro/artigo) |
| `situacoes-tributarias/imposto-seletivo` e `classificacoes-tributarias/imposto-seletivo/<CST>` | 7 CST do IS e 30 `cClassTribIS` (vigor em 2027) |
| `aliquota-uniao` / `aliquota-uf` | valores de referência lidos da API, ano a ano: União 0,9% (2026) → 8,4% (2027) → 8,5% (2029/2033) e IBS-UF 0,1% (2026) → 0,05% (2027) → 1,6% (2029) → 16% (2033). O app mostra **exatamente esses números**, com o ano ao lado — não soma nem projeta alíquota-padrão cheia. |
| `transferencias-cbs` / `transferencias-ibs` | destinação da arrecadação na transição (CBS 0% → 100% em 2033) |

`scripts/baixar_is.py` consulta **1 requisição por NCM** (10.515) na tabela oficial de 2027 e grava
`is`/`adv`/`are`/`un` nos registros — hoje **99 NCMs com IS** (charutos/cigarros, bebidas alcoólicas e
açucaradas, veículos 8703/8802/8903, minérios 2601/2603 e derivados de tabaco). O script é retomável
(cache em `data/raw/reforma/is_por_ncm.part.json`) e o app só marca `IS 2027` quando a tabela
respondeu: `is = null` significa “não consultado”, nunca “não tributado”.

No resultado da classificação, o bloco **“Reforma tributária do consumo”** mostra as candidatas
CST/cClassTrib do *cenário* informado (operação, regime, finalidade, CST de PIS/COFINS derivado pela
parametrização), a faixa de alíquota do ano e **o que falta para fechar** — porque o `cClassTrib`
codifica a situação da operação, não o produto. A aba 5 deixa navegar/filtrar os 164 códigos e abrir
a base legal de cada um.

## Parametrização de ERP (a tela que devolve o código pronto)

Aba 4. Você informa o **que o ERP sabe** e o app devolve o **que o XML precisa**:

| Bloco do formulário | O que muda na saída |
|---|---|
| CNPJ, IE, município (IBGE), UF, **regime** | `emit/CNPJ`, `emit/IE`, `emit/CRT` (1 Simples · 3 normal), `emit/cMun`, `emit/regApIBSCBSSN` |
| Modelo (55 · 65 · 57 · NFS-e), `tpAmb`, `finNFe`, `indFinal`, `indPres`, `modFrete` | bloco `ide` inteiro, com as exigências do modelo (NFC-e exige `indFinal=1` e presença) |
| Operação (interna/interestadual/importação/exportação), finalidade, UF e doc. do destinatário | `idDest`, bloco `dest` (com `indIEDest`), grupo `importaII`/`indDir`, e o CST-IBS/CBS de saída |
| ST, benefício fiscal, industrial | `ICMS00`/`ICMS101`/`ICMSSN10x` + `vBCST/pICMSST/vICMSST`, `gIPI` |
| Item (descrição → NCM, ou NCM digitado) e `cClassTrib` | `prod/NCM`, `prod/CEF` (CEST), `gIBSCBS/CST` + `cClassTrib`, `gDUIMP`, grupo `IS` quando o NCM está na lista |

Três saídas: **(1)** tabela por grupo de tag, com o *porquê* e a origem de cada valor — `tabela oficial`,
`regra do app` ou `a preencher`; **(2)** a maqueta de XML pronta para mapear no emissor (tags aninhadas,
códigos preenchidos, valores em branco); **(3)** a lista de conferências — CNPJ/CPF com dígito verificador,
IE de SP/PR (regra do SINTEC), tamanho do `cMun`, `cClassTrib` **conferido contra a tabela da RFB**
(999999 é bloqueado como rejeição 1065/1067), `regApIBSCBSSN` faltando no Simples, CEST presente sem ST,
NFC-e com `indPres=0`.

**O que o app não faz:** não inventa alíquota de ICMS/ISS nem valor de base — sem tabela estadual
pública, esses campos saem vazios e marcados “a preencher”. A maqueta é estrutura, não arquivo
transmissível (sem assinatura, sem totalizadores); valide contra o XSD da sua Autorizada.

### A tabela de campos (planilha) 

`data/raw/erp/*.csv` (a planilha “Códigos e Parâmetros dos Documentos Fiscais (NF-e e NFS-e)”) entra no app
por `scripts/baixar_erp.py` → `public/data/erp-parametros.json`: 447 linhas normalizadas, deduplicadas e
**confrontadas com as tabelas oficiais** que o app já baixou. Cada linha ganha um selo:
`oficial` (o exemplo bate com cClassTrib/NCM/CFOP/CST oficiais — 71 linhas), `derivada`, `inferido`
(100 linhas marcadas “Inferred/Not in source” na própria planilha) e `duvidoso` (exemplo que não consta
na tabela oficial — 0 hoje). O selo aparece na aba, e é por isso que a planilha é tratada como
**dicionário de tags**, não como fonte de código: onde ela diverge da tabela da RFB, vence a RFB.

## Garantias estruturais (por que ele não alucina código)

- A saída é **restrita aos 10.515 NCMs de 8 dígitos vigentes** carregados da tabela oficial:
  o motor só pode escolher `d8` já existentes — não há geração de código livre.
- **Determinístico e local**: idf + cobertura hierárquica + notas legais + armadilhas. Nenhuma
  rede, nenhum LLM em runtime. A mesma entrada sempre devolve a mesma saída.
- **Anti-chute**: quando falta dado, o agente desce a confiança e diz o que falta
  (ex.: “sem peso e tela, o 8º dígito de 8471 não pode ser firmado”; “sem o material, a escolha
  entre 9401.3x/6x/7x é indistinguível”). Banda alta nunca sai de descrição vaga — é asserção de teste.
- NCM inexistente digitada à mão é **rejeitada** (`não_encontrado`), não “corrigida”.

## Arquitetura

```
Portal Único Siscomex ─┐
                       ├─ scripts/baixar_fontes.py → data/raw/*.json
TIPI/TEC/CEST/CFOP ────┘                                │
                                             scripts/pipeline.py  (valida NCM de toda regra)
                                                        ↓
                       public/data/{ncm,ncm-frio,regras,atributos,cest,cfop,search,hierarquia,meta}.json
                                                        ↓
   lib/data.ts (loadDataset) → lib/engine.ts (classify/buildNotes/taxes) → lib/parametrizacao.ts → componentes
```

**Carga quente/fria.** O primeiro paint não espera o dataset inteiro: `loadDataset()` publica
`ncm.json` (1,9 MB) — descrição, hierarquia, IPI/II, nível — e a classificação já roda. CEST,
atributos, base legal, ex-tarifário e CFOP vêm em `ncm-frio.json` (2,8 MB) + `cest/cfop/atributos`
e são mesclados nos registros (`Object.assign`), com `ds.pronto` sinalizando a conclusão.
Os componentes mostram “carregando detalhes fiscais…” enquanto o frio não chega; os campos
frios são opcionais nos tipos (`rec.cest?`, `rec.attrs?`), então nada quebra se o arquivo falhar.

## Como o score é montado

```
score = 58·cov                                     cobertura dos termos da query (idf)
      + 118·√(ownW + 0,3·ancW)/√idfSum·(0,55+0,45·tfq)   evidência própria vs. ancestral
      + 16·frase                                   sequência literal de ≥7 chars
      + 5·min(3, tf−1)                             repetição
      ± 20 / −13                                   matéria declarada × capítulo da matéria
      ± armadilhas                                 reforço leve, penalidade multiplicativa
      ×0,93                                        item residual (“Outros”)
      − 42·(1−cov)                                 termos órfãos (marca, jargão de catálogo)
```

Banda de confiança: `0,30·|top1| + 0,24·margin + 0,26·cov + 0,14 + 0,12·frase − penalidades
− 0,14·sem-substantivo`, limitada a [0, 0,96]; **alta** exige `margin ≥ 0,78` **e** `cov ≥ 0,62`.
`margin = (top1 − top2)/top1`. Rótulos na UI: *consistente* / *confirmar dados* / *não feche o código*.

## Regras (o arquivo que você pode auditar e estender)

`rules/rules.json`

- `rgi` — as 8 Regras Gerais (mais a RLI) com texto e efeito.
- `notas_legais` — notas por capítulo que mudam o resultado (ex.: Seção XVI Nota 2 sobre partes).
- `armadilhas` (17) — cada uma com `quando`, `materiais?`, `capitulos?`, `candidatos?`,
  `penalizar_prefijos?` e três guardas que evitam falso positivo:
  - `exceto_quando` — desliga a armadilha se a descrição traz um destes termos
    (ex.: “cadeira/estofado” desliga o critério material do Cap. 39, porque assento tem
    posição nominal em 94.01);
  - `nao_quando` — desliga se o item já se anuncia como peça/unidade isolada;
  - as armadilhas **nunca** impõem código: no máximo reordenam e anotam.
- `sinonimos` (359) — apelido comercial → **termos que existem no texto da tabela**
  (`notebook` → “máquina automática para processamento de dados”). Regra de ouro ao editar:
  sinônimo que aponta para frase que a tabela não usa é lixo (os postings são por token) —
  valide co-ocorrência em `data/raw/ncm.json` antes de acrescentar.
- `materiais` / `usos` / `genericas` / `jargao_sem_valor_fiscal` / `palavras_comuns_na_tabela`.

O `pipeline.py` falha a geração se qualquer NCM citada nas regras não existir na tabela — é o
mesmo controle que já pegou um `4011.90.00` inventado.

## Rodando

```bash
cd ncm-agent
npm install
npm run build:dados     # baixar_fontes.py (Siscomex + agregador) e pipeline.py → public/data/*.json
npm run build:reforma   # tabelas da reforma (cClassTrib/IS/alíquotas) + IS por NCM + pipeline
                        # (a parte do IS é 1 request por NCM, ~18 min; retomável se cair)
npm run dev             # http://localhost:3000  (bind 0.0.0.0)
npm test                # suíte completa (motor real, parseCsv do componente, probes)
npm run typecheck
```

Scripts: `fontes`, `dados`, `build:dados`, `reforma`, `build:reforma`, `erp`, `ui:test`, `dev`, `build`,
`start`, `typecheck`, `test`.
`POST /api/atualizar` chama `baixar_fontes.py` (240 s) e `pipeline.py` (180 s) e devolve o
stdout — é o botão da aba 6. `?tipo=reforma` roda `baixar_reforma.py` + `baixar_is.py` + o pipeline.

### Fontes

| Dado | Fonte | Situação |
|---|---|---|
| Tabela NCM (descrição, hierarquia, vigência, ato) | Portal Único Siscomex — `GET /classif/api/publico/nomenclatura/download/json` | **oficial**, sem captcha/autenticação; em `data/raw/siscomex_ncm.json` |
| Atributos do Catálogo de Produtos (CADA/DUIMP) | Portal Único Siscomex — `GET /cadatributos/api/atributo-ncm/download/json` | **oficial** (10.571 linhas) |
| IPI (TIPI), II (TEC + exceções), CEST, CFOP | agregador público de tabelas fiscais | derivada — o app sempre manda conferir o texto legal |
| ICMS por UF, PIS/COFINS | — | **sem fonte pública consolidada**: o app mostra valor de *referência* e exige confirmação |
| Reforma do consumo (CST-IBS/CBS, `cClassTrib`, IS, alíquotas) | dados abertos da Calculadora de Tributos do Consumo (RFB) — `consumo.tributos.gov.br/servico/calcular-tributos-consumo/api/calculadora/dados-abertos` | **oficial**; alternativa: Portal da Conformidade Fácil (SVRS) |
| Direitos antidumping | Resoluções Gecex (publicação no DOU) | **fora do escopo**: sem feed estruturado |

Validação feita na coleta: a tabela do agregador e a do Siscomex batem em **10.515 NCMs de 8
dígitos, zero ausentes, zero inválidos**, “Vigente em 09/09/2026 / Resolução Gecex nº 926/2026”.
**Degradação explícita (verificada).** `baixar_fontes.py` grava `data/raw/fontes.json` com cada
fonte que falhou (e a data do cache aproveitado); o `pipeline.py` publica isso em
`meta.aviso_fontes`, e a aba 6 mostra o alerta “Dados nem frescos — fonte indisponível na última
coleta”. Se a Tabela NCM oficial não estiver na pasta e não der para baixar, o pipeline
**recusa** a geração em vez de montar dataset com dado velho (`FALTA o arquivo ...`).
Testado com rede bloqueada: os 8 avisos de cache saíram no log e a geração parou.
`--forcar` rebaixa tudo ignorando o cache.

## Testes

`node scripts/test.mjs` gera bundles esbuild sobre o **TypeScript real** (`lib/*.ts`) e o
`parseCsv` extraído de `components/Lote.tsx` — nada é reimplementado no teste. Cobre: 13 casos de
classificação com top-1/banda esperados, `taxes()` (`8471.30.12` → IPI 15, II 16, CEST 21.028.00),
CSOSN 101 / CFOP 5.102 e exportação → CST 02, checklist de catálogo, cadeia hierárquica completa,
integridade (10.515 registros, 73.233 referências de atributo sem órfãs), `meta.validacao` /
`meta.aviso_fontes`, lote sobre o CSV de exemplo e os probes de guarda
(split × unidade isolada, kit vago fora da banda alta). 38 asserções no total: **SUÍTES COMPLETAS ✓**.
`npm run ui:test` (`scripts/ui-smoke.mjs` + `scripts/ui-entry.tsx`) monta os **6** componentes num
DOM real (jsdom, com `public/data` servido por `fetch` stub), digita na descrição, troca selects, abre
abas e exige o texto certo entre renders — é o que pega **ordem de hooks** (o React estoura
“Rendered more hooks than during the previous render” e a tela fica branca). `scripts/hookcheck.mjs`
faz a varredura estática da mesma classe de erro (hook depois de `return`/dentro de `if`) e roda dentro
do `npm test`. Controle negativo feito: reintroduzir o bug fez os dois falarem
(`XX Parametrizar.tsx:49 — useMemo() ... depois de um return antecipado` + o erro do React no smoke).

## Para evoluir

1. **ICMS estadual real**: a tabela por UF só existe em legislação (CONFAZ/ajustes) — o caminho é
   ingestão manual por estado + vigência, não scraping. Hoje o bloco diz “referência, confirmar na UF”
   (4% estrangeiro / 12% nacional, EC 87/2015 + Res. SF 22/2019, com nota de FCP na ST interestadual).
2. **TTCE** para imposto de importação calculado no dia: exige token do Portal Único; o payload é
   `{"ncm":"84149039","codigoPais":158,"dataFatoGerador":"AAAA-MM-DD","tipoOperacao":"I"}`.
3. **Ex-tarifário**: hoje é sinalização por NCM-Ex (a tabela oficial não traz código de 9 dígitos) —
   para o valor certo, ligar na lista do Gecex/TEC com vigência.
4. **Histórico/usuário**: `classify()` é pura e o dataset é estático, então login + gravação de
   resultados é camada nova, sem tocar no motor.
