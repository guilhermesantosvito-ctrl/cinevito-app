"""Verificador de links de vídeo usado pelo CineVito.

Este é o Python original reorganizado para ser reutilizável localmente.
O painel web chama a Edge Function equivalente em
supabase/functions/verificar-videos, porque HTML/Netlify não executam
Python diretamente no navegador.
"""

from __future__ import annotations

import argparse
import json
import re
from urllib.parse import urlsplit

import httpx

DOMINIO_PERMITIDO = "pobreflixtv.city"
URL_ALVO_PADRAO = "https://www.pobreflixtv.city/"
# Mantido como alias para compatibilidade com o script Python original.
URL_ALVO = URL_ALVO_PADRAO
DELIMITADORES_DE_FECHAMENTO = {")": "(", "]": "[", "}": "{"}
PONTUACAO_SEPARADORA_FINAL = ".,;:!?"


def remover_pontuacao_separadora(link: str) -> str:
    """Remove pontuação ao redor sem cortar delimitadores válidos da URL."""
    while link:
        ultimo_caractere = link[-1]

        if ultimo_caractere in DELIMITADORES_DE_FECHAMENTO:
            delimitador_abertura = DELIMITADORES_DE_FECHAMENTO[ultimo_caractere]
            if link.count(delimitador_abertura) >= link.count(ultimo_caractere):
                break
            link = link[:-1]
            continue

        if ultimo_caractere in PONTUACAO_SEPARADORA_FINAL:
            link = link[:-1]
            continue

        break

    return link


def validar_url_alvo(url_alvo: str) -> str:
    """Valida a origem para evitar que o verificador vire um proxy aberto."""
    partes = urlsplit(url_alvo.strip())
    host = (partes.hostname or "").lower()

    if partes.scheme not in {"http", "https"}:
        raise ValueError("A URL precisa começar com http:// ou https://.")

    if host != DOMINIO_PERMITIDO and not host.endswith(f".{DOMINIO_PERMITIDO}"):
        raise ValueError("A análise fica limitada ao domínio pobreflixtv.city.")

    return url_alvo.strip()


def extrair_links_de_video(texto_do_site: str, url_alvo: str) -> list[str]:
    """Encontra links absolutos .mp4/.m3u8 e remove pontuação externa."""
    padrao_links = (
        r'https?://[^\s"\'<>]+?\.(?:mp4|m3u8)'
        r'(?:\?[^\s"\'<>#]*)?(?:#[^\s"\'<>]*)?'
    )

    links = [
        remover_pontuacao_separadora(link)
        for link in re.findall(padrao_links, texto_do_site, flags=re.IGNORECASE)
    ]

    caminho_url_alvo = urlsplit(url_alvo).path

    if caminho_url_alvo.lower().endswith((".mp4", ".m3u8")):
        links.append(url_alvo)

    return list(dict.fromkeys(links))


def verificar_videos(url_alvo: str = URL_ALVO_PADRAO) -> dict:
    """Lê uma página e testa cada link de vídeo encontrado."""
    url_alvo = validar_url_alvo(url_alvo)

    try:
        response = httpx.get(
            url_alvo,
            timeout=10.0,
            follow_redirects=True,
        )
        response.raise_for_status()

    except httpx.TimeoutException as erro:
        raise RuntimeError(
            "Tempo limite excedido ao acessar a página alvo."
        ) from erro

    except httpx.HTTPStatusError as erro:
        raise RuntimeError(
            f"A página alvo respondeu com o código HTTP "
            f"{erro.response.status_code}."
        ) from erro

    except httpx.HTTPError as erro:
        raise RuntimeError(
            f"Erro ao acessar a página alvo: {erro}"
        ) from erro

    links = extrair_links_de_video(response.text, url_alvo)
    resultados = []

    for link in links:
        try:
            checagem = httpx.head(
                link,
                timeout=5.0,
                follow_redirects=True,
            )

            if checagem.status_code == 200:
                resultados.append(
                    {
                        "url": link,
                        "status": "ativo",
                        "status_code": 200,
                        "mensagem": "Link ativo e funcionando.",
                    }
                )
            else:
                resultados.append(
                    {
                        "url": link,
                        "status": "erro",
                        "status_code": checagem.status_code,
                        "mensagem": "Link respondeu, mas com erro.",
                    }
                )

        except httpx.TimeoutException:
            resultados.append(
                {
                    "url": link,
                    "status": "indisponivel",
                    "status_code": None,
                    "mensagem": "Tempo limite excedido ao testar o link.",
                }
            )

        except httpx.HTTPError:
            resultados.append(
                {
                    "url": link,
                    "status": "indisponivel",
                    "status_code": None,
                    "mensagem": "Link quebrado ou fora do ar.",
                }
            )

    return {
        "source_url": url_alvo,
        "links_encontrados": len(links),
        "resultados": resultados,
    }


def buscar_e_validar(url_alvo: str | None = None) -> dict | None:
    """Compatibilidade com a função pública do Python original.

    Esta entrada mantém o comportamento de console do script recebido. A
    interface web usa ``verificar_videos`` através da Edge Function, que
    aplica a validação de domínio antes de fazer a requisição.
    """
    alvo = url_alvo or URL_ALVO

    try:
        response = httpx.get(
            alvo,
            timeout=10.0,
            follow_redirects=True,
        )
        links = extrair_links_de_video(response.text, alvo)

    except httpx.TimeoutException:
        print("❌ Tempo limite excedido ao acessar o site alvo.")
        return None

    except Exception as erro:
        print(f"❌ Erro ao acessar o site alvo: {erro}")
        return None

    print(f"🔍 Encontramos {len(links)} link(s) de vídeo no texto do site.")

    resultados = []

    for link in links:
        print(f"\n⚡ Testando o link: {link}")

        try:
            checagem = httpx.head(
                link,
                timeout=5.0,
                follow_redirects=True,
            )

            if checagem.status_code == 200:
                print("✅ LINK ATIVO E FUNCIONANDO! (Código HTTP 200)")
                resultados.append(
                    {
                        "url": link,
                        "status": "ativo",
                        "status_code": 200,
                    }
                )
            else:
                print(
                    "⚠️ Link respondeu, mas com erro. "
                    f"Código: {checagem.status_code}"
                )
                resultados.append(
                    {
                        "url": link,
                        "status": "erro",
                        "status_code": checagem.status_code,
                    }
                )

        except Exception:
            print("❌ Link quebrado ou fora do ar.")
            resultados.append(
                {
                    "url": link,
                    "status": "indisponivel",
                    "status_code": None,
                }
            )

    return {
        "source_url": alvo,
        "links_encontrados": len(links),
        "resultados": resultados,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verifica links .mp4 e .m3u8."
    )

    parser.add_argument(
        "--url",
        default=URL_ALVO_PADRAO,
        help="Página pobreflixtv.city para analisar.",
    )

    parser.add_argument(
        "--json",
        action="store_true",
        help="Imprime o resultado em JSON.",
    )

    args = parser.parse_args()
    resultado = verificar_videos(args.url)

    if args.json:
        print(
            json.dumps(
                resultado,
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    print("=" * 10 + " INICIANDO SCRAPER ONLINE " + "=" * 10)
    print(
        f"Encontramos {resultado['links_encontrados']} "
        "link(s) de vídeo."
    )

    for item in resultado["resultados"]:
        codigo = (
            f" (HTTP {item['status_code']})"
            if item["status_code"]
            else ""
        )

        print(
            f"{item['url']}: "
            f"{item['mensagem']}{codigo}"
        )


if __name__ == "__main__":
    main()
