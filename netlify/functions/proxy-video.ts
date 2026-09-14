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

    const rawUrl = videos[0].url_video;
    const extractedUrl = extrairUrl(rawUrl);

    if (!extractedUrl) {
      return { statusCode: 500, body: JSON.stringify({ error: 'URL inválida' }) };
    }

    // Detecta se é arquivo de vídeo direto (mp4, webm, m3u8)
    const isDirectVideo = /\.(mp4|webm|ogv|m3u8)(\?|$)/i.test(extractedUrl);

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
    const proxyHtml = await fetch(extractedUrl).then(r => r.text());

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      body: proxyHtml,
    };
  } catch (err) {
    console.error('proxy-video error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
  }
};
