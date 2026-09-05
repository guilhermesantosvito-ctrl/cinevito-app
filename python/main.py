"""Verificador de fontes de vídeo autorizado usado pelo CineVito.

O site analisado carrega filmes por JavaScript e normalmente não entrega um
.mp4 ou .m3u8 no HTML inicial. Por isso, além dos arquivos diretos, o
verificador identifica páginas individuais, iframes e IDs de vídeo. A mesma
regra existe na Edge Function em supabase/functions/verificar-videos.
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

DELIMITADORES_DE_FECHAMENTO = {
    ")": "(",
    "]": "[",
    "}": "{",
}

PONTUACAO_SEPARADORA_FINAL = ".,;:!?"


def remover_pontuacao_separadora(link: str) -> str:
    """Remove pontuação ao redor sem cortar delimitadores válidos da URL."""
    while link:
        ultimo_caractere = link[-1]

        if ultimo_caractere in DELIMITADORES_DE_FECHAMENTO:
            delimitador_abertura = DELIMITADORES_DE_FECHAMENTO[
                ultimo_caractere
            ]

            if link.count(delimitador_abertura) >= link.count(
                ultimo_caractere
            ):
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
        raise ValueError(
            "A URL precisa começar com http:// ou https://."
        )

    if host != DOMINIO_PERMITIDO and not host.endswith(
        f".{DOMINIO_PERMITIDO}"
    ):
        raise ValueError(
            "Por segurança, a análise fica limitada ao domínio "
            "pobreflixtv.city."
        )

    return url_alvo.strip()


def extrair_links_de_video(
    texto_do_site: str,
    url_alvo: str,
) -> list[str]:
    """Encontra links absolutos .mp4/.m3u8."""
    padrao_links = (
        r'https?://[^\s"\'<>]+?\.(?:mp4|m3u8)'
        r'(?:\?[^\s"\'<>#]*)?(?:#[^\s"\'<>]*)?'
    )

    links = [
        remover_pontuacao_separadora(link)
        for link in re.findall(
            padrao_links,
            texto_do_site,
            flags=re.IGNORECASE,
        )
    ]

    caminho_url_alvo = urlsplit(url_alvo).path

    if caminho_url_alvo.lower().endswith((".mp4", ".m3u8")):
        links.append(url_alvo)

    return list(dict.fromkeys(links))


def _url_absoluta(
    valor: str,
    url_base: str,
) -> str | None:
    """Resolve um atributo HTML sem aceitar javascript: ou data:."""
    valor = valor.strip().replace("&amp;", "&")

    if not valor:
        return None

    if valor.lower().startswith(("javascript:", "data:", "#")):
        return None

    if valor.startswith("//"):
        return f"{urlsplit(url_base).scheme}:{valor}"

    if valor.startswith("/"):
        origem = urlsplit(url_base)
        return f"{origem.scheme}://{origem.netloc}{valor}"

    if valor.startswith("http://") or valor.startswith("https://"):
        return valor

    return None


def extrair_candidatos(
    texto_do_site: str,
    url_alvo: str,
) -> list[dict]:
    """Extrai arquivos, embeds e páginas individuais do HTML.

    A home do PobreFlixTV possui cards e IDs de vídeo, mas normalmente
    não possui o servidor final até a navegação para uma página individual.
    """
    candidatos: list[dict] = []
    vistos: set[tuple[str, str]] = set()

    def adicionar(
        url: str,
        tipo: str,
        mensagem: str,
    ) -> None:
        chave = (url, tipo)

        if chave in vistos:
            return

        vistos.add(chave)

        candidatos.append(
            {
                "url": url,
                "tipo": tipo,
                "mensagem": mensagem,
            }
        )

    for link in extrair_links_de_video(texto_do_site, url_alvo):
        adicionar(
            link,
            "video",
            "Arquivo de vídeo encontrado no HTML.",
        )

    for atributo in re.findall(
        r"""<(?:iframe|video|source)[^>]+
        (?:src|data-src)=["']([^"']+)["']""",
        texto_do_site,
        flags=re.IGNORECASE | re.VERBOSE,
    ):
        link = _url_absoluta(atributo, url_alvo)

        if not link:
            continue

        tipo = (
            "video"
            if urlsplit(link).path.lower().endswith(
                (".mp4", ".m3u8")
            )
            else "embed"
        )

        adicionar(
            link,
            tipo,
            (
                "Player incorporado encontrado no HTML."
                if tipo == "embed"
                else "Arquivo de vídeo encontrado no HTML."
            ),
        )

    for pagina in re.findall(
        r"""(?:href|data-url)=["']([^"']*
        (?:/filmes/online/|/series/online/)[^"']+)["']""",
        texto_do_site,
        flags=re.IGNORECASE | re.VERBOSE,
    ):
        link = _url_absoluta(pagina, url_alvo)

        if link:
            adicionar(
                link,
                "pagina",
                (
                    "Página individual encontrada; os servidores são "
                    "carregados ao abrir o título."
                ),
            )

    ids = re.findall(
        r"""data-video-id=["']([^"']+)["']""",
        texto_do_site,
        flags=re.IGNORECASE,
    )

    if ids:
        ids_unicos = list(dict.fromkeys(ids))

        adicionar(
            url_alvo,
            "pagina",
            (
                "ID(s) de vídeo identificado(s): "
                f"{', '.join(ids_unicos)}."
            ),
        )

    return candidatos


def verificar_videos(
    url_alvo: str = URL_ALVO_PADRAO,
) -> dict:
    """Lê uma página e testa cada fonte encontrada."""
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
            "A página alvo respondeu com o código HTTP "
            f"{erro.response.status_code}."
        ) from erro

    except httpx.HTTPError as erro:
        raise RuntimeError(
            f"Erro ao acessar a página alvo: {erro}"
        ) from erro

    candidatos = extrair_candidatos(
        response.text,
        url_alvo,
    )

    resultados = []

    for candidato in candidatos:
        link = candidato["url"]

        if candidato["tipo"] == "pagina":
            resultados.append(
                {
                    **candidato,
                    "status": "identificado",
                    "status_code": None,
                    "mensagem": candidato["mensagem"],
                }
            )
            continue

        try:
            checagem = httpx.head(
                link,
                timeout=5.0,
                follow_redirects=True,
            )

            if checagem.status_code == 200:
                resultados.append(
                    {
                        **candidato,
                        "status": "ativo",
                        "status_code": 200,
                        "mensagem": "Link ativo e funcionando.",
                    }
                )
            else:
                resultados.append(
                    {
                        **candidato,
                        "status": "erro",
                        "status_code": checagem.status_code,
                        "mensagem": "Link respondeu, mas com erro.",
                    }
                )

        except httpx.TimeoutException:
            resultados.append(
                {
                    **candidato,
                    "status": "indisponivel",
                    "status_code": None,
                    "mensagem": (
                        "Tempo limite excedido ao testar o link."
                    ),
                }
            )

        except httpx.HTTPError:
            resultados.append(
                {
                    **candidato,
                    "status": "indisponivel",
                    "status_code": None,
                    "mensagem": "Link quebrado ou fora do ar.",
                }
            )

    return {
        "source_url": url_alvo,
        "links_encontrados": len(resultados),
        "total": len(resultados),
        "links": resultados,
        "resultados": resultados,
    }


def buscar_e_validar(
    url_alvo: str | None = None,
) -> dict | None:
    """Compatibilidade com a função pública do Python original."""
    alvo = url_alvo or URL_ALVO

    try:
        resultado = verificar_videos(alvo)

    except Exception as erro:
        print(f"Erro ao acessar o site alvo: {erro}")
        return None

    print(
        "Encontramos "
        f"{resultado['total']} fonte(s) no HTML analisado."
    )

    for item in resultado["resultados"]:
        link = item["url"]

        print(f"\nTestando o link: {link}")
        print(item["mensagem"])

    return resultado


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Verifica fontes de vídeo autorizadas "
            "do PobreFlixTV."
        )
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

    print(
        "=" * 10
        + " INICIANDO VERIFICADOR CINEVITO "
        + "=" * 10
    )

    print(
        f"Encontramos {resultado['total']} fonte(s)."
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
