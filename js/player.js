let usuarioPlayer = null;
let videoAtual = null;
let jaFavoritado = false;

(async function iniciarPlayer() {
  const usuario = await exigirLogin();
  if (!usuario) return;
  usuarioPlayer = usuario;

  const params = new URLSearchParams(window.location.search);
  const videoId = params.get("id");

  if (!videoId) {
    window.location.href = "catalogo.html";
    return;
  }

  const { data: video, error } = await supabaseClient
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();

  if (error || !video) {
    document.getElementById("player-wrapper").innerHTML =
      '<a href="catalogo.html" class="botao-voltar-player">←</a><p style="color:#999; text-align:center; padding-top:40%;">Vídeo não encontrado.</p>';
    return;
  }

  videoAtual = video;

  if (video.premium) {
    const assinante = await usuarioEhAssinante(usuario.id);
    if (!assinante) {
      window.location.href = "assinatura.html";
      return;
    }
  }

  const tipo = detectarTipoPlayer(video.url_video);
  const botaoVoltar = '<a href="catalogo.html" class="botao-voltar-player">←</a>';

  if (tipo === "direto") {
    document.getElementById("player-wrapper").innerHTML =
      botaoVoltar +
      `<video src="${video.url_video}" controls autoplay playsinline
        controlsList="nodownload noremoteplayback" disablePictureInPicture></video>`;
  } else {
    document.getElementById("player-wrapper").innerHTML =
      botaoVoltar +
      `<iframe src="${video.url_video}" allowfullscreen webkitallowfullscreen></iframe>`;
  }

  document.getElementById("video-titulo").textContent = video.titulo;
  document.getElementById("video-descricao").textContent = video.descricao || "";
  document.getElementById("video-info").textContent =
    `${video.ano || ""} • ${video.licenca || ""} • Fonte: ${video.fonte || ""}`;

  await checarFavorito();
})();

async function checarFavorito() {
  const { data } = await supabaseClient
    .from("favoritos")
    .select("id")
    .eq("usuario_id", usuarioPlayer.id)
    .eq("video_id", videoAtual.id)
    .maybeSingle();

  jaFavoritado = !!data;
  atualizarBotaoFavorito();
}

function atualizarBotaoFavorito() {
  const botao = document.getElementById("botao-favorito");
  const icone = document.getElementById("icone-favorito");
  const texto = document.getElementById("texto-favorito");
  if (jaFavoritado) {
    botao.classList.add("ativo");
    icone.textContent = "★";
    texto.textContent = "Nos favoritos";
  } else {
    botao.classList.remove("ativo");
    icone.textContent = "☆";
    texto.textContent = "Adicionar aos favoritos";
  }
}

async function alternarFavorito() {
  if (jaFavoritado) {
    await supabaseClient.from("favoritos")
      .delete()
      .eq("usuario_id", usuarioPlayer.id)
      .eq("video_id", videoAtual.id);
    jaFavoritado = false;
  } else {
    await supabaseClient.from("favoritos")
      .insert({ usuario_id: usuarioPlayer.id, video_id: videoAtual.id });
    jaFavoritado = true;
  }
  atualizarBotaoFavorito();
}
