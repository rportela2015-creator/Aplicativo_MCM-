/**
 * Entrada do `scripts/ui-smoke.mjs`: monta cada componente em um DOM de verdade (jsdom),
 * com o dataset real servido de public/data, e verifica o comportamento entre renders.
 * Não é importado pelo app — só pelo bundle do smoke.
 */
/**
 * O jsdom tem de existir ANTES de `react-dom/client` ser carregado: o React decide
 * `canUseDOM`/`isInputEventSupported` na carga do módulo — sem isso ele cai no polyfill
 * de IE e todo `dispatchEvent('input')` quebra (attachEvent is not a function).
 * Por isso tudo é importado dinamicamente, depois do bootstrap.
 */
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window as any;
const g = globalThis as any;
g.window = w; g.document = w.document; g.navigator = w.navigator;
for (const k of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'InputEvent',
  'Event', 'MouseEvent', 'FocusEvent', 'KeyboardEvent', 'CustomEvent', 'Node', 'Text', 'DocumentFragment',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser', 'XMLSerializer']) g[k] = w[k] ?? g[k];
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

// os dados do build, servidos como o navegador os pediria
g.fetch = async (u: any) => {
  const rel = String(typeof u === 'string' ? u : u.url).replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
  try {
    const buf = await readFile(process.cwd() + '/public/' + rel);
    return new Response(buf, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch { return new Response('{}', { status: 404 }); }
};

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const Classificar = (await import('../components/Classificar')).default;
const Lote = (await import('../components/Lote')).default;
const ConsultaTab = (await import('../components/Consultar')).default;
const Parametrizar = (await import('../components/Parametrizar')).default;
const ReformaTab = (await import('../components/Reforma')).default;
const Regras = (await import('../components/Regras')).default;

let falhas = 0;
const avisos: string[] = [];
const erroOriginal = console.error;
(console as any).error = (...a: any[]) => { avisos.push(a.map(String).join(' ')); erroOriginal(...a); };
const ok = (cond: boolean, msg: string, detalhe = '') => {
  if (cond) console.log('OK  ' + msg);
  else { falhas++; console.log('XX  ' + msg + (detalhe ? '\n    ' + detalhe.slice(0, 220) : '')); }
};
const espera = async (ms = 40) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

async function montar(C: any) {
  const host = w.document.createElement('div');
  w.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(C)); });
  await espera(); await espera();          // efeitos + fetch do dataset
  return { host, root, txt: () => String(host.textContent || '') };
}
/** escreve num input/textarea como o usuário (o setter nativo engana o dedupe de valor do React) */
const digitar = (el: any, v: string) => {
  const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement : el.tagName === 'SELECT' ? w.HTMLSelectElement : w.HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, v);
  const ev = w.InputEvent && el.tagName !== 'SELECT'
    ? new w.InputEvent('input', { bubbles: true, data: v, inputType: 'insertReplacementText' })
    : new w.Event('input', { bubbles: true });
  el.dispatchEvent(ev);
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const escolher = (sel: any, v: string) => {
  Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value')!.set!.call(sel, v);
  sel.dispatchEvent(new w.Event('change', { bubbles: true, composed: true }));
};
/** o <input>/<select> de um <label class="field"> pelo texto do rótulo */
const porRotulo = (host: any, re: RegExp) => {
  const alvo = [...host.querySelectorAll('label.field')].find((l: any) => re.test(l.querySelector('span')?.textContent || ''));
  return alvo ? (alvo.querySelector('input,textarea,select')) : null;
};
const clicar = async (el: any) => {
  await act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
  await espera(30);
};

// ---------------------------------------------------------------- 1 · Classificar
{
  const c = await montar(Classificar);
  ok(/descri[çc][ãa]o da mercadoria/i.test(c.txt()), 'Classificar: formulário renderiza');
  const ta = c.host.querySelector('textarea') || c.host.querySelector('input');
  ok(!!ta, 'Classificar: há campo de descrição');
  if (ta) {
    await act(async () => { digitar(ta, 'cadeira giratória de escritório estofada em polipropileno'); });
    await espera(80);
    ok(/9401/.test(c.txt()), 'Classificar: classifica ao digitar (9401.31.00 na tela)');
    ok(/Reforma tribut[áa]ria do consumo/i.test(c.txt()), 'Classificar: bloco da reforma no resultado');
    ok(/parametrizar no ERP/i.test(c.txt()), 'Classificar: atalho para a parametrização de ERP');
    const detalhe = [...c.host.querySelectorAll('button')].find((b: any) => /fundamentação/.test(b.textContent || ''));
    if (detalhe) {
      await clicar(detalhe);
      ok(/parametriza[çc][ãa]o|Catálogo/i.test(c.txt()), 'Classificar: abrir detalhes mostra parametrização/catálogo');
    } else ok(false, 'Classificar: botão de detalhes ausente');
  }
  c.root.unmount(); c.host.remove();
}

// ---------------------------------------------------------------- 4 · Parametrizar (novo)
{
  const c = await montar(Parametrizar);
  ok(/Parametriza[çc][ãa]o de ERP/i.test(c.txt()), 'Parametrizar: título');
  const selects = [...c.host.querySelectorAll('select')];
  ok(selects.length >= 6, 'Parametrizar: selects de cadastro/operação', `selects=${selects.length}`);
  ok(c.host.querySelectorAll('input').length >= 5, 'Parametrizar: campos de CNPJ/IE/município/NCM');

  // sem CNPJ, a conferência de schema tem de gritar — e a tela continuar montada
  ok(/emit\/CNPJ/.test(c.txt()), 'Parametrizar: CNPJ vazio apontado na conferência');
  ok(/bloqueante/.test(c.txt()), 'Parametrizar: resumo conta bloqueantes');

  // digitar CNPJ válido → re-render (ordem de hooks) mantém a tela e resolve o erro
  const cnpj = porRotulo(c.host, /CNPJ/);
  ok(!!cnpj, 'Parametrizar: campo de CNPJ encontrado pelo rótulo');
  await act(async () => { digitar(cnpj, '11.222.333/0001-81'); });
  await espera(40);
  ok(/11222333000181/.test(c.txt()), 'Parametrizar: CNPJ digitado aparece no emit/CNPJ');
  ok(/d[íi]gitos verificadores conferem/.test(c.txt()), 'Parametrizar: validador de CNPJ aceita o número');

  // códigos oficiais no resultado
  ok(/NCM/.test(c.txt()) && /cClassTrib/.test(c.txt()), 'Parametrizar: NCM e cClassTrib nos códigos');
  const pre = c.host.querySelector('pre');
  ok(!!pre, 'Parametrizar: maqueta de XML presente');
  ok(/<NCM>\d{8}<\/NCM>/.test(pre?.textContent || ''), 'Parametrizar: <NCM> preenchido com 8 dígitos',
    (pre?.textContent || '').slice(0, 200));
  ok(/<cClassTrib>\d{6}<\/cClassTrib>/.test(pre?.textContent || ''), 'Parametrizar: <cClassTrib> de 6 dígitos');
  ok(/<ide>|<emit>/.test(pre?.textContent || ''), 'Parametrizar: blocos ide/emit na maqueta');

  // modelo 65 (NFC-e) com indFinal=0 → erro específico, sem quebrar
  const selModelo = porRotulo(c.host, /Modelo/) as any;
  await act(async () => { escolher(selModelo, '65'); });
  await espera(40);
  ok(/NFC-e/.test(c.txt()), 'Parametrizar: trocar para NFC-e reflete na tela');

  // cClassTrib inventado → precisa ser barrado pela conferência
  const cc = porRotulo(c.host, /cClassTrib/);
  if (cc) {
    await act(async () => { digitar(cc, '999999'); });
    await espera(40);
    ok(/999999 não consta na tabela oficial/.test(c.txt()),
      'Parametrizar: cClassTrib fora da tabela oficial é rejeitado na conferência', c.txt().slice(0, 200));
    await act(async () => { digitar(cc, '000001'); });
    await espera(40);
    ok(/000001 existe na tabela oficial/.test(c.txt()), 'Parametrizar: cClassTrib válido confirmado pela tabela');
  } else ok(false, 'Parametrizar: campo de cClassTrib manual ausente');

  // Simples Nacional → CRT 1 + regApIBSCBSSN no emit
  const selRegime = porRotulo(c.host, /Regime tribut[áa]rio/) as any;
  if (selRegime) {
    await act(async () => { escolher(selRegime, 'simples'); });
    await espera(40);
    ok(/regApIBSCBSSN/.test(c.txt()), 'Parametrizar: Simples Nacional traz o regime de apuração IBS/CBS');
    ok(/CSOSN/.test(c.txt()), 'Parametrizar: Simples usa CSOSN em vez de CST de ICMS');
  } else ok(false, 'Parametrizar: select de regime ausente');

  // aba da tabela de campos (planilha do usuário)
  const abas = [...c.host.querySelectorAll('.tab')] as any[];
  const abaTabela = abas.find((b) => /planilha/i.test(b.textContent || ''));
  ok(!!abaTabela, 'Parametrizar: aba da tabela de campos existe');
  if (abaTabela) {
    await clicar(abaTabela);
    ok(/linhas/.test(c.txt()) && /selo|oficial/i.test(c.txt()), 'Parametrizar: tabela publicada com selos de origem',
      c.txt().slice(0, 200));
    const busca = [...c.host.querySelectorAll('input')].find((i: any) => /tag, descri/.test(i.placeholder || '')) as any;
    if (busca) {
      await act(async () => { digitar(busca, 'cClassTrib'); });
      await espera(30);
      ok(/cClassTrib/.test(c.txt()), 'Parametrizar: busca na planilha filtra por tag');
    } else ok(false, 'Parametrizar: campo de busca da planilha ausente');
  }
  c.root.unmount(); c.host.remove();
}

// ---------------------------------------------------------------- os demais componentes
for (const [C, nome, re] of [
  [Lote, 'Lote', /lote|CSV/i],
  [ConsultaTab, 'Consultar', /consultar|tabela NCM/i],
  [ReformaTab, 'Reforma (aba)', /cClassTrib|reforma/i],
  [Regras, 'Regras e fontes', /fontes|regras/i],
] as [any, string, RegExp][]) {
  const c = await montar(C);
  ok(re.test(c.txt()) && c.txt().length > 120, `${nome}: renderiza com dados`, c.txt().slice(0, 140));
  c.root.unmount(); c.host.remove();
}

// aviso de "not wrapped in act" é artefato do ambiente (promessa que resolve depois do
// unmount) — o que importa aqui é ordem de hook, key e erro de render
const ruins = avisos.filter((a) => /hook|Rendered more|Rendered fewer|should have a key|unmounted component|Cannot read|is not a function|Minified React error/i.test(a)
  && !/Could not parse CSS|Not implemented/i.test(a));
ok(ruins.length === 0, 'React: nenhum aviso de hook/key/estado entre renders', ruins.slice(0, 2).join(' | '));

console.log(falhas === 0
  ? '\nUI SMOKE OK ✓ (componentes montados, atualizados e desmontados em DOM real)'
  : `\nUI SMOKE: ${falhas} problema(s)`);
w.close();
process.exit(falhas === 0 ? 0 : 1);
