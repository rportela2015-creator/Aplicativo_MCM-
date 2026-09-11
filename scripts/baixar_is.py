#!/usr/bin/env python3
"""Baixa, por NCM, a alíquota do Imposto Seletivo (IS) vigente em 2027 na fonte oficial.

Fonte: dados abertos da Calculadora de Tributos do Consumo (RFB) —
    GET {base}/ncm?data=2027-01-01&ncm=<8 dígitos>
    → {"tributadoPeloImpostoSeletivo": bool, "aliquotaAdValorem": n?, "aliquotaAdRem": n?,
       "unidade": "VN"?, ...}

É 1 requisição por NCM (10.515), com cache incremental e retomada automática: rode de novo
e ele continua de onde parou (`--resumo` mostra o estado). O resultado é gravado em
data/raw/reforma/is_por_ncm.json e consumido por scripts/pipeline.py.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/api/calculadora/dados-abertos/ncm"
DATA = "2027-01-01"
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "reforma"
OUT = RAW / "is_por_ncm.json"
PART = RAW / "is_por_ncm.part.json"
THREADS = int(__import__("os").environ.get("IS_THREADS", "8"))


def todas_ncms() -> list[str]:
    blob = json.loads((ROOT / "public" / "data" / "ncm.json").read_text(encoding="utf-8"))
    return [r["d8"] for r in blob]


FALHAS: list[str] = []


def baixar(códigos: list[str]) -> dict:
    def one(c: str):
        url = f"{BASE}?data={DATA}&ncm={c}"
        for tentativa in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "classificador-ncm/1.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    d = json.loads(r.read().decode("utf-8"))
                return c, {"is": bool(d.get("tributadoPeloImpostoSeletivo")),
                           "adv": d.get("aliquotaAdValorem"), "are": d.get("aliquotaAdRem"),
                           "un": d.get("unidade")}
            except Exception:                                    # noqa: BLE001
                time.sleep(1.2 + tentativa * 2)
        return c, None
    res = {}
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        for i, (c, v) in enumerate(ex.map(one, códigos), 1):
            if v is not None:
                res[c] = v
            if i % 500 == 0:
                if i % 200 == 0:
                print(f"    … {i}/{len(códigos)} → acumulado {len(cache) + len(res)}", flush=True)
    return res


if __name__ == "__main__":
    RAW.mkdir(parents=True, exist_ok=True)
    cache = json.loads(PART.read_text(encoding="utf-8")) if PART.exists() else {}
    todos = todas_ncms()
    falta = [c for c in todos if c not in cache]
    if "--resumo" in sys.argv:
        print(f"cache: {len(cache)}/{len(todos)} | IS=True: "
              f"{sum(1 for v in cache.values() if v['is'])}")
        sys.exit(0)
    limite = int(__import__("os").environ.get("IS_LIMIT", "0"))
    if limite:
        falta = falta[:limite]
    print(f"IS 2027: {len(falta)} NCM(s) faltando de {len(todos)} "
          f"({THREADS} conexões simultâneas)")
    t0 = time.time()
    novo = baixar(falta)
    cache.update(novo)
    PART.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    restam = [c for c in todos if c not in cache]
    print(f"  gravado {len(cache)} registros em {time.time() - t0:.0f}s | restantes {len(restam)} | falhas {len(FALHAS)}")
    if not restam:
        OUT.write_text(json.dumps({"data": DATA, "fonte": BASE, "itens": cache, "falhas": FALHAS[:50]},
                                  ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("  COMPLETO →", OUT)
    else:
        print("  incompleto — rode novamente para retomar")
