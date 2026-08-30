let usuarioCatalogo = null;
let assinanteAtual = false;

const GENEROS_PADRAO = [
  "Ação", "Aventura", "Comédia", "Drama", "Terror", "Ficção Científica",
  "Romance", "Documentário", "Animação", "Infantil", "Suspense",
  "Musical", "Fantasia", "Faroeste", "Guerra", "Biografia"
];

(async function iniciarCatalogo() {
  const usuario = await exigirLogin();
  if (!usuario) return;
  usuarioCatalogo = usuario;

  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("nome, is_admin, data_nascimento")
    .eq("id", usuario.id)
    .maybeSingle();

  const nome = perfil?.nome || usuario.email || "U";
  document.getElementById("avatar-inicial").textContent = nome.charAt(0).toUpperCase();
  document.getElementById("avatar-inicial").onclick = () => window.location.href = "perfil.html";
  document.getElementById("texto-boas-vindas").textContent = `Olá, ${nome.split(" ")[0]}!`;

  assinanteAtual = await usuarioEhAssinante(usuario.id);

  if (perfil?.is_admin) {
    const linkAdmin = document.createElement("a");
    linkAdmin.href = "admin.html";
    linkAdmin.className = "icone-topbar";
    linkAdmin.textContent = "⚙️";
    document.getElementById("lado-direito-topbar").insertBefore(
      linkAdmin, document.getElementById("lado-direito-topbar").firstChild
    );
  } else {
    await mostrarToastStatus(usuario.id);
    await verificarAniversario(perfil?.data_nascimento);
  }

  await montarPagina();
})();

async function mostrarToastStatus(usuarioId) {
  const status = await obterStatusAssinatura(usuarioId);
  const area = document.getElementById("area-toast");

  if (!status || status.status === "inativa") {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Assine o CineVito</div>
        <div class="toast-texto">Você ainda não é assinante. Assine para desbloquear o catálogo.</div>
        <a href="assinatura.html">Ver planos</a>
      </div>`;
    return;
  }

  if (!status.data_expiracao) return;

  const diasRestantes = Math.ceil((new Date(status.data_expiracao) - new Date()) / 86400000);

  if (status.status === "trial" && diasRestantes > 0) {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Teste grátis</div>
        <div class="toast-texto">Restam ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"} do seu teste grátis. Assine já para não perder o acesso.</div>
        <a href="assinatura.html">Assinar agora</a>
      </div>`;
  } else if (status.status === "ativa" && diasRestantes <= 7 && diasRestantes > 0) {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Assinatura expirando</div>
        <div class="toast-texto">Faltam ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"} para sua assinatura expirar.</div>
        <a href="assinatura.html">Renovar agora</a>
      </div>`;
  } else if (diasRestantes <= 0) {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Acesso expirado</div>
        <div class="toast-texto">Seu período de acesso terminou. Assine para continuar.</div>
        <a href="assinatura.html">Ver planos</a>
      </div>`;
  }
}

async function verificarAniversario(dataNascimento) {
  if (!dataNascimento) return;

  const nascimento = new Date(dataNascimento + "T00:00:00");
  const hoje = new Date();
  if (nascimento.getMonth() !== hoje.getMonth()) return;

  const area = document.getElementById("area-toast");
  const div = document.createElement("div");
  div.className = "toast-assinatura toast-aniversario";
  div.innerHTML = `
    <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
    <div class="toast-titulo">🎂 Mês de aniversário!</div>
    <div class="toast-texto">Use o cupom <strong>ANIVERSARIO10</strong> e ganhe 10% de desconto na sua assinatura.</div>
    <a href="assinatura.html">Assinar com desconto</a>
  `;
  area.appendChild(div);
}

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
  montarFiltroGeneros();

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
    card.dataset.genero = video.genero || "";
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
  abaInicio.href = "#";
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

function montarFiltroGeneros() {
  const linha = document.getElementById("filtro-generos");
  linha.innerHTML = "";

  const chipTodos = document.createElement("div");
  chipTodos.className = "chip-filtro ativo";
  chipTodos.textContent = "Todos os gêneros";
  chipTodos.onclick = () => aplicarFiltroGenero(null, chipTodos);
  linha.appendChild(chipTodos);

  GENEROS_PADRAO.forEach(genero => {
    const chip = document.createElement("div");
    chip.className = "chip-filtro";
    chip.textContent = genero;
    chip.onclick = () => aplicarFiltroGenero(genero, chip);
    linha.appendChild(chip);
  });
}

function aplicarFiltroGenero(genero, chipClicado) {
  document.querySelectorAll(".chip-filtro").forEach(c => c.classList.remove("ativo"));
  chipClicado.classList.add("ativo");

  document.querySelectorAll(".secao-categoria").forEach(secao => {
    let algumVisivel = false;
    secao.querySelectorAll(".card-video").forEach(card => {
      const mostra = genero === null || card.dataset.genero === genero;
      card.style.display = mostra ? "" : "none";
      if (mostra) algumVisivel = true;
    });
    secao.style.display = algumVisivel ? "" : "none";
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
