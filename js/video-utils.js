// =========================================================
// Entende qualquer link colado pelo admin e descobre como
// esse vídeo deve ser reproduzido dentro do app.
// =========================================================

function normalizarUrlVideo(urlBruta) {
  const url = urlBruta.trim();
  let m = url.match(/archive\.org\/details\/([^/?#]+)/);
  if (m) return `https://archive.org/embed/${m[1]}`;
  if (url.includes("archive.org/embed/")) return url;

  m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  if (url.includes("youtube.com/embed/")) return url;

  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;

  return url;
}

function detectarTipoPlayer(url) {
  if (
    url.includes("archive.org/embed/") ||
    url.includes("youtube.com/embed/") ||
    url.includes("player.vimeo.com/")
  ) {
    return "iframe";
  }
  if (/\.(mp4|webm|ogv)(\?.*)?$/i.test(url)) {
    return "direto";
  }
  return "iframe";
}

function sugerirCapaAutomatica(urlNormalizada) {
  const m = urlNormalizada.match(/archive\.org\/embed\/([^/?#]+)/);
  if (m) return `https://archive.org/services/img/${m[1]}`;
  return "";
}

function gerarSlug(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
