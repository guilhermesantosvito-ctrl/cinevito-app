(async function iniciarPlayer() {
  const usuario = await exigirLogin();
  if (!usuario) return;

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
      '<p style="color:#999; text-align:center; padding-top:40%;">Vídeo não encontrado.</p>';
    return;
  }

  if (video.premium) {
    const assinante = await usuarioEhAssinante(usuario.id);
    if (!assinante) {
      window.location.href = "assinatura.html";
      return;
    }
  }

  const tipo = detectarTipoPlayer(video.url_video);
  if (tipo === "direto") {
    document.getElementById("player-wrapper").innerHTML =
      `<video src="${video.url_video}" controls autoplay playsinline></video>`;
  } else {
    document.getElementById("player-wrapper").innerHTML =
      `<iframe src="${video.url_video}" allowfullscreen webkitallowfullscreen></iframe>`;
  }

  document.getElementById("video-titulo").textContent = video.titulo;
  document.getElementById("video-descricao").textContent = video.descricao || "";
  document.getElementById("video-info").textContent =
    `${video.ano || ""} • ${video.licenca || ""} • Fonte: ${video.fonte || ""}`;
})();
