let usuarioCatalogo = null;
let assinanteAtual = false;

(async function iniciarCatalogo() {
  const usuario = await exigirLogin();
  if (!usuario) return;
  usuarioCatalogo = usuario;

  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("nome, is_admin")
    .eq("id", usuario.id)
    .maybeSingle();

  const nome = perfil?.nome || usuario.email || "U";
  document.getElementById("avatar-inicial").textContent = nome.charAt(0).toUpperCase();
  document.getElementById("avatar-inicial").style.cursor = "pointer";
  document.getElementById("avatar-inicial").onclick = () => window.location.href = "perfil.html";

  assinanteAtual = await usuarioEhAssinante(usuario.id);
  if (!assinanteAtual) {
    document.getElementById("aviso-assinatura").style.display = "block";
  }

  if (perfil?.is_admin) {
    const linkAdmin = document.createElement("a");
    linkAdmin.href = "admin.html";
    linkAdmin.textContent = "⚙️";
    linkAdmin.style.fontSize = "20px";
    linkAdmin.style.marginRight = "8px";
    document.querySelector(".topbar").insertBefore(linkAdmin, document.getElementById("avatar-inicial"));
  }

  await montarPagina();
})();

async function montarPagina() {
  const container = document.getElementById("lista-categorias");
  container.innerHTML = "";

  const { data: categorias } = await supabaseClient.from("categorias").select("*").order("ordem");
  const { data: colecoes } = await supabaseClient.from("colecoes").select("*").order("ordem");
  const { data: videos } = await supabaseClient.from("videos").select("*");

  const { data: continuando } = await supabaseClient
    .from("continuar_assistindo")
    .select("progresso_segundos, video_id, videos(*)")
    .eq("usuario_id", usuarioCatalogo.id)
    .order("atualizado_em", { ascending: false })
    .limit(10);

  montarAbasTopo(categorias || [], colecoes || []);
  montarFiltro(categorias || []);

  if (continuando && continuando.length > 0) {
    montarLinha(container, "continuar", "Continuar assistindo", continuando.map(c => c.videos).filter(Boolean));
  }

  if (colecoes && colecoes.length > 0) {
    const bloco = document.createElement("div");
    bloco.id = "secao-colecoes";
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

  (categorias || []).forEach(categoria => {
    const videosDaCategoria = (videos || []).filter(v => v.categoria_id === categoria.id);
    if (videosDaCategoria.length === 0) return;
    montarLinha(container, `categoria-${categoria.id}`, categoria.nome, videosDaCategoria);
  });
}

function montarLinha(container, idSecao, titulo, listaVideos) {
  const bloco = document.createElement("div");
  bloco.id = idSecao;
  bloco.className = "secao-categoria";

  const tituloEl = document.createElement("div");
  tituloEl.className = "categoria-titulo";
  tituloEl.textContent = titulo;
  bloco.appendChild(tituloEl);

  const carrossel = document.createElement("div");
  carrossel.className = "carrossel";

  listaVideos.forEach(video => {
    const card = document.createElement("div");
    card.className = "card-video";
    card.onclick = () => abrirVideo(video.id);
    card.innerHTML = `
      <img src="${video.url_capa}" alt="${video.titulo}" loading="lazy">
      <div class="titulo-card">${video.titulo}</div>
    `;
    carrossel.appendChild(card);
  });

  bloco.appendChild(carrossel);
  container.appendChild(bloco);
}

function montarAbasTopo(categorias, colecoes) {
  const nav = document.getElementById("abas-topo");
  nav.innerHTML = "";

  const abaInicio = document.createElement("a");
  abaInicio.href = "#topo";
  abaInicio.className = "aba-topo ativa";
  abaInicio.textContent = "Início";
  abaInicio.onclick = (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); marcarAbaAtiva(abaInicio); };
  nav.appendChild(abaInicio);

  if (colecoes.length > 0) {
    const abaColecoes = document.createElement("a");
    abaColecoes.href = "#secao-colecoes";
    abaColecoes.className = "aba-topo";
    abaColecoes.textContent = "Coleções";
    abaColecoes.onclick = (e) => { e.preventDefault(); irParaSecao("secao-colecoes"); marcarAbaAtiva(abaColecoes); };
    nav.appendChild(abaColecoes);
  }

  categorias.forEach(cat => {
    const aba = document.createElement("a");
    aba.href = `#categoria-${cat.id}`;
    aba.className = "aba-topo";
    aba.textContent = cat.nome;
    aba.onclick = (e) => { e.preventDefault(); irParaSecao(`categoria-${cat.id}`); marcarAbaAtiva(aba); };
    nav.appendChild(aba);
  });
}

function marcarAbaAtiva(abaClicada) {
  document.querySelectorAll(".aba-topo").forEach(a => a.classList.remove("ativa"));
  abaClicada.classList.add("ativa");
}

function irParaSecao(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function montarFiltro(categorias) {
  const linha = document.getElementById("filtro-categorias");
  linha.innerHTML = "";

  const chipTodos = document.createElement("div");
  chipTodos.className = "chip-filtro ativo";
  chipTodos.textContent = "Todos";
  chipTodos.onclick = () => aplicarFiltro(null, chipTodos);
  linha.appendChild(chipTodos);

  categorias.forEach(cat => {
    const chip = document.createElement("div");
    chip.className = "chip-filtro";
    chip.textContent = cat.nome;
    chip.onclick = () => aplicarFiltro(cat.id, chip);
    linha.appendChild(chip);
  });
}

function aplicarFiltro(categoriaId, chipClicado) {
  document.querySelectorAll(".chip-filtro").forEach(c => c.classList.remove("ativo"));
  chipClicado.classList.add("ativo");

  document.querySelectorAll(".secao-categoria").forEach(secao => {
    if (categoriaId === null) {
      secao.style.display = "";
    } else {
      secao.style.display = secao.id === `categoria-${categoriaId}` ? "" : "none";
    }
  });
}

function abrirVideo(videoId) {
  if (!assinanteAtual) {
    window.location.href = "assinatura.html";
    return;
  }
  window.location.href = "player.html?id=" + videoId;
}

async function sair() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
