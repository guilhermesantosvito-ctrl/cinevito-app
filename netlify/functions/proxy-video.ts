import type { Handler } from '@netlify/functions';

interface VideoRow {
  id: string;
  url_video: string | null;
}

function extrairUrl(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const iframeMatch = trimmed.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (iframeMatch) return iframeMatch[1];
  return trimmed;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const params = event.httpMethod === 'POST'
      ? JSON.parse(event.body || '{}')
      : (event.queryStringParameters || {});

    const video_id = params.video_id;

    if (!video_id || typeof video_id !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'video_id é obrigatório' }) };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Configuração insuficiente' }) };
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/videos?id=eq.${encodeURIComponent(video_id)}`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
    });

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: 'Erro ao buscar vídeo' }) };
    }

    const videos: VideoRow[] = await response.json();
    if (!videos.length || !videos[0].url_video) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Vídeo não encontrado ou sem URL' }) };
    }

    let extractedUrl: string | null = null;
    let isDirectVideoUrl = false;

    if (url_video) {
      // Modo direto: a própria URL veio no query param
      extractedUrl = extrairUrl(url_video);
      if (extractedUrl) {
        isDirectVideoUrl = /\.(mp4|webm|ogv|m3u8)(\?|$)/i.test(extractedUrl);
      }
    } else if (video_id) {
      // Modo via video_id: busca no Supabase

      const rawUrl = videos[0].url_video;
      extractedUrl = extrairUrl(rawUrl);
    }

    if (!extractedUrl) {
      return { statusCode: 500, body: JSON.stringify({ error: 'URL inválida' }) };
    }

    // Detecta se é arquivo de vídeo direto (mp4, webm, m3u8)
    const isDirectVideo = isDirectVideoUrl || /\.(mp4|webm|ogv|m3u8)(\?|$)/i.test(extractedUrl);

    if (isDirectVideo) {
      // Proxy para arquivo de vídeo — baixa e retorna o conteúdo
      const fileResponse = await fetch(extractedUrl, {
        headers: { 'Accept': '*/*' },
      });

      if (!fileResponse.ok) {
        return { statusCode: fileResponse.status, body: JSON.stringify({ error: 'Erro ao buscar stream' }) };
      }

      const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
      const contentLength = fileResponse.headers.get('content-length');

      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      };
      if (contentLength) headers['Content-Length'] = contentLength;

      const body = await fileResponse.text();

      return {
        statusCode: 200,
        headers,
        isBase64Encoded: false,
        body,
      };
    }

    // Para tudo que não é arquivo direto (YouTube, Vimeo, mixdrop, etc.)
    // Faz proxy do HTML/iframe
    // Se a URL for de um servidor de terceiro (MixDrop, Byse, DoodStream, Streamtape...)
    // precisamos fazer fetch com o user-agent do navegador e retornar o HTML tal como está.
    const isThirdPartyServer =
      /miixdrop\.top\/f\//i.test(extractedUrl) ||
      /miixdrop\.top\/e\//i.test(extractedUrl) ||
      /mixdrop\.io\/e\//i.test(extractedUrl) ||
      /bysebuho\.com\/d\//i.test(extractedUrl) ||
      /playmogo\.com\/d\//i.test(extractedUrl) ||
      /doodstream\.com/i.test(extractedUrl) ||
      /dood\.to/i.test(extractedUrl) ||
      /streamtape\.com/i.test(extractedUrl) ||
      /advtpe\.com/i.test(extractedUrl) ||
      /embed69\.org/i.test(extractedUrl) ||
      /embedplayapi\.top/i.test(extractedUrl) ||
      /embedplayer\.site/i.test(extractedUrl) ||
      /embedplayer2\.xyz/i.test(extractedUrl) ||
      /embedplayer\.xyz/i.test(extractedUrl) ||
      /cinesrc\.st/i.test(extractedUrl) ||
      /vidsrc2\.ru/i.test(extractedUrl) ||
      /filemoon\.io/i.test(extractedUrl);

    const thirdPartyFetch = await fetch(extractedUrl, {
      headers: isThirdPartyServer
        ? {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://cinevito.netlify.app/',
          }
        : undefined,
    });
    const proxyHtml = await thirdPartyFetch.text();

    // Converte o HTML para permitir embed no iframe do CineVito:
    // Remove headers que bloqueiam iframe (X-Frame-Options, CSP frame-ancestors)
    // Remove/inverte scripts de anti-embed (ex: "SANDBOX EMBED NOT ALLOWED" do MixDrop,
    // "Client blocked!" do Streamtape)
    let htmlFinal = proxyHtml;
    if (isThirdPartyServer) {
      // Remove atributo sandbox de iframes internos que servem como detector anti-embed
      // (ex: Streamtape injeta iframe sandbox que, se detectado, mostra "Client blocked!")
      htmlFinal = htmlFinal.replace(
        /<iframe[^>]*sandbox="[^"]*"[^>]*>/gi,
        (match) => {
          // Mantém allow-scripts e allow-popups, remove allow-same-origin (que permite
          // o iframe detectar o container e mostrar a mensagem de bloqueio)
          return match.replace(/sandbox="[^"]*"/, 'sandbox="allow-scripts allow-popups"');
        }
      );

      // Injetar window.googleAd=1 antes do <head> — isso faz o Streamtape achar que
      // não tem adblock (void 0===window.googleAd&&(e.adblock=!0))
      htmlFinal = htmlFinal.replace(
        /(<head[^>]*>)/i,
        '$1<script>window.googleAd=1;</script>'
      );

      // Remover/inverter verificações de anti-frame-bust
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*(top|parent)\.location\s*!==\s*self\.location\s*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (top.location!==self.location)'
      );
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*window\.top\s*!==\s*window\.self\s*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (window.top!==window.self)'
      );

      // Verificação de hostname (if (self.location.hostname !== 'x'))
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*self\.location\.hostname\s*!==\s*['"][^'"]+['"]\s*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (hostname check)'
      );

      // 3. Verificações de document.referrer
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*document\.referrer\s*[!=]==\s*['"][^'"]+['"]\s*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (referrer check)'
      );

      // 4. Verificações de window.frameElement
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*window\.frameElement\s*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (frameElement check)'
      );

      // 5. Verificações via window.parent
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*window\.parent\s*&&?\s*window\.parent\s*!==\s*window\.self\s*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (parent check)'
      );

      // 6. Verificações de parent postMessage
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*![^)]*window\.parent\.postMessage[^)]*\)\s*\{[^}]*\})/gi,
        '// anti-frame-bust removido (postMessage check)'
      );

      // 7. Verificação de_CLEAN/anti-adblock que pode estar bloqueando
      htmlFinal = htmlFinal.replace(
        /(if\s*\(\s*!window\.GoogleAnalytics\s*\)\s*\{[^}]*\})/gi,
        '// analytics check removido'
      );

      // 8. Redirects forçados (top.location.href = ...)
      htmlFinal = htmlFinal.replace(
        /(top\.location\.href\s*=\s*['"][^'"]+['"])/gi,
        '// redirect removido (top.location.href)'
      );
      htmlFinal = htmlFinal.replace(
        /(window\.top\.location\.href\s*=\s*['"][^'"]+['"])/gi,
        '// redirect removido (window.top.location.href)'
      );
      htmlFinal = htmlFinal.replace(
        /(parent\.location\.href\s*=\s*['"][^'"]+['"])/gi,
        '// redirect removido (parent.location.href)'
      );
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        // Remove headers que bloqueiam iframe no navegador
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors 'self' https://cinevito.netlify.app https://*.netlify.app",
      },
      body: htmlFinal,
    };
  } catch (err) {
    console.error('proxy-video error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
  }
};
