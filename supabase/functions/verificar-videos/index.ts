// =========================================================
// EDGE FUNCTION: verificar-videos
// Equivalente web do verificador Python enviado pelo Guilherme.
// O Python fica preservado em /python para execução local; esta
// versão roda no Supabase para que o painel do CineVito consiga
// usá-la sem expor credenciais nem depender de um servidor separado.
// =========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const MAX_URL_LENGTH = 2048;
const SOURCE_TIMEOUT_MS = 10_000;
const VIDEO_TIMEOUT_MS = 5_000;

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function removerPontuacaoSeparadora(link: string) {
  const delimitadoresDeFechamento: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
  };
  const pontuacaoSeparadoraFinal = ".,;:!?";
  let resultado = link;

  while (resultado) {
    const ultimoCaractere = resultado.at(-1)!;
    if (ultimoCaractere in delimitadoresDeFechamento) {
      const abertura = delimitadoresDeFechamento[ultimoCaractere];
      const abertas = resultado.split(abertura).length - 1;
      const fechadas = resultado.split(ultimoCaractere).length - 1;
      if (abertas >= fechadas) break;
      resultado = resultado.slice(0, -1);
      continue;
    }
    if (pontuacaoSeparadoraFinal.includes(ultimoCaractere)) {
      resultado = resultado.slice(0, -1);
      continue;
    }
    break;
  }
  return resultado;
}

function validarUrlAlvo(valor: unknown) {
  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error("Informe uma URL para analisar.");
  }
  if (valor.length > MAX_URL_LENGTH) {
    throw new Error("A URL é muito longa.");
  }

  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    throw new Error("Informe uma URL válida.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("A URL precisa começar com http:// ou https://.");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "zencdn.net" && !host.endsWith(".zencdn.net")) {
    throw new Error("Por segurança, a análise fica limitada ao domínio zencdn.net.");
  }
  return url.toString();
}

function extrairLinksDeVideo(texto: string, urlAlvo: string) {
  const padrao = /https?:\/\/[^\s"'<>]+?\.(?:mp4|m3u8)(?:\?[^\s"'<>#]*)?(?:#[^\s"'<>]*)?/gi;
  const links = Array.from(texto.matchAll(padrao), (match) =>
    removerPontuacaoSeparadora(match[0])
  );

  const caminho = new URL(urlAlvo).pathname.toLowerCase();
  if (caminho.endsWith(".mp4") || caminho.endsWith(".m3u8")) {
    links.push(urlAlvo);
  }
  return [...new Set(links)];
}

async function fetchComTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function obterUsuarioAutenticado(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responseJson({ error: "Método não permitido." }, 405);

  try {
    const usuario = await obterUsuarioAutenticado(req);
    if (!usuario) return responseJson({ error: "Faça login para usar o verificador." }, 401);

    const { data: perfil, error: erroPerfil } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", usuario.id)
      .maybeSingle();

    if (erroPerfil || !perfil?.is_admin) {
      return responseJson({ error: "Esta ferramenta é exclusiva para administradores." }, 403);
    }

    const corpo = await req.json();
    const urlAlvo = validarUrlAlvo(corpo?.url);
    let respostaPagina: Response;

    try {
      respostaPagina = await fetchComTimeout(urlAlvo, { method: "GET" }, SOURCE_TIMEOUT_MS);
    } catch (erro) {
      const mensagem = erro instanceof DOMException && erro.name === "AbortError"
        ? "Tempo limite excedido ao acessar a página alvo."
        : "Erro ao acessar a página alvo.";
      return responseJson({ error: mensagem }, 502);
    }

    if (!respostaPagina.ok) {
      return responseJson({
        error: `A página alvo respondeu com o código HTTP ${respostaPagina.status}.`,
        sourceStatus: respostaPagina.status,
      }, 502);
    }

    const textoDaPagina = await respostaPagina.text();
    const links = extrairLinksDeVideo(textoDaPagina, urlAlvo);
    const resultados = [];

    for (const link of links) {
      try {
        const checagem = await fetchComTimeout(link, { method: "HEAD" }, VIDEO_TIMEOUT_MS);
        resultados.push({
          url: link,
          status: checagem.status === 200 ? "ativo" : "erro",
          statusCode: checagem.status,
          mensagem: checagem.status === 200
            ? "Link ativo e funcionando."
            : "Link respondeu, mas com erro.",
        });
      } catch (erro) {
        const timeout = erro instanceof DOMException && erro.name === "AbortError";
        resultados.push({
          url: link,
          status: "indisponivel",
          statusCode: null,
          mensagem: timeout
            ? "Tempo limite excedido ao testar o link."
            : "Link quebrado ou fora do ar.",
        });
      }
    }

    return responseJson({
      sourceUrl: urlAlvo,
      linksEncontrados: links.length,
      resultados,
    });
  } catch (erro) {
    return responseJson({ error: erro instanceof Error ? erro.message : "Erro inesperado." }, 400);
  }
});
