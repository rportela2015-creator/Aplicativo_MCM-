# Skill: Execução Autônoma e Guarda de Regressão

**Descrição:** Habilidade para aplicar alterações de código no repositório mantendo as regras de integridade e protegendo contra quebras de pipelines/testes.

## Procedimentos Base

1. **Leitura Rigorosa:** Sempre ler os contextos no arquivo `AGENTS.md` e os scripts do projeto.
2. **Respeito aos Test Runner:** Utilizar `npm run test` e não adicionar frameworks de teste como Jest (utilizar `t(name, fn)` e `node:assert/strict`).
3. **Pipeline de Dados:** Caso faça alterações em `rules/rules.json`, sempre rode `python3 scripts/pipeline.py` para reconstruir os datasets de JSON antes de qualquer teste.
4. **Adicionando Testes:** Ao adicionar arquivos de testes, lembrar sempre de adicioná-los ao array inline do `for (const entry of [...])` em `scripts/test.mjs`.
5. **Atualização da UI:** Quando introduzir componentes visuais, sempre atualizar as configurações de smoke test dinamicamente em `scripts/ui-entry.tsx`.
6. **Integridade via Verificação de Tipos:** Sempre rode `npm run typecheck` antes de finalizar e reportar a entrega do pull request.

**Objetivo Central:** Acelerar e dar segurança nas mudanças, garantindo o funcionamento do projeto original sem adicionar dependências estruturais não solicitadas.
