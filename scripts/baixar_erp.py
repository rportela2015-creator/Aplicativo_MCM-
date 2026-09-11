#!/usr/bin/env python3
"""Normaliza a tabela de "Códigos e Parâmetros dos Documentos Fiscais (NF-e e NFS-e)"
fornecida pelo usuário em data/raw/erp/*.csv e a confronta com as tabelas OFICIAIS
que o app já baixou (cClassTrib/CST da RFB e Tabela NCM do Siscomex).

Saída: data/raw/erp/parametros.json   (consumido por scripts/pipeline.py)

Cada linha recebe um selo de confiabilidade, porque a planilha é compilada e traz
linhas marcadas "Inferred"/"Not in source":
  oficial     — o exemplo é um código que existe na tabela oficial correspondente
  derivada    — texto descritivo, sem código para confrontar
  duvidoso    — o exemplo NÃO consta na tabela oficial / tem formato inválido
"""
import csv
import hashlib
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
ERPD = RAW / "erp"
OUT = ERPD / "parametros.json"
CSV_GLOB = sorted(ERPD.glob("*.csv"))


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def tag_de(campo: str) -> str:
    """'NF-e (Modelo 55)' -> 'NF-e' ; 'CST 000' -> 'CST' ; 'cClassTrib LC' -> 'cClassTrib'"""
    c = norm(campo)
    m = re.match(r"^([A-Za-zÀ-ÿ0-9_\-./]+)", c)
    tag = m.group(1) if m else c
    return tag.rstrip("().,")


def exemplo_codigos(txt: str) -> list[str]:
    """extrai códigos candidatos do campo 'Exemplo' (000001, 55, 8471.30.12, 1 (Sim)…)"""
    t = norm(txt)
    out = re.findall(r"\b\d{4}\.\d{2}\.\d{2}\b|\b\d{6}\b|\b\d{3}\b|\b\d{2}\b", t)
    return [x.replace(".", "") for x in out]


def main() -> int:
    if not CSV_GLOB:
        print("nenhum CSV em data/raw/erp — nada a normalizar")
        return 0
    csv_path = CSV_GLOB[0]

    # tabelas oficiais para o confronto
    ref = json.loads((ROOT / "public" / "data" / "reforma.json").read_text(encoding="utf-8")) \
        if (ROOT / "public" / "data" / "reforma.json").exists() else {}
    cclasstrib = {c["c"] for c in (ref.get("classificacoes") or [])}
    cclass_is = {c["c"] for c in (ref.get("is_classificacoes") or [])}
    csts = {c["codigo"] for c in (ref.get("cst") or [])}
    cfops = set()
    if (ROOT / "public" / "data" / "cfop.json").exists():
        cfops = {re.sub(r"\D", "", r["c"]) for r in json.loads((ROOT / "public" / "data" / "cfop.json").read_text(encoding="utf-8"))}
    ncm8 = set()
    if (ROOT / "public" / "data" / "ncm.json").exists():
        ncm8 = {r["d8"] for r in json.loads((ROOT / "public" / "data" / "ncm.json").read_text(encoding="utf-8"))}

    rows = list(csv.reader(io.StringIO(csv_path.read_text(encoding="utf-8-sig"))))
    head, corpo = rows[0], rows[1:]
    itens, vistos = [], set()
    for r in corpo:
        if len(r) < 5 or not norm(r[0]):
            continue
        campo, desc, tipo, tam, ex = (norm(x) for x in r[:5])
        fonte = norm(r[5]) if len(r) > 5 else ""
        tag = tag_de(campo)
        cods = exemplo_codigos(ex)
        eh_classtrib = "classtrib" in tag.lower().replace("-", "")
        inferido = "inferred" in (tam + " " + fonte).lower() or "not in source" in (tam + " " + fonte).lower()
        confere = (any(re.match(r"^\d{8}$", c) and c in ncm8 for c in cods)
                   or any(c in cclasstrib or c in cclass_is for c in cods if len(c) == 6)
                   or any(len(c) == 3 and c in csts for c in cods)
                   or any(len(c) == 4 and c in cfops for c in cods))
        selo, nota = ("oficial", "exemplo confere com a tabela oficial correspondente") if confere else ("derivada", "")
        if cclasstrib and any(c in cclasstrib for c in cods if len(c) == 6):
            selo, nota = "oficial", "cClassTrib confere com a tabela oficial da RFB"
        elif any(re.match(r"^\d{8}$", c) and c in ncm8 for c in cods):
            selo, nota = "oficial", "NCM confere com a Tabela NCM vigente"
        elif any(len(c) == 3 and c in csts for c in cods):
            selo, nota = "oficial", "CST-IBS/CBS confere com a tabela oficial"
        elif inferido:
            selo, nota = "inferido", "linha marcada como inferida/sem origem declarada na fonte consultada"
        elif eh_classtrib and cclasstrib and any(len(c) == 6 for c in cods):
            if not any(c in cclasstrib or c in cclass_is for c in cods if len(c) == 6):
                selo, nota = "duvidoso", "exemplo de cClassTrib não consta na tabela oficial da RFB"
        chave = (tag, desc[:70], ex[:24])
        if chave in vistos:
            continue
        vistos.add(chave)
        itens.append({
            "tag": tag, "campo": campo, "desc": desc, "tipo": tipo,
            "tam": tam, "ex": ex, "fonte": fonte, "selo": selo, "nota": nota,
            "inferido": inferido,
            "cods": [c for c in cods if len(c) in (2, 3, 4, 6, 8)][:6],
        })

    cont = {k: sum(1 for i in itens if i["selo"] == k)
            for k in ("oficial", "derivada", "inferido", "duvidoso")}
    doc = {
        "arquivo": csv_path.name,
        "sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest()[:16],
        "cabecalho": [norm(x) for x in head][:6],
        "linhas": len(itens),
        "contagens": cont,
        "itens": itens,
        "aviso": ("Tabela compilada pelo usuário a partir de fontes secundárias — não é esquema oficial. "
                  "Os campos marcados 'duvidoso' têm exemplo que não bate com a tabela oficial; "
                  "vale o XSD do Portal Nacional da NF-e (NT 2025.002) como referência de validação."),
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[E] tabela de parâmetros: {len(itens)} linhas úteis de {len(corpo)} "
          f"(oficial {cont['oficial']} · derivada {cont['derivada']} · inferido {cont['inferido']} "
          f"· duvidoso {cont['duvidoso']}) → {OUT.name}")
    if cont["duvidoso"]:
        for i in [x for x in itens if x["selo"] == "duvidoso"][:6]:
            print(f"    ! {i['tag']} ex='{i['ex'][:22]}' — {i['nota']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
