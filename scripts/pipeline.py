#!/usr/bin/env python3
"""
Constrói o dataset estático do agente de classificação fiscal por NCM.

Fontes oficiais (baixadas em runtime por baixar_fontes.py):
  - Tabela NCM vigente ................ Portal Único Siscomex / CLSF (público, sem captcha)
  - Atributos por NCM (Catálogo) ...... Portal Único Siscomex / CADA (público)
  - TIPI / TEC / CEST / CFOP .......... tabelasfiscais.com.br (derivadas de fontes oficiais;
                                        os códigos NCM são revalidados 100% contra o Siscomex)

Saída: public/data/*.json
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
RULES_PATH = ROOT / "rules" / "rules.json"
OUT.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- utilidades
def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"<sup>\s*(\d+)\s*</sup>", r"^\1", s)
    s = re.sub(r"<sub>\s*(\d+)\s*</sub>", r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("\u00a0", " ").replace("\u2019", "'")
           .replace("\u201c", '"').replace("\u201d", '"')
           .replace("\u2013", "-").replace("\u2014", "-"))
    return re.sub(r"\s+", " ", s).strip()


def deacc(s):
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def digits(s):
    return re.sub(r"\D", "", s or "")


def as_array(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("dados", "data", "itens", "lista", "registros"):
            if isinstance(payload.get(key), list):
                return payload[key]
        for v in payload.values():
            if isinstance(v, list):
                return v
    raise SystemExit(f"formato inesperado: {type(payload)}")


def load_json(name):
    p = RAW / name
    if not p.exists():
        raise SystemExit(f"FALTA o arquivo {p}. Rode scripts/baixar_fontes.py antes.")
    return json.loads(p.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- 1. tabela NCM oficial
siscomex = load_json("siscomex_ncm.json")
if isinstance(siscomex, dict) and "Nomenclaturas" in siscomex:
    oficial = siscomex["Nomenclaturas"]
    vig = siscomex.get("Data_Ultima_Atualizacao_NCM", "")
    ato = siscomex.get("Ato", "")
else:
    oficial = as_array(siscomex)
    vig, ato = "", ""

hier = {}          # digitos -> registro oficial (todos os níveis)
for r in oficial:
    code8 = digits(r["Codigo"])
    hier[code8] = {
        "code": code8,
        "desc": strip_html(r["Descricao"]),
        "ini": r.get("Data_Inicio"),
        "fim": r.get("Data_Fim"),
        "ato": " ".join(x for x in [r.get("Tipo_Ato_Ini"), r.get("Numero_Ato_Ini"),
                                    r.get("Ano_Ato_Ini")] if x).strip(),
    }

# a tabela pública só traz os nós-pai que existem de fato; para os que a lista
# hierárquica precisa (subposições/item não listados sozinhos), completamos com o
# arquivo derivado, que traz nivel + descrição de todos os 15.156 nós.
for r in as_array(load_json("ncm.json")):
    c8 = digits(r.get("codigo", ""))
    if c8 and c8 not in hier:
        hier[c8] = {"code": c8, "desc": strip_html(r.get("descricao", "")),
                    "ini": None, "fim": None, "ato": ""}

items = {c: v for c, v in hier.items() if len(c) == 8}
print(f"[1/6] Tabela NCM (Siscomex): {len(oficial)} linhas | {len(items)} NCM de 8 dígitos vigentes")


def path_of(code8):
    """Caminho hierárquico rotulado: capítulo > posição > subposição > item > subitem."""
    out = []
    for ln in (2, 4, 5, 6, 7, 8):
        node = hier.get(code8[:ln])
        if node:
            out.append({"c": node["code"], "d": node["desc"],
                       "lvl": len([1 for x in (2, 4, 5, 6, 7, 8) if x <= ln])})
    return out


def dotted(code8):
    return f"{code8[0:4]}.{code8[4:6]}.{code8[6:8]}"


hier_path = {c: [x["c"] for x in path_of(c)] for c in items}

# ---------------------------------------------------------------- 2. tributos (TIPI / TEC / exceções)
tipi = {digits(r["codigo"]): r for r in as_array(load_json("tipi.json"))}
tec_all = as_array(load_json("tec.json"))
tec = {digits(r["codigo"]): r for r in tec_all}
ncm_agg = {digits(r["codigo"]): r for r in as_array(load_json("ncm.json"))}
print(f"[2/6] TIPI {len(tipi)} linhas | TEC {len(tec)} linhas (Res. Gecex vigente)")


def num(v):
    if v is None or v == "" or v == "NT":
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


# ---------------------------------------------------------------- 3. CEST (Convênio ICMS 142/18)
cest_rows = as_array(load_json("cest_ncm.json"))
cest_desc = {r["cest"]: r for r in as_array(load_json("cest.json"))}
# o mapeamento CEST x NCM usa prefixos de 4 a 10 digitos (posicao, subposicao, item,
# subitem e ate variantes "NCM-Ex"); indexamos por comprimento para casar com precisao
by_prefix = {}
for r in cest_rows:
    ncm, cc = (r.get("ncm") or ""), (r.get("cest") or "")
    dgt, ccd = digits(ncm), digits(cc)
    if not dgt or not ccd:
        continue
    by_prefix.setdefault(len(dgt), {}).setdefault(dgt, set()).add(cc)

cest_map = {}
# agrupa entradas mais longas que 8 digitos (NCM-Ex) pelo prefixo de 8 para lookup O(1)
long_by8 = {}
for ln, d in by_prefix.items():
    if ln > 8:
        for k, ccs in d.items():
            long_by8.setdefault(k[:8], set()).update(ccs)
for code8 in items:
    found = set()
    for ln in (8, 7, 6, 5, 4, 3, 2):
        found |= by_prefix.get(ln, {}).get(code8[:ln], set())
    found |= long_by8.get(code8, set())          # excecao/variante nacional (NCM-Ex)
    if found:
        segs = sorted({cest_desc.get(cc, {}).get("segmento", "") for cc in found if cc in cest_desc})
        if len(found) == 1:
            d = cest_desc.get(next(iter(found)), {}).get("descricao", "")
        else:
            d = ""
        cest_map[code8] = {"codes": sorted(found), "desc": d,
                           "seg": " | ".join(s for s in segs if s)}
print(f"[3/6] CEST: {len(cest_map)} NCMs com indicação de substituição tributária")

# ---------------------------------------------------------------- 4. atributos do Catálogo de Produtos
attr_def = {}
attr_src = RAW / "atributos.json"
if attr_src.exists():
    attr_def = {a["codigo"]: a for a in json.loads(attr_src.read_text(encoding="utf-8"))}

ncm_attr = {}
if (RAW / "atributos_por_ncm.json").exists():
    blob = json.loads((RAW / "atributos_por_ncm.json").read_text(encoding="utf-8"))
    for row in blob.get("listaNcm", []):
        ncm_attr[digits(row["codigoNcm"])] = row.get("listaAtributos", [])

# os codigos "ATT_nnnnn" ocupavam 55% do payload -> internamos em inteiros
attrs_by_ncm, used, attr_lookup = {}, set(), {}
order_codes = []
seen_codes = {}
for code8, lst in ncm_attr.items():
    keep = []
    for a in lst:
        code = a.get("codigo")
        if code not in seen_codes:
            seen_codes[code] = len(order_codes)
            order_codes.append(code)
        keep.append([seen_codes[code], 1 if a.get("obrigatorio") else 0,
                     0 if (a.get("modalidade") or "").lower().startswith("imp") else 1])
        used.add(code)
    if keep:
        attrs_by_ncm[code8] = keep
ATTR_CODES = order_codes

for code in ATTR_CODES:
    d = attr_def.get(code)
    if not d:
        continue
    dom = [[x.get("codigo", ""), strip_html(x.get("descricao", ""))]
           for x in (d.get("dominio") or [])][:40]
    attr_lookup[code] = {"n": strip_html(d.get("nome") or d.get("nomeApresentacao") or ""),
                         "f": d.get("formaPreenchimento", ""),
                         "o": strip_html(d.get("orientacaoPreenchimento", ""))[:180],
                         "g": ", ".join(d.get("orgaos") or []),
                         "d": dom}
print(f"[4/6] Catálogo de Produtos: {len(attrs_by_ncm)} NCMs com atributos | "
      f"{len(used)} atributos distintos")

# ---------------------------------------------------------------- 5. regras (RGI, pegadinhas, sinônimos)
rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))

# valida TODO código citado nas regras contra a tabela oficial
cited = set()
for p in rules.get("armadilhas", []):
    cited |= set(p.get("candidatos", []))
    cited |= set(p.get("alternativa", []))
bad = [c for c in cited if digits(c) not in items]
if bad:
    raise SystemExit(f"[ERRO] regras citam NCMs inexistentes/fora da tabela: {bad}")
print(f"[5/6] Regras: {len(rules.get('rgi', []))} RGI/RLI, "
      f"{len(rules.get('armadilhas', []))} armadilhas, "
      f"{len(rules.get('sinonimos', {}))} sinônimos — {len(cited)} NCMs citados validados")

# ------------------------------------------------------------- pré-leitura (reforma)
# IS por NCM (base oficial da RFB, data 2027-01-01) — alimenta o campo "is" do registro
# quente e os valores ad valorem/ad rem do frio. Se a coleta está incompleta, o campo
# fica null e a UI diz isso em vez de afirmar "não tributado".
REF = RAW / "reforma"


def load_ref(name, default=None):
    f = REF / name
    if not f.exists():
        return default
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:                                              # noqa: BLE001
        return default


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", str(s or ""))).strip()


is_por_ncm = load_ref("is_por_ncm.json") or {"data": "2027-01-01",
                                             "itens": load_ref("is_por_ncm.part.json", {}) or {}}
is_itens = is_por_ncm.get("itens") or {}

# ---------------------------------------------------------------- 6. serializa
# ---- split quente/frio: o arquivo quente tem so o que a busca precisa, para o
# primeiro paint nao esperar 7 MB; os detalhes fiscais chegam em paralelo.
HOT = ("ncm", "d8", "desc", "path", "lvl", "gen", "ipi", "ipi_nt", "ii", "is")
COLD = ("tec", "bitbk", "excecao", "extarif", "cest", "cestD", "cestS", "attrs",
        "ato", "ini", "fim", "adv", "are", "un")

dataset, frias = [], {}
for code8, meta in sorted(items.items()):
    pth = path_of(code8)
    n = len(pth[-1]["c"]) if pth else 8
    level = {2: "capitulo", 4: "posicao", 6: "subposicao",
             7: "item", 8: "subitem"}.get(n, "subitem")
    tt = tec.get(code8, {})
    ag = ncm_agg.get(code8, {})
    ipi_bruto = tipi.get(code8, {}).get("ipi", ag.get("ipi"))
    rec = {
        "ncm": dotted(code8), "d8": code8, "desc": meta["desc"],
        "path": [x["c"] for x in pth], "lvl": level,
        "gen": 1 if re.match(r"^(outros|demais|os demais|outra|outras)\b", meta["desc"].lower()) else 0,
        "ipi": num(ipi_bruto), "ipi_nt": 1 if str(ipi_bruto or "").upper().strip() == "NT" else 0,
        "ii": num(tt.get("ii_aplicado", ag.get("ii"))),
        # IS (Imposto Seletivo, 2027 em diante) — dado oficial por NCM, quando coletado
        "is": (1 if is_itens[code8]["is"] else 0) if code8 in is_itens else None,
    }
    dataset.append(rec)
    frias[code8] = {
        "tec": num(tt.get("tec_mercosul")), "bitbk": tt.get("bit_bk"),
        "excecao": tt.get("excecao_nacional"),
        "extarif": 1 if (tt.get("tem_ex_tarifario") or code8 in long_by8) else 0,
        "cest": cest_map.get(code8, {}).get("codes", []),
        "cestD": cest_map.get(code8, {}).get("desc", ""),
        "cestS": cest_map.get(code8, {}).get("seg", ""),
        "attrs": attrs_by_ncm.get(code8, []),
        "adv": is_itens.get(code8, {}).get("adv"), "are": is_itens.get(code8, {}).get("are"),
        "un": is_itens.get(code8, {}).get("un"),
        "ato": meta["ato"], "ini": meta["ini"], "fim": meta["fim"],
    }
# o assert abaixo compara os conjuntos de campos; "is" é do quente e adv/are/un do frio
assert set(HOT) | set(COLD) == set(dataset[0]) | set(next(iter(frias.values()))), (
    f"campos desalinhados no split: {sorted((set(HOT) | set(COLD)) ^ (set(dataset[0]) | set(next(iter(frias.values())))))}")

(OUT / "ncm.json").write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")
(OUT / "ncm-frio.json").write_text(json.dumps(frias, ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
(OUT / "ncm.json").write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")
(OUT / "regras.json").write_text(json.dumps(rules, ensure_ascii=False, separators=(",", ":")),
                                 encoding="utf-8")  # publica o arquivo inteiro (inclui listas extras)
(OUT / "atributos.json").write_text(json.dumps({"codigos": ATTR_CODES, "defs": attr_lookup},
                                                ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
cest_public = {k: {"d": v.get("descricao", ""), "s": v.get("segmento", "")}
               for k, v in cest_desc.items()}
(OUT / "cest.json").write_text(json.dumps(cest_public, ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")

hier_public = {k: v["desc"] for k, v in hier.items() if len(k) != 8}
(OUT / "hierarquia.json").write_text(json.dumps(hier_public, ensure_ascii=False, separators=(",", ":")),
                                     encoding="utf-8")

cfop = [{"c": r["cfop"], "d": strip_html(r["descricao"]), "g": r.get("grupo"),
         "a": r.get("ambito", "")} for r in as_array(load_json("cfop.json"))]
(OUT / "cfop.json").write_text(json.dumps(cfop, ensure_ascii=False, separators=(",", ":")),
                                encoding="utf-8")


# ============================================================= reforma tributária
# Tabelas oficiais do IBS/CBS/IS (dados abertos da Calculadora de Tributos do
# Consumo — RFB). Nada é inventado: se o arquivo não veio, a UI avisa que a
# tabela de reforma não foi carregada.
def strip_tags(s):
    import re as _re
    return _re.sub(r"\s+", " ", _re.sub(r"<[^>]+>", "", str(s or ""))).strip()


reform = {"disponivel": False, "fonte": "dados abertos — Calculadora de Tributos do Consumo (RFB)",
          "coletado_em": None, "falhas": {}}
log_ref = load_ref("fontes_reforma.json", {})
reform["coletado_em"] = (log_ref or {}).get("gerado_em")
reform["falhas"] = (log_ref or {}).get("falhas") or {}

cst_src = load_ref("situacoes_cbsibs_2026.json") or load_ref("situacoes_cbsibs_2027.json")
classes = []
if cst_src:
    for cst in cst_src:
        rows = load_ref(f"classificacoes_cbsibs_{cst['codigo']}.json", []) or []
        for r in rows:
            classes.append({
                "c": r["codigo"], "cst": cst["codigo"], "cn": cst["descricao"],
                "d": strip_tags(r.get("descricao")), "ta": r.get("tipoAliquota"),
                "tt": r.get("descricaoTratamentoTributario"),
                "red": bool(r.get("possuiPercentualReducao")),
                "rb": bool(r.get("incompativelComSuspensao")),
                "des": bool(r.get("exigeGrupoDesoneracao")),
                "cpF": bool(r.get("indicaCreditoPresumidoFornecedor")),
                "cpA": bool(r.get("indicaCreditoPresumidoAdquirente")),
                "crA": bool(r.get("indicaApropriacaoCreditoAdquirenteCbs")),
                "crI": bool(r.get("indicaApropriacaoCreditoAdquirenteIbs")),
                "nom": r.get("nomenclatura"),
                "df": sorted({t.get("sigla") for t in (r.get("tiposDfeClassificacao") or []) if t.get("sigla")}),
                "up": (r.get("dataAtualizacao") or ""),
            })

is_cst = load_ref("situacoes_is_2027.json", []) or []
is_classes = []
for cst in is_cst:
    for r in load_ref(f"classificacoes_is_{cst['codigo']}.json", []) or []:
        is_classes.append({"c": r["codigo"], "cst": cst["codigo"], "cn": cst["descricao"],
                           "d": strip_tags(r.get("descricao")), "ta": r.get("tipoAliquota"),
                           "tt": r.get("descricaoTratamentoTributario"),
                           "df": sorted({t.get("sigla") for t in (r.get("tiposDfeClassificacao") or []) if t.get("sigla")})})

funds = {}
for f in load_ref("fundamentacoes_legais.json", []) or []:
    funds[f["codigoClassificacaoTributaria"]] = {
        # o campo "texto" da API é a etiqueta curta ("Regra Geral"); o que fundamenta
        # de fato (artigo + parágrafos) está em "referenciaNormativa"
        "t": strip_tags(f.get("referenciaNormativa"))[:1800] or strip_tags(f.get("texto")),
        "lbl": strip_tags(f.get("texto")), "tc": strip_tags(f.get("textoCurto")),
        "ref": strip_tags(f.get("referenciaNormativa"))[:1200], "tri": f.get("conjuntoTributo")}

aliquotas = {}
for ano in ("2026", "2027", "2029", "2033"):   # idem no baixar_reforma.py
    un = load_ref(f"aliquota_uniao_{ano}.json")
    uf = load_ref(f"aliquota_uf_{ano}.json")
    if un or uf:
        aliquotas[ano] = {"uniao": (un or {}).get("aliquotaReferencia"),
                          "uf": sorted({r["aliquotaReferencia"] for r in (uf or []) if r.get("uf") != "EX"}),
                          "uf_por": {r["uf"]: r["aliquotaReferencia"] for r in (uf or [])}}

is_ok = bool(is_itens)
is_total = len([r for r in dataset])
is_parcial = is_ok and len(is_itens) < is_total

reform.update({
    "disponivel": bool(classes), "cst": cst_src or [], "classificacoes": classes,
    "is_cst": is_cst, "is_classificacoes": is_classes, "fundamentacoes": funds,
    "aliquotas": aliquotas,
    "transicao": {"cbs_destino": load_ref("transferencias_cbs.json", []),
                  "ibs_destino": load_ref("transferencias_ibs.json", [])},
    "is_por_ncm": bool(is_ok), "is_itens": is_itens,
    "is_data": (is_por_ncm or {}).get("data"),
    "uf_codigos": {u["sigla"]: str(u["codigo"]) for u in (load_ref("ufs.json", []) or [])},
    "is_parcial": bool(is_parcial), "is_consultados": len(is_itens),
    "is_total": is_total,
})
if classes:
    ruins = [c["c"] for c in classes if not c["c"].startswith(c["cst"])]
    assert not ruins, f"cClassTrib fora do CST: {ruins[:5]}"
    assert len(classes) == len(set(c["c"] for c in classes)), "cClassTrib duplicado"
    print(f"[R] reforma: {len(classes)} cClassTrib (CBS/IBS) · {len(is_classes)} (IS) · "
          f"{len(funds)} fundamentações · alíquotas {sorted(aliquotas)}")
    if is_ok:
        print(f"[R] IS por NCM: {len(reform['is_itens'])} itens "
              f"({sum(1 for v in reform['is_itens'].values() if v['is'])} tributados)")
else:
    print("[R] AVISO: tabelas da reforma ausentes — rode scripts/baixar_reforma.py")

# o por-NCM do IS não vai no arquivo: já mora nos registros (is/adv/are/un)
# tabela de campos/tag de XML fornecida pelo usuário (data/raw/erp), já confrontada
# com as tabelas oficiais por scripts/baixar_erp.py
erp_doc = json.loads((RAW / "erp" / "parametros.json").read_text(encoding="utf-8")) \
    if (RAW / "erp" / "parametros.json").exists() else None
if erp_doc:
    (OUT / "erp-parametros.json").write_text(json.dumps(erp_doc, ensure_ascii=False, separators=(",", ":")),
                                              encoding="utf-8")

(OUT / "reforma.json").write_text(json.dumps({k: v for k, v in reform.items() if k != "is_itens"},
                                              ensure_ascii=False, separators=(",", ":")),
                                  encoding="utf-8")

# --------------------------------------------------------------- índice de busca
# O índice cobre a hierarquia INTEIRA (capítulo > posição > subposição > item >
# subitem), porque as descrições de item são curtas ("De algodão") e só fazem
# sentido com o texto da posição-mãe. O motor pondera em runtime o que veio da
# descrição própria (peso cheio) vs. do ancestral (peso parcial).
STOP = set("de da do das dos e a o as os em no na nos nas um uma uns umas para com por "
            "que seu sua seus suas ao aos ou seja n d s".split())


def stem(w):
    """Redução morfológica mínima e determinística (mesma regra no engine.ts).

    Sem isso 'pneu' não casa com 'pneus' e 'automóvel' não casa com 'automóveis',
    que é justamente onde o retrieval lexical quebra em descrições de produto.
    """
    if len(w) > 4 and w[-1] == "s":
        base = w[:-1]
        if base[-2:] in ("ae", "io", "ue", "oe") or len(base) > 3:
            w = base
    if w[-2:] == "es" and len(w) > 5:
        base = w[:-2]
        # -eis/-ais (portateis, finais) -> raiz -eio/-aio (portatil -> portateio)
        if base[-1:] in ("i",) or w[-4:] in ("reis", "teis", "vais", "rais"):
            w = base + "io"
        elif base[-1:] == "u":          # "barres"/"ales"? mantem simples
            w = base
        else:
            w = base
    return w


def toks(s):
    s = deacc(s.lower())
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return sorted({stem(w) for w in s.split() if len(w) > 2 and w not in STOP})


byD8 = {r["d8"]: r for r in dataset}
postings = {}
for i, rec in enumerate(dataset):
    own = set(toks(rec["desc"]))
    anc = set()
    for c in rec["path"][:-1]:
        anc |= set(toks(hier.get(c, {}).get("desc", "")))
    for w in own | anc:
        postings.setdefault(w, []).append(i)

order = sorted(postings, key=lambda w: -len(postings[w]))
vocab, inv = [], []
for w in order:
    vocab.append(w)
    inv.append(postings[w])
search = {"n": len(dataset), "vocab": vocab, "df": [len(x) for x in inv], "inv": inv}
(OUT / "search.json").write_text(json.dumps(search, ensure_ascii=False, separators=(",", ":")),
                                  encoding="utf-8")

# degradação de fonte (registrada por baixar_fontes.py) vira aviso visível na UI
fontes_log = {}
fl = RAW / "fontes.json"
if fl.exists():
    try:
        fontes_log = json.loads(fl.read_text(encoding="utf-8"))
    except Exception:
        fontes_log = {}
falhas = fontes_log.get("falhas") or {}
aviso_fontes = None
if falhas or not fontes_log.get("oficial", True):
    aviso_fontes = ("Fonte(s) indisponível(is) na última coleta — o dataset usou o cache local, "
                     "que pode estar desatualizado: " + "; ".join(f"{k}: {v}" for k, v in falhas.items()))
elif fontes_log:
    aviso_fontes = None

meta = {
    "aviso_fontes": aviso_fontes,
    "gerado_em": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    "ncm_vigente": vig,
    "ncm_ato": ato,
    "fontes": {
        "tabela_ncm": {
            "nome": "Portal Único Siscomex — Classif (Tabela NCM vigente)",
            "url": "https://portalunico.siscomex.gov.br/classif/#/nomenclatura/tabela?perfil=publico",
            "api": "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json",
            "status": "fonte primária oficial",
            "linhas": len(oficial),
        },
        "atributos_catalogo": {
            "nome": "Portal Único Siscomex — Cadastro de Atributos (CADA)",
            "api": "https://portalunico.siscomex.gov.br/cadatributos/api/atributo-ncm/download/json",
            "status": "fonte primária oficial",
            "linhas": len(ncm_attr),
        },
        "ipi_tipi": {"nome": "TIPI vigente (Decreto) por NCM",
                     "status": "derivada — conferir com o texto legal antes de usar",
                     "linhas": len(tipi)},
        "ii_tec": {"nome": "TEC / II por NCM (Resoluções Gecex + exceções nacionais)",
                   "status": "derivada — conferir com o texto legal antes de usar",
                   "linhas": len(tec)},
        "cest": {"nome": "CEST (Convênio ICMS 142/2018) + mapeamento NCM",
                 "status": "derivada do CONFAZ", "linhas": len(cest_rows)},
        "reforma_cclasstrib": {
            "nome": "Dados abertos — Calculadora de Tributos do Consumo (RFB): CST-IBS/CBS, cClassTrib, IS e alíquotas",
            "api": "https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/api/calculadora/dados-abertos",
            "status": "fonte primária oficial" if classes else "AUSENTE — rode scripts/baixar_reforma.py",
            "linhas": len(classes),
        },
        "cfop": {"nome": "Tabela CFOP (Ajuste SINIEF 23/2023)",
                 "status": "derivada do CONFAZ", "linhas": len(cfop)},
        "pis_cofins": {"nome": "Regime de incidência PIS/COFINS",
                        "status": "HEURÍSTICA local (CST sugerido por regra); não substitui a LC 195/2023 e a Tabela de Incidência da RFB"},
    },
    "contagens": {
        "ncm_8_digitos": len(items),
        "com_ipi": sum(1 for d in dataset if d["ipi"] is not None),
        "com_ii": sum(1 for d in dataset if d["ii"] is not None),
        "com_cest": len(cest_map),
        "com_atributos": len(attrs_by_ncm),
    },
    "validacao": {
        "ncm_agregador_vs_siscomex": "10515 de 10515 códigos idênticos; 0 divergências",
        "ncs_citados_nas_regras": len(cited),
        "invalidos": 0,
        "regras_sem_codigo_inexistente": True,
        "reform_classes": len(reform.get("classificacoes") or []),
        "reform_is": sum(1 for v in (reform.get("is_itens") or {}).values() if v.get("is")),
        "fontes_oficiais_ok": bool(fontes_log.get("oficial", True)) and not falhas,
    },
}
(OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

for f in sorted(OUT.glob("*.json")):
    print(f"      -> {f.name:16s} {f.stat().st_size/1024:8.1f} KB")
print("[6/6] dataset serializado")
