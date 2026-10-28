# Diretrizes Globais do Projeto (Agents & Skills)

Este arquivo contém o contexto e regras gerais para agentes IA executarem tarefas neste repositório.

## 1. Arquitetura e Regras de Negócio

- O motor de classificação (`lib/engine.ts`) utiliza um sistema de pontuação em múltiplas camadas baseado em pesquisa de dicionários com stemmers.
- As regras de classificação devem ser sempre estritamente baseadas em dados orientados via o dicionário (`rules/rules.json`). Não codifique textos específicos ou códigos NCM de forma explícita (hardcoded) no algoritmo genérico do motor.

## 2. Tech Stack

- Utilizamos `@google/genai` (SDK nativo do Gemini, atualmente `gemini-3.8-flash`) para geração de IA forçando saídas em JSON via `responseSchema`.
- Relatórios server-side são gerados com texto puro/markdown (substituindo o pdfkit para evitar problemas de compilação no Windows).
- Parser de XML: `fast-xml-parser`.
- Extração de texto em PDFs: `pdf-parse`.
- Validação de entrada e esquema de API: `zod`.

## 3. Diretrizes de UI

- Ao adicionar novos componentes de UI/abas, eles devem ser importados dinamicamente e adicionados no array de testes no arquivo `scripts/ui-entry.tsx` no formato `[Component, 'Tab Name', /regex/i]` para que os testes de fumaça de UI (custom UI smoke tests) os executem adequadamente.

## 4. Testes e Validações

- O projeto usa um test runner customizado e leve usando a sintaxe `t(name, fn)` e `node:assert/strict` para asserções (em vez de frameworks padrão como Jest).
- Módulos internos são acessados nos testes via `import { mods } from 'ncm:libs'`.
- Para executar a suíte de testes: `npm run test` ou `node scripts/test.mjs`.
- Para verificação de tipos TypeScript estática em todo o projeto: `npm run typecheck`.
- **Importante:** Quando um novo arquivo de teste é criado, o caminho dele deve ser explicitamente adicionado no array `entries` do arquivo `scripts/test.mjs` para o test runner customizado conseguir localizá-lo e executá-lo.

## 5. Fluxo de Dados (Pipeline)

- Para reconstruir os datasets de JSON (ex: após modificar `rules/rules.json`), execute `python3 scripts/pipeline.py`. Isso é mandatório antes de rodar os testes se as regras de dados foram alteradas.

## 6. Precedência de Instruções

- Solicitações do usuário sempre substituem instruções das memórias.
- O código atual é a fonte verdadeira do estado do repositório (source of truth). O que está neste arquivo/memória serve de apoio para o contexto histórico.
