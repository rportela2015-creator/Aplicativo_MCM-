#!/usr/bin/env python3
"""Baixa as tabelas da Reforma Tributária do Consumo (IBS/CBS/IS) em data/raw/reforma.

Fonte primária: dados abertos da Calculadora de Tributos do Consumo (RFB/SEFaz),
    {base}/calculadora/dados-abertos/...
obtida ao ler o próprio bundle do serviço público (sem autenticação). Fallback:
Portal da Conformidade Fácil (SVRS/SEFAZ-RS), que embute a mesma tabela em JSON na
página /DFE/ClassificacaoTributaria.

Nada aqui é "criado": ou vem do arquivo oficial, ou não entra.
"""
import html
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

BASE = "https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/api/calculadora/dados-abertos"
SVRS = "https://dfe-portal.svrs.rs.gov.br/DFE/ClassificacaoTributaria"
RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "reforma"
RAW.mkdir(parents=True, exist_ok=True)

# datas de corte: 2026 = fase de teste (alíquotas reduzidas, IS sem tabela);
# 2027 = primeiros códigos de IS válidos
DATES = ["2026-01-01", "2027-01-01"]
FALHAS: dict[str, str] = {}


def get(url: str) -> tuple[bool, bytes | str]:
    req = urllib.request.Request(url, headers={"User-Agent": "classificador-ncm/1.0",
                                              "Accept": "application/json, text/html, */*"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return True, r.read()
    except Exception as e:                                    # noqa: BLE001
        FALHAS[url] = f"{type(e).__name__}: {e}"
        return False, ""


def fetch_json(path: str, dest: Path, *, query: str = "") -> bool:
    if dest.exists() and dest.stat().st_size > 8 and "--forcar" not in sys.argv:
        print(f"  = {dest.name:34s} já existe ({dest.stat().st_size // 1024} KB)")
        return True
    ok, blob = get(f"{BASE}{path}?{query}" if query else f"{BASE}{path}")
    if not ok or not blob:
        print(f"  ! {dest.name:34s} FALHOU ({path})")
        return False
    try:
        data = json.loads(blob.decode("utf-8"))
    except Exception:                                          # noqa: BLE001
        FALHAS[path] = "resposta não é JSON"
        print(f"  ! {dest.name:34s} resposta não é JSON")
        return False
    dest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    n = len(data) if isinstance(data, list) else 1
    print(f"  + {dest.name:34s} {n} registro(s) · {dest.stat().st_size // 1024} KB")
    return True


def svrs_tables() -> list[dict] | None:
    """Fallback oficial: a tabela embutida no Portal da Conformidade Fácil (SVRS)."""
    ok, blob = get(SVRS)
    if not ok:
        return None
    t = blob.decode("utf-8", errors="ignore")
    m = re.search(r"var\s+dadosOriginais\s*=\s*", t)
    if not m:
        FALHAS["svrs"] = "não encontrei dadosOriginais na página"
        return None
    i = t.index("[", m.end())
    depth, instr, esc = 0, False, False
    j = i
    while j < len(t):
        c = t[j]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        else:
            if c == '"':
                instr = True
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    return json.loads(t[i:j + 1])
        j += 1
    return None


def main() -> int:
    print("Reforma Tributária do Consumo — dados abertos da Calculadora (RFB):")
    ok = {}
    for d in DATES:
        y = d[:4]
        ok[f"situacoes_cbsibs_{y}"] = fetch_json("/situacoes-tributarias/cbs-ibs", RAW / f"situacoes_cbsibs_{y}.json", query=f"data={d}")
        if y >= "2027":
            ok[f"situacoes_is_{y}"] = fetch_json("/situacoes-tributarias/imposto-seletivo", RAW / f"situacoes_is_{y}.json", query=f"data={d}")
    ok["fundamentacoes_2026"] = fetch_json("/fundamentacoes-legais", RAW / "fundamentacoes_legais.json", query=f"data={DATES[0]}")
    ok["transferencias_cbs"] = fetch_json("/transferencias-cbs", RAW / "transferencias_cbs.json")
    ok["transferencias_ibs"] = fetch_json("/transferencias-ibs", RAW / "transferencias_ibs.json")
    ok["ufs"] = fetch_json("/ufs", RAW / "ufs.json")
    # CBS (União) por ano — a alíquota-padrão que a calculadora usa como referência
    for d in DATES + ["2029-01-01", "2033-01-01"]:
        ok[f"aliquota_uniao_{d[:4]}"] = fetch_json("/aliquota-uniao", RAW / f"aliquota_uniao_{d[:4]}.json", query=f"data={d}")

    # cClassTrib por CST (18 CSTs) — a tabela que o ERP precisa
    print("Tabela cClassTrib (1 por CST):")
    csts = json.loads((RAW / f"situacoes_cbsibs_{DATES[0][:4]}.json").read_text(encoding="utf-8")) \
        if (RAW / f"situacoes_cbsibs_{DATES[0][:4]}.json").exists() else []
    for c in csts:
        code = c["codigo"]
        key = f"classificacoes_cbsibs_{code}"
        fetch_json("/classificacoes-tributarias/cbs-ibs/" + code, RAW / f"{key}.json", query=f"data={DATES[0]}")
    for c in ([] if not (RAW / f"situacoes_is_{DATES[1][:4]}.json").exists()
              else json.loads((RAW / f"situacoes_is_{DATES[1][:4]}.json").read_text(encoding="utf-8"))):
        fetch_json(f"/classificacoes-tributarias/imposto-seletivo/{c['codigo']}",
                   RAW / f"classificacoes_is_{c['codigo']}.json", query=f"data={DATES[1]}")

    # alíquotas de referência por UF (2026 e 2027) — substitui o "chute" de ICMS
    print("Alíquotas de referência IBS por UF:")
    ufs = json.loads((RAW / "ufs.json").read_text(encoding="utf-8")) if (RAW / "ufs.json").exists() else []
    for d in DATES + ["2029-01-01", "2033-01-01"]:
        amostra = []
        for u in ufs:
            ok2, blob = get(f"{BASE}/aliquota-uf?data={d}&codigoUf={u['codigo']}")
            if ok2 and blob:
                try:
                    amostra.append({"uf": u["sigla"], "nome": u["nome"], "codigo": u["codigo"],
                                    "aliquotaReferencia": json.loads(blob.decode())["aliquotaReferencia"]})
                except Exception:                               # noqa: BLE001
                    pass
        if amostra:
            (RAW / f"aliquota_uf_{d[:4]}.json").write_text(json.dumps(amostra, ensure_ascii=False), encoding="utf-8")
            print(f"  + aliquota_uf_{d[:4]}.json{'':16s} {len(amostra)} UFs")

    if not (RAW / f"situacoes_cbsibs_{DATES[0][:4]}.json").exists():
        print("\nERRO: sem as situações tributárias oficiais — não dá para gerar a tabela.", file=sys.stderr)
        return 2

    (RAW / "fontes_reforma.json").write_text(json.dumps({
        "gerado_em": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "base": BASE, "fallback": SVRS, "datas": DATES, "falhas": FALHAS,
        "ok": {k: bool(v) for k, v in ok.items()},
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    if FALHAS:
        print(f"\nAVISO: {len(FALHAS)} requisição(ões) falharam (será usado o que estiver em cache).")
    print("OK: tabelas da reforma em", RAW)
    return 0


if __name__ == "__main__":
    sys.exit(main())
