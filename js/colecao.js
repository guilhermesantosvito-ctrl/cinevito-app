(async function iniciarColecao() {
  const usuario = await exigirLogin();
  if (!usuario) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  if (!slug) { window.location.href = "catalogo.html"; return; }

  const { data: colecao, error } = await supabaseClient
    .from("colecoes")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !colecao) {
    document.getElementById("colecao-titulo").textContent = "Coleção não encontrada";
    return;
  }

  document.getElementById("colecao-titulo").textContent = colecao.titulo;
  document.getElementById("colecao-descricao").textContent = colecao.descricao || "";

  const assinante = await usuarioEhAssinante(usuario.id);

  const { data: itens } = await supabaseClient
    .from("colecao_videos")
    .select("ordem, videos(*)")
    .eq("colecao_id", colecao.id)
    .order("ordem");

  const grade = document.getElementById("grade-videos");

  if (!itens || itens.length === 0) {
    grade.innerHTML = '<p class="texto-muted">Ainda não há vídeos nesta coleção.</p>';
    return;
  }

  grade.innerHTML = itens.map(item => {
    const v = item.videos;
    return `
      <div class="card-video" onclick="abrirDaColecao('${v.id}', ${v.premium}, ${assinante})">
        <img src="${v.url_capa}" alt="${v.titulo}" loading="lazy">
        ${v.premium ? '<span class="badge-premium">Premium</span>' : ''}
        <div class="titulo-card">${v.titulo}</div>
      </div>
    `;
  }).join("");
})();

function abrirDaColecao(videoId, premium, assinante) {
  if (premium && !assinante) {
    window.location.href = "assinatura.html";
    return;
  }
  window.location.href = "player.html?id=" + videoId;
}
