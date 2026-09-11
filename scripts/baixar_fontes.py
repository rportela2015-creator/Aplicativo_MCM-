#!/usr/bin/env python3
"""Baixa as fontes (oficiais quando possíveis) em data/raw e normaliza os ZIPs."""
import json
import shutil
from datetime import date
import sys
import urllib.request
import zipfile
from pathlib import Path

FORCAR = "--forcar" in sys.argv
FALHAS: dict[str, str] = {}

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

SISCOMEX = {
    # fonte primária oficial, pública, sem captcha
    "siscomex_ncm.json": "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json",
    "zip_atributos_ncm.zip": "https://portalunico.siscomex.gov.br/cadatributos/api/atributo-ncm/download/json",
    "zip_atributos.zip": "https://portalunico.siscomex.gov.br/cadatributos/api/atributo/download/json",
}
AGG = "https://tabelasfiscais.com.br/public/downloads/{}.json"
AGG_FILES = ["ncm", "tipi", "tec", "cest", "cest_ncm", "cfop"]


def fetch(url, dest, timeout=180, *, rotulo='', cache_usado=None):
    if FORCAR:                                     # `--forcar`: rebaixa tudo, ignora o cache
        pass
    elif dest.exists() and dest.stat().st_size > 1024:
        print(f"  = {dest.name:26s} já existe ({dest.stat().st_size//1024} KB)")
        return True
    req = urllib.request.Request(url, headers={"User-Agent": "classificador-ncm/1.0",
                                              "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
    except Exception as e:                      # rede bloqueada / portal fora do ar
        print(f"  ! {dest.name:26s} FALHOU: {type(e).__name__}: {e}")
        if dest.exists():
            FALHAS[rotulo or dest.name] = f"{type(e).__name__}: {e} (usando cache de {date.fromtimestamp(dest.stat().st_mtime).isoformat()})"
            print(f"    ~ cache local aproveitado — o app vai AVISAR que o dado não é fresco")
        return False
    dest.write_bytes(data)
    print(f"  + {dest.name:26s} {len(data)//1024} KB")
    return True


def unzip_inner(zipname, outname):
    zp = RAW / zipname
    if not zp.exists():
        return
    with zipfile.ZipFile(zp) as z:
        inner = z.namelist()[0]
        (RAW / outname).write_bytes(z.read(inner))
    print(f"  > {outname:26s} extraído de {zipname}")


def main():
    print("Fontes oficiais — Portal Único Siscomex:")
    for k, v in SISCOMEX.items():
        fetch(v, RAW / k, rotulo=k)
    unzip_inner("zip_atributos_ncm.zip", "atributos_por_ncm.json")
    unzip_inner("zip_atributos.zip", "atributos_raw.json")
    if (RAW / "atributos_raw.json").exists():
        blob = json.loads((RAW / "atributos_raw.json").read_text(encoding="utf-8"))
        (RAW / "atributos.json").write_text(
            json.dumps(blob.get("atributos", []), ensure_ascii=False), encoding="utf-8")

    print("Tabelas derivadas (TIPI/TEC/CEST/CFOP):")
    for f in AGG_FILES:
        fetch(AGG.format(f), RAW / f"{f}.json", rotulo=f)

    # registro de degradação lido pelo pipeline.py (vira aviso visível na UI, aba 4)
    (RAW / "fontes.json").write_text(json.dumps({
        "gerado_em": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "falhas": FALHAS,
        "oficial": (RAW / "siscomex_ncm.json").exists(),
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    if FALHAS:
        print("\nAVISO: fonte(s) indisponíveis — o dataset usou cache local:")
        for k, v in FALHAS.items():
            print(f"  ! {k}: {v}")
    if not (RAW / "siscomex_ncm.json").exists():
        print("\nERRO: sem a Tabela NCM oficial — não há como classificar com segurança.", file=sys.stderr)
        return 2
    print("\nOK: fontes em", RAW)
    return 0


if __name__ == "__main__":
    sys.exit(main())
