// ============================================================
//  Detector de servidores de terceiro (MixDrop, Byse,
//  DoodStream/playmogo, Streamtape, etc.)
//  Usada pelo player para decidir se o iframe pode carregar
//  a URL direto ou se precisa passar pelo proxy Netlify.
// ============================================================

export type EmbedServer =
  | 'mixdrop'
  | 'byse'
  | 'doodstream'       // playmogo.com/d/ e doodstream.com
  | 'streamtape'
  | 'embed69'
  | 'embedplay'
  | 'embedplayer'
  | 'cinesrc'
  | 'vidsrc2'
  | 'filemoon'
  | 'other';

export const SERVER_EMBED_BLOCKLISTS: Record<string, RegExp[]> = {
  mixdrop: [
    /miixdrop\.top\/f\//i,
    /mixdrop\.io\/e\//i,
  ],
  byse: [
    /bysebuho\.com\/d\//i,
    /byse\./i,
  ],
  doodstream: [
    /playmogo\.com\/d\//i,
    /doodstream\.com/i,
    /dood\.to/i,
  ],
  streamtape: [
    /streamtape\.com\/v\//i,
  ],
  embed69: [
    /embed69\.org/i,
  ],
  embedplay: [
    /embedplayapi\.top/i,
    /embedplay\./i,
  ],
  embedplayer: [
    /embedplayer\.site/i,
    /embedplayer2\.xyz/i,
    /embedplayer\.xyz/i,
  ],
  cinesrc: [
    /cinesrc\.st/i,
  ],
  vidsrc2: [
    /vidsrc2\.ru/i,
  ],
  filemoon: [
    /filemoon\.io/i,
  ],
};

export function detectarServerEmbed(url: string): EmbedServer {
  for (const [server, patterns] of Object.entries(SERVER_EMBED_BLOCKLISTS)) {
    if (patterns.some((re) => re.test(url))) {
      return server as EmbedServer;
    }
  }
  return 'other';
}

/** Servidores conhecidos por bloquear embed direto em iframe (SANDBOX, X-Frame-Options, etc.) */
export const SERVERS_THAT_NEED_PROXY = new Set([
  'mixdrop',
  'byse',
  'doodstream',
  'streamtape',
  'embed69',
  'embedplay',
  'embedplayer',
  'cinesrc',
  'vidsrc2',
  'filemoon',
]);

export function servidorPrecisaProxy(server: EmbedServer): boolean {
  return SERVERS_THAT_NEED_PROXY.has(server);
}
