# Skill: Revisão de Código e Auditoria OWASP

**Descrição:** Especialidade para inspecionar, revisar e sugerir melhorias de qualidade, legibilidade, arquitetura e blindar contra falhas de segurança seguindo as boas práticas globais.

## Procedimentos Base

1. **Garantia Arquitetural:** Verificar se o `lib/engine.ts` não sofreu "hardcodes" e segue extraindo suas regras do JSON orientado a dados (`rules/rules.json`).
2. **Revisão de Segurança (OWASP 10):**
    - Identificar injeções ou sanitização precária.
    - O validador de entradas deve usar o `zod` de forma estrita.
    - Evitar processamento de PDF ou XML (com `fast-xml-parser` e `pdf-parse`) com entidades externas habilitadas (XXE) e outras vulnerabilidades clássicas.
3. **Análise de Tipagem:** Código Typescript deve ser limpo e isento de "any" desnecessários. O compilador via `npm run typecheck` é mandatário.
4. **Relatórios Server-side:** Monitorar o não reuso/adição de pacotes inseguros em plataformas (ex: `pdfkit`), preferindo o formato plaintext/markdown conforme regra.
5. **Automação Preditiva:** Apontar regressões no momento em que as rules.json ou dependências de API com o `@google/genai` não refletem o formato em `responseSchema`.

**Objetivo Central:** Detectar e antecipar regressões ou falhas de segurança antes do merge em branchs produtivas.
