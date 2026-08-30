(async function iniciarCatalogo() {
  const usuario = await exigirLogin();
  if (!usuario) return;

  // Nome/inicial no avatar
  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("nome")
    .eq("id", usuario.id)
    .maybeSingle();

  const nome = perfil?.nome || usuario.email || "U";
  document.getElementById("avatar-inicial").textContent = nome.charAt(0).toUpperCase();

  // Verifica se é assinante ativo
  const assinante = await usuarioEhAssinante(usuario.id);
  if (!assinante) {
    document.getElementById("aviso-assinatura").style.display = "block";
  }

  // Se for administrador, mostra o link de administração
  const { data: perfilAdmin } = await supabaseClient
    .from("profiles")
    .select("is_admin")
    .eq("id", usuario.id)
    .maybeSingle();

  if (perfilAdmin?.is_admin) {
    const linkAdmin = document.createElement("a");
    linkAdmin.href = "admin.html";
    linkAdmin.textContent = "⚙️";
    linkAdmin.style.fontSize = "20px";
    linkAdmin.style.marginRight = "8px";
    document.querySelector(".topbar").insertBefore(linkAdmin, document.getElementById("avatar-inicial"));
  }

  document.getElementById("lista-categorias").innerHTML = "";
  await carregarColecoesDestaque();
  await carregarCatalogo(assinante);
})();

async function carregarColecoesDestaque() {
  const { data: colecoes } = await supabaseClient.from("colecoes").select("*").order("ordem");
  if (!colecoes || colecoes.length === 0) return;

  const container = document.getElementById("lista-categorias");

  const bloco = document.createElement("div");
  const titulo = document.createElement("div");
  titulo.className = "categoria-titulo";
  titulo.textContent = "Coleções em destaque";
  bloco.appendChild(titulo);

  const carrossel = document.createElement("div");
  carrossel.className = "carrossel";

  colecoes.forEach(c => {
    const card = document.createElement("div");
    card.className = "card-video";
    card.onclick = () => window.location.href = `colecao.html?slug=${c.slug}`;
    card.innerHTML = `
      <img src="${c.capa_url || ''}" alt="${c.titulo}" loading="lazy" style="background:var(--bg-card);">
      <div class="titulo-card">${c.titulo}</div>
    `;
    carrossel.appendChild(card);
  });

  bloco.appendChild(carrossel);
  container.appendChild(bloco);
}

async function carregarCatalogo(assinante) {
  const container = document.getElementById("lista-categorias");

  const { data: categorias, error: erroCategoria } = await supabaseClient
    .from("categorias")
    .select("*")
    .order("ordem");

  if (erroCategoria || !categorias) {
    container.innerHTML += '<p class="texto-muted">Não foi possível carregar as categorias.</p>';
    return;
  }

  const { data: videos, error: erroVideos } = await supabaseClient
    .from("videos")
    .select("*");

  if (erroVideos) {
    container.innerHTML += '<p class="texto-muted">Não foi possível carregar o catálogo.</p>';
    return;
  }

  categorias.forEach(categoria => {
    const videosDaCategoria = videos.filter(v => v.categoria_id === categoria.id);
    if (videosDaCategoria.length === 0) return;

    const bloco = document.createElement("div");

    const titulo = document.createElement("div");
    titulo.className = "categoria-titulo";
    titulo.textContent = categoria.nome;
    bloco.appendChild(titulo);

    const carrossel = document.createElement("div");
    carrossel.className = "carrossel";

    videosDaCategoria.forEach(video => {
      const card = document.createElement("div");
      card.className = "card-video";
      card.onclick = () => abrirVideo(video.id, video.premium, assinante);

      card.innerHTML = `
        <img src="${video.url_capa}" alt="${video.titulo}" loading="lazy">
        ${video.premium ? '<span class="badge-premium">Premium</span>' : ''}
        <div class="titulo-card">${video.titulo}</div>
      `;
      carrossel.appendChild(card);
    });

    bloco.appendChild(carrossel);
    container.appendChild(bloco);
  });
}

function abrirVideo(videoId, premium, assinante) {
  if (premium && !assinante) {
    window.location.href = "assinatura.html";
    return;
  }
  window.location.href = "player.html?id=" + videoId;
}

async function sair() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
