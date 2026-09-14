#!/usr/bin/env python3
"""
botyoucine.py — Bot para renovar URLs de streaming do YouCine

Lê a lista de filmes de filmes_youcine.json, acessa cada página,
extrai a playUrl fresca com Playwright, e salva no Supabase.
"""

import os
import sys
import json
import time
import logging
import re
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from playwright.sync_api import sync_playwright, Browser, Page
from supabase import create_client, Client

import httpx

# ────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("botyoucine")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
YOUCINE_EMAIL = os.environ.get("YOUCINE_EMAIL", "")
YOUCINE_PASSWORD = os.environ.get("YOUCINE_PASSWORD", "")
YOUCINE_BASE_URL = os.environ.get("YOUCINE_BASE_URL", "https://vocêcine.tv")

# Arquivo de lista de filmes (JSON estático)
FILMES_LIST_FILE = os.environ.get("FILMES_LIST_FILE", "filmes_youcine.json")

# Quantos filmes por execução
LIMIT_FILMES = int(os.environ.get("LIMIT_FILMES", "50"))

# Delay entre filmes
DELAY_FILMES = float(os.environ.get("DELAY_FILMES", "5.0"))

# Modo debug (não atualiza Supabase)
MODO_DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

# Efetua login nas 2 primeiras execucoes apenas
DEFAULT_SESSION_EXPIRY_HOURS = 168  # 7 dias

# ────────────────────────────────────────────────
# INIT
# ────────────────────────────────────────────────

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def criar_tabelas():
    """
    Observação: as tabelas devem ser criadas antes de rodar o bot.
    Use o arquivo supabase_schema.sql no SQL Editor do Supabase:
    https://cefyzitdkvtynhwsxdvv.supabase.co/editor

    Esta função apenas verifica se as tabelas existem e loga o resultado.
    Não cria tabelas automaticamente porque a API REST do Supabase
    não suporta CREATE TABLE via RPC.
    """
    tabelas_necessarias = [
        "youcine_filmes",
        "youcine_session",
        "youcine_execucoes",
    ]

    for nome_tabela in tabelas_necessarias:
        try:
            resp = supabase.table(nome_tabela).select("*").limit(1).execute()
            logger.info(f"Tabela '{nome_tabela}' existe e é acessível")
        except Exception as e:
            logger.error(f"Tabela '{nome_tabela}' não está acessível: {e}")
            logger.error(f"Recomendação: execute o SQL em supabase_schema.sql primeiro")


def salvar_cookies(page: Page):
    """Salva os cookies do navegador no Supabase."""
    cookies = page.context.cookies()
    cookies_json = json.dumps(cookies)
    try:
        supabase.from_("youcine_session").delete().gt("id", "0").execute()
        supabase.from_("youcine_session").insert({"cookies_json": cookies_json}).execute()
        logger.info(f"Cookies salvos: {len(cookies)} cookies")
    except Exception as e:
        logger.warning(f"Falha ao salvar cookies: {e}")


def carregar_cookies(page: Page) -> bool:
    """Tenta carregar cookies salvos. Retorna True se encontrou."""
    try:
        resp = supabase.from_("youcine_session").select("cookies_json").limit(1).execute()
        if resp.data and resp.data[0]["cookies_json"]:
            cookies = json.loads(resp.data[0]["cookies_json"])
            page.context.add_cookies(cookies)
            logger.info(f"Cookies carregados: {len(cookies)} cookies")
            return True
    except Exception:
        pass
    return False


def fazer_login(page: Page) -> bool:
    """
    Faz login no YouCine via Playwright.
    Retorna True se logado com sucesso.
    """
    logger.info("Fazendo login no YouCine...")

    page.goto(YOUCINE_BASE_URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_load_state("networkidle", timeout=15000)

    # Se já logado, não faz nada
    login_buttons = page.locator('text=Entrar')
    if login_buttons.count() == 0:
        logger.info("Já está logado (sem botão Entrar visível)")
        return True

    # Clica em Entrar
    page.locator('button:has-text("Entrar")').first.click()
    page.wait_for_timeout(1500)

    # Preenche email
    email_input = page.locator('input[type="email"], input[type="text"]').first
    email_input.fill(YOUCINE_EMAIL)
    page.wait_for_timeout(500)

    # Preenche senha
    password_input = page.locator('input[type="password"]').first
    password_input.fill(YOUCINE_PASSWORD)
    page.wait_for_timeout(500)

    # Clica login
    page.locator('button:has-text("Entrar")').first.click()
    page.wait_for_timeout(3000)

    # Verifica se logado
    page.wait_for_load_state("networkidle", timeout=15000)

    if page.locator('text=Entrar').count() > 0:
        logger.warning("Possível falha no login")
        return False

    logger.info("Login realizado com sucesso!")
    return True


def extrair_inicial_state(page: Page) -> Optional[Dict[str, Any]]:
    """Extrai window.__INITIAL_STATE__ da página."""
    page.wait_for_timeout(2000)

    state = page.evaluate("""() => {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            if (script.textContent && script.textContent.includes('__INITIAL_STATE__')) {
                try {
                    const match = script.textContent.match(/window\\.__INITIAL_STATE__\\s*=\\s*(\\{[\s\S]*?\\});/);
                    if (match) return JSON.parse(match[1]);
                } catch (e) {}
            }
        }
        if (window.__INITIAL_STATE__) {
            return window.__INITIAL_STATE__;
        }
        return null;
    }""")

    if state:
        logger.info(f"Estado extraído: {list(state.keys())}")
        return state
    logger.warning("Não encontrou INITIAL_STATE")
    return None


def extrair_play_url(state: Dict[str, Any]) -> Optional[str]:
    """Extrai a playUrl do estado."""
    try:
        detail = state.get("detail", {})
        play_url = detail.get("playUrl", "")
        if play_url:
            logger.info(f"Play URL encontrada: {play_url[:80]}...")
            return play_url
    except Exception as e:
        logger.error(f"Erro ao extrair playUrl: {e}")
    return None


def extrair_data_expiracao(play_url: str) -> Optional[datetime]:
    """Extrai a data de expiração da URL."""
    try:
        decoded = urllib.parse.unquote(play_url)
        match = re.search(r"[?&]expired=(\d+)", decoded)
        if match:
            timestamp = int(match.group(1))
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            logger.info(f"Expira em: {dt}")
            return dt
    except Exception as e:
        logger.debug(f"Erro extraindo expiração: {e}")
    return None


def extrair_capas(state: Dict[str, Any]) -> Optional[str]:
    """Extrai URL da imagem de capa/post banner."""
    try:
        detail = state.get("detail", {})
        asset = detail.get("assetData", {})
        poster_list = asset.get("posterList", [])
        for poster in poster_list:
            if poster.get("fileType") == "poster" and poster.get("fileUrl"):
                logger.info(f"Capa extraída: {poster['fileUrl'][:80]}...")
                return poster["fileUrl"]
            if poster.get("fileType") == "stage" and poster.get("fileUrl"):
                logger.info(f"Stage extraído: {poster['fileUrl'][:80]}...")
                return poster["fileUrl"]
    except Exception as e:
        logger.debug(f"Erro extraindo capas: {e}")
    return None


def verificar_url_http(url: str) -> bool:
    """Verifica se a URL de stream responde (HEAD request)."""
    try:
        resp = httpx.head(
            url,
            follow_redirects=True,
            timeout=10.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": YOUCINE_BASE_URL + "/",
            },
        )
        if resp.status_code == 200:
            logger.info(f"URL válida: status {resp.status_code}")
            return True
        elif resp.status_code == 404:
            logger.warning(f"URL expirada: status {resp.status_code}")
            return False
        else:
            logger.info(f"URL com status inesperado: {resp.status_code} — considerando válida")
            return True
    except Exception as e:
        logger.error(f"Erro ao verificar URL: {e}")
        return False


# ────────────────────────────────────────────────
# LEITURA DA LISTA DE FILMES (JSON ESTÁTICO)
# ────────────────────────────────────────────────

def ler_lista_filmes() -> List[Dict[str, Any]]:
    """Lê filmes_youcine.json e retorna a lista."""
    try:
        with open(FILMES_LIST_FILE, "r") as f:
            data = json.load(f)
        return data.get("filmes", [])
    except Exception as e:
        logger.error(f"Erro lendo {FILMES_LIST_FILE}: {e}")
        return []


def buscar_filmes_supabase() -> List[Dict[str, Any]]:
    """Busca filmes já cadastrados no Supabase para renovação."""
    try:
        resp = supabase.table("youcine_filmes") \
            .select("*") \
            .eq("ativo", True) \
            .order("play_url_ultima_requisicao", ascending=True) \
            .limit(LIMIT_FILMES) \
            .execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Erro buscando filmes no Supabase: {e}")
        return []


# ────────────────────────────────────────────────
# ATUALIZAÇÃO NO SUPABASE
# ────────────────────────────────────────────────

def atualizar_filme(filme_id: str, play_url: str, data_expiracao: Optional[datetime],
                     status: str, metadados: Optional[Dict] = None):
    """Atualiza as informações do filme no Supabase."""
    try:
        data = {
            "play_url_atual": play_url,
            "play_url_expira_em": data_expiracao.isoformat() if data_expiracao else None,
            "play_url_ultima_requisicao": datetime.now(timezone.utc).isoformat(),
            "play_url_status": status,
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
        }
        if metadados:
            if metadados.get("titulo"):
                data["titulo"] = metadados["titulo"]
            if metadados.get("imagem_capa"):
                data["imagem_capa"] = metadados["imagem_capa"]
            if metadados.get("content_id"):
                data["content_id"] = metadados["content_id"]

        supabase.table("youcine_filmes").update(data).eq("id", filme_id).execute()
        logger.info(f"Filme {filme_id[:8]}... atualizado: status={status}")
    except Exception as e:
        logger.error(f"Erro ao atualizar filme {filme_id}: {e}")


def inserir_filme(
    titulo: str,
    url_page: str,
    content_id: Optional[str] = None,
    play_url: Optional[str] = None,
    data_expiracao: Optional[datetime] = None,
    imagem_capa: Optional[str] = None,
) -> Optional[str]:
    """Insere um novo filme na tabela youcine_filmes. Retorna o ID."""
    try:
        data = {
            "titulo": titulo,
            "url_page": url_page,
            "content_id": content_id,
            "play_url_atual": play_url,
            "play_url_expira_em": data_expiracao.isoformat() if data_expiracao else None,
            "play_url_ultima_requisicao": datetime.now(timezone.utc).isoformat(),
            "play_url_status": "ok" if play_url else "pending",
            "imagem_capa": imagem_capa or "",
            "ativo": True,
            "criado_em": datetime.now(timezone.utc).isoformat(),
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
        }
        resp = supabase.table("youcine_filmes").insert(data).execute()
        logger.info(f"Novo filme inserido: {resp.data[0]['id'][:8]}...")
        return resp.data[0]["id"]
    except Exception as e:
        logger.error(f"Erro ao inserir filme: {e}")
        return None


# ────────────────────────────────────────────────
# PROCESSAMENTO
# ────────────────────────────────────────────────

def processar_filme_pagina(filme: Dict[str, Any], page: Page) -> bool:
    """Acessa a página, extrai playUrl, atualiza no Supabase."""
    url_page = filme.get("url_page", "")
    filme_id = filme.get("id", "")

    logger.info(f"Processando: {filme.get('titulo', url_page)} [{url_page}]")

    if not url_page:
        logger.warning(f"Sem URL para {filme_id}")
        atualizar_filme(filme_id or "novo", "", None, "erro_sem_url")
        return False

    try:
        page.goto(url_page, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=15000)

        state = extrair_inicial_state(page)
        if not state:
            logger.error(f"Não encontrou INITIAL_STATE para {url_page}")
            atualizar_filme(filme_id or "novo", "", None, "erro_sem_estado")
            return False

        play_url = extrair_play_url(state)
        if not play_url:
            logger.error(f"Sem playUrl para {url_page}")
            atualizar_filme(filme_id or "novo", "", None, "erro_sem_playurl")
            return False

        data_expiracao = extrair_data_expiracao(play_url)

        metadados = {
            "titulo": state.get("detail", {}).get("assetData", {}).get("name", ""),
            "content_id": state.get("detail", {}).get("assetData", {}).get("contentId", ""),
            "imagem_capa": extrair_capas(state) or "",
        }

        if filme_id:
            atualizar_filme(filme_id, play_url, data_expiracao, "ok", metadados)
            logger.info(f"✅ Atualizado: {metadados['titulo']}")
        else:
            novo_id = inserir_filme(
                titulo=metadados["titulo"],
                url_page=url_page,
                content_id=metadados["content_id"],
                play_url=play_url,
                data_expiracao=data_expiracao,
                imagem_capa=metadados["imagem_capa"],
            )
            logger.info(f"✅ Inserido novo: {novo_id[:8] if novo_id else '??'}")

        return True

    except Exception as e:
        logger.error(f"Erro processando {url_page}: {e}")
        atualizar_filme(filme_id or "novo", "", None, f"erro: {str(e)[:100]}")
        return False


def verificar_e_renovar(filme: Dict[str, Any], page: Page) -> bool:
    """
    Verifica se a URL atual do filme ainda é válida.
    Se não, renova acessando a página.
    """
    play_url = filme.get("play_url_atual", "")

    if not play_url:
        logger.info(f"Sem URL — renovando: {filme.get('titulo')}")
        return processar_filme_pagina(filme, page)

    logger.info(f"Verificando URL atual: {play_url[:80]}...")

    # Verificar data de expiração
    data_expiracao_str = filme.get("play_url_expira_em")
    data_expiracao = None
    if data_expiracao_str:
        try:
            data_expiracao = datetime.fromisoformat(data_expiracao_str.replace("Z", "+00:00"))
        except:
            pass

    if data_expiracao:
        tempo_restante = data_expiracao - datetime.now(timezone.utc)
        if tempo_restante.total_seconds() > 2700:  # 45 min de margem
            logger.info(f"URL válida por {int(tempo_restante.total_seconds()/60)} min — pulando")
            return True

    # Verificar via HTTP HEAD
    if not verificar_url_http(play_url):
        logger.info("URL expirou (HTTP 404) — renovando...")
        return processar_filme_pagina(filme, page)

    logger.info("URL ainda responde HTTP 200")
    return True


# ────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────

def registrar_execucao(status: str, filmes_ok: int, filmes_falhos: int, mensagem: str = ""):
    """Registra a execução no Supabase."""
    try:
        supabase.table("youcine_execucoes").insert({
            "status": status,
            "filmes_processados": filmes_ok,
            "filmes_falhos": filmes_falhos,
            "mensagem": mensagem,
            "fim": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning(f"Falha ao registrar execução: {e}")


def main():
    logger.info("=" * 60)
    logger.info("botyoucine.py iniciado")
    logger.info(f"MODO: {'DEBUG' if MODO_DEBUG else 'PRODUÇÃO'}")
    logger.info(f"ARQUIVO FILME LISTA: {FILMES_LIST_FILE}")
    logger.info("=" * 60)

    criar_tabelas()

    # Iniciar execução
    try:
        exec_id = supabase.table("youcine_execucoes").insert({
            "status": "rodando",
            "inicio": datetime.now(timezone.utc).isoformat(),
            "filmes_processados": 0,
            "filmes_falhos": 0,
        }).execute()
        exec_id_str = exec_id.data[0]["id"] if exec_id.data else "local"
        logger.info(f"Execução: {exec_id_str}")
    except Exception as e:
        logger.warning(f"Falha ao registrar execução: {e}")
        exec_id_str = "local"

    browser = None
    page = None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--window-size=1920,1080",
                ],
            )
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            page = context.new_page()

            # Carrega cookies salvos
            if not carregar_cookies(page):
                logger.info("Nenhum cookie salvo — será necessário login")
                if not fazer_login(page):
                    logger.error("Falha no login")
                    registrar_execucao("falhou_login", 0, 0, "Falha no login")
                    return
                salvar_cookies(page)

            # Lê lista de filmes do arquivo JSON
            filmes_do_arquivo = ler_lista_filmes()
            logger.info(f"Filmes no arquivo JSON: {len(filmes_do_arquivo)}")

            # Carrega filmes do Supabase (para verificar renovação)
            filmes_supabase = buscar_filmes_supabase()
            logger.info(f"Filmes no Supabase: {len(filmes_supabase)}")

            # Combinar: prioriza os do Supabase que precisam renovação
            # (play_url_status = 'pending' ou 'ok' mas próximo de expirar)

            # Processa do arquivo JSON primeiro (para inserir/ atualizar)
            todos_filmes = filmes_do_arquivo[:LIMIT_FILMES]

            filmes_ok = 0
            filmes_falhos = 0

            for i, filme in enumerate(todos_filmes):
                logger.info(f"[{i+1}/{len(todos_filmes)}] Processando...")

                # Se já existe no Supabase, verificar renovação
                filme_supabase = None
                if filme.get("content_id"):
                    try:
                        resp = supabase.table("youcine_filmes") \
                            .select("*") \
                            .eq("content_id", filme["content_id"]) \
                            .execute()
                        if resp.data:
                            filme_supabase = resp.data[0]
                    except:
                        pass

                if filme_supabase:
                    sucesso = verificar_e_renovar(filme_supabase, page)
                    if sucesso:
                        filmes_ok += 1
                    else:
                        filmes_falhos += 1
                else:
                    sucesso = processar_filme_pagina(filme, page)
                    if sucesso:
                        filmes_ok += 1
                    else:
                        filmes_falhos += 1

                # Delay entre filmes
                if i < len(todos_filmes) - 1:
                    logger.info(f"Aguardando {DELAY_FILMES}s...")
                    time.sleep(DELAY_FILMES)

            registrar_execucao("concluido", filmes_ok, filmes_falhos,
                              f"Processados: {filmes_ok}, Falhos: {filmes_falhos}")
            logger.info(f"✅ Concluído: {filmes_ok} OK, {filmes_falhos} falhos")

    except Exception as e:
        logger.error(f"Erro crítico: {e}")
        registrar_execucao("falhou", 0, 0, f"Erro: {str(e)[:200]}")
        raise
    finally:
        if browser:
            browser.close()
            logger.info("Navegador fechado")


if __name__ == "__main__":
    main()
