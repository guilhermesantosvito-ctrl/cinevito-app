let usuarioCatalogo = null;
let assinanteAtual = false;
let generosCache = [];
let linhasNavegaveis = [];
let categoriaAtiva = null;
let generoAtivo = null;

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

  document.getElementById("avatar-inicial").textContent =
    nome.charAt(0).toUpperCase();

  document.getElementById("avatar-inicial").onclick = () => {
    window.location.href = "perfil.html";
  };

  document.getElementById("texto-boas-vindas").textContent =
    `Olá, ${nome.split(" ")[0]}!`;

  assinanteAtual = await usuarioEhAssinante(usuario.id);

  if (perfil?.is_admin) {
    const linkAdmin = document.createElement("a");

    linkAdmin.href = "admin.html";
    linkAdmin.className = "icone-topbar";
    linkAdmin.textContent = "⚙️";

    document
      .getElementById("lado-direito-topbar")
      .insertBefore(
        linkAdmin,
        document.getElementById("lado-direito-topbar").firstChild
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
        <div class="toast-texto">
          Você ainda não é assinante. Assine para desbloquear o catálogo.
        </div>
        <a href="assinatura.html">Ver planos</a>
      </div>
    `;

    return;
  }

  if (!status.data_expiracao) {
    return;
  }

  const diasRestantes = Math.ceil(
    (new Date(status.data_expiracao) - new Date()) / 86400000
  );

  if (status.status === "trial" && diasRestantes > 0) {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Teste grátis</div>
        <div class="toast-texto">
          Restam ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"} do seu teste grátis.
          Assine já para não perder o acesso.
        </div>
        <a href="assinatura.html">Assinar agora</a>
      </div>
    `;
  } else if (
    status.status === "ativa" &&
    diasRestantes <= 7 &&
    diasRestantes > 0
  ) {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Assinatura expirando</div>
        <div class="toast-texto">
          Faltam ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"}
          para sua assinatura expirar.
        </div>
        <a href="assinatura.html">Renovar agora</a>
      </div>
    `;
  } else if (diasRestantes <= 0) {
    area.innerHTML = `
      <div class="toast-assinatura">
        <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
        <div class="toast-titulo">Acesso expirado</div>
        <div class="toast-texto">
          Seu período de acesso terminou. Assine para continuar.
        </div>
        <a href="assinatura.html">Ver planos</a>
      </div>
    `;
  }
}

async function verificarAniversario(dataNascimento) {
  if (!dataNascimento) return;

  const nascimento = new Date(dataNascimento + "T00:00:00");
  const hoje = new Date();

  if (nascimento.getMonth() !== hoje.getMonth()) {
    return;
  }

  const area = document.getElementById("area-toast");
  const div = document.createElement("div");

  div.className = "toast-assinatura toast-aniversario";

  div.innerHTML = `
    <button class="fechar-toast" onclick="this.parentElement.remove()">✕</button>
    <div class="toast-titulo">🎂 Mês de aniversário!</div>
    <div class="toast-texto">
      Use o cupom <strong>ANIVERSARIO10</strong> e ganhe 10% de desconto
      na sua assinatura.
    </div>
    <a href="assinatura.html">Assinar com desconto</a>
  `;

  area.appendChild(div);
}

function habilitarScrollHorizontal(elemento) {
  if (!elemento || elemento.dataset.scrollHabilitado) {
    return;
  }

  elemento.dataset.scrollHabilitado = "1";

  elemento.addEventListener(
    "wheel",
    (e) => {
      const temOverflow =
        elemento.scrollWidth > elemento.clientWidth;

      if (
        temOverflow &&
        Math.abs(e.deltaY) > Math.abs(e.deltaX)
      ) {
        e.preventDefault();
        elemento.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );
}

function marcarNavegavel(elemento) {
  if (!elemento) {
    return;
  }

  elemento.classList.add("focavel-tv");

  if (!elemento.hasAttribute("tabindex")) {
    elemento.setAttribute("tabindex", "0");
  }

  const tag = elemento.tagName;

  if (tag !== "A" && tag !== "BUTTON") {
    elemento.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        elemento.click();
      }
    });
  }
}

function registrarLinhaNavegavel(elementos) {
  if (elementos && elementos.length > 0) {
    linhasNavegaveis.push(Array.from(elementos));
  }
}

function moverFocoHorizontal(elementoAtual, direcao) {
  for (const linha of linhasNavegaveis) {
    const indice = linha.indexOf(elementoAtual);

    if (indice === -1) {
      continue;
    }

    const proximoIndice = indice + direcao;

    if (
      proximoIndice >= 0 &&
      proximoIndice < linha.length
    ) {
      linha[proximoIndice].focus();

      linha[proximoIndice].scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }

    return;
  }
}

function moverFocoVertical(elementoAtual, direcao) {
  let indiceLinhaAtual = -1;
  let indiceColunaAtual = -1;

  linhasNavegaveis.forEach((linha, i) => {
    const idx = linha.indexOf(elementoAtual);

    if (idx !== -1) {
      indiceLinhaAtual = i;
      indiceColunaAtual = idx;
    }
  });

  if (indiceLinhaAtual === -1) {
    return;
  }

  let proximaLinha = indiceLinhaAtual + direcao;

  while (
    proximaLinha >= 0 &&
    proximaLinha < linhasNavegaveis.length
  ) {
    const linha = linhasNavegaveis[proximaLinha];

    if (linha.length > 0) {
      const alvo =
        linha[Math.min(indiceColunaAtual, linha.length - 1)];

      alvo.focus();

      alvo.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "center",
      });

      return;
    }

    proximaLinha += direcao;
  }
}

document.addEventListener("keydown", (e) => {
  const ativo = document.activeElement;

  if (
    !ativo ||
    !ativo.classList ||
    !ativo.classList.contains("focavel-tv")
  ) {
    return;
  }

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    moverFocoHorizontal(ativo, -1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    moverFocoHorizontal(ativo, 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moverFocoVertical(ativo, -1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    moverFocoVertical(ativo, 1);
  }
});

async function montarPagina() {
  const container = document.getElementById("lista-categorias");

  container.innerHTML = "";
  linhasNavegaveis = [];

  const { data: categorias } = await supabaseClient
    .from("categorias")
    .select("*")
    .order("ordem");

  const { data: colecoes } = await supabaseClient
    .from("colecoes")
    .select("*")
    .order("ordem");

  const { data: videos } = await supabaseClient
    .from("videos")
    .select("*");

  const { data: generos } = await supabaseClient
    .from("generos")
    .select("*")
    .order("ordem");

  generosCache = generos || [];

  const { data: continuando } = await supabaseClient
    .from("continuar_assistindo")
    .select("progresso_segundos, video_id, videos(*)")
    .eq("usuario_id", usuarioCatalogo.id)
    .order("atualizado_em", { ascending: false })
    .limit(10);

  montarAbasTopo(categorias || [], colecoes || []);
  montarFiltroGeneros();

  if (continuando && continuando.length > 0) {
    montarLinha(
      container,
      "continuar",
      "Continuar assistindo",
      continuando.map((c) => c.videos).filter(Boolean)
    );
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

    colecoes.forEach((colecao) => {
      const card = document.createElement("div");

      card.className = "card-video";

      card.onclick = () => {
        window.location.href =
          `colecao.html?slug=${colecao.slug}`;
      };

      card.innerHTML = `
        <img
          src="${colecao.capa_url || ""}"
          alt="${colecao.titulo}"
          loading="lazy"
          style="background:var(--bg-card);"
        >
        <div class="titulo-card">${colecao.titulo}</div>
      `;

      carrossel.appendChild(card);
    });

    bloco.appendChild(carrossel);
    container.appendChild(bloco);

    habilitarScrollHorizontal(carrossel);

    carrossel
      .querySelectorAll(".card-video")
      .forEach(marcarNavegavel);

    registrarLinhaNavegavel(
      carrossel.querySelectorAll(".card-video")
    );
  }

  (categorias || []).forEach((categoria) => {
    const videosDaCategoria = (videos || []).filter(
      (video) => video.categoria_id === categoria.id
    );

    if (videosDaCategoria.length === 0) {
      return;
    }

    montarLinha(
      container,
      `categoria-${categoria.id}`,
      categoria.nome,
      videosDaCategoria
    );
  });

  habilitarScrollHorizontal(
    document.getElementById("abas-topo")
  );

  habilitarScrollHorizontal(
    document.getElementById("filtro-generos")
  );
}

function montarLinha(
  container,
  idSecao,
  titulo,
  listaVideos
) {
  const bloco = document.createElement("div");

  bloco.id = idSecao;
  bloco.className = "secao-categoria";

  const tituloEl = document.createElement("div");

  tituloEl.className = "categoria-titulo";
  tituloEl.textContent = titulo;

  bloco.appendChild(tituloEl);

  const carrossel = document.createElement("div");
  carrossel.className = "carrossel";

  listaVideos.forEach((video) => {
    const card = document.createElement("div");

    card.className = "card-video";
    card.dataset.genero = video.genero || "";

    card.onclick = () => abrirVideo(video.id);

    card.innerHTML = `
      <img
        src="${video.url_capa || ""}"
        alt="${video.titulo}"
        loading="lazy"
      >
      <div class="titulo-card">${video.titulo}</div>
    `;

    carrossel.appendChild(card);
  });

  bloco.appendChild(carrossel);
  container.appendChild(bloco);

  habilitarScrollHorizontal(carrossel);

  carrossel
    .querySelectorAll(".card-video")
    .forEach(marcarNavegavel);

  registrarLinhaNavegavel(
    carrossel.querySelectorAll(".card-video")
  );
}

function montarAbasTopo(categorias, colecoes) {
  const nav = document.getElementById("abas-topo");

  nav.innerHTML = "";

  const abaInicio = document.createElement("a");

  abaInicio.href = "#";
  abaInicio.className = "aba-topo ativa";
  abaInicio.textContent = "Início";

  abaInicio.onclick = (e) => {
    e.preventDefault();

    categoriaAtiva = null;

    marcarAbaAtiva(abaInicio);
    aplicarFiltrosAtivos();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  nav.appendChild(abaInicio);

  if (colecoes.length > 0) {
    const abaColecoes = document.createElement("a");

    abaColecoes.href = "#secao-colecoes";
    abaColecoes.className = "aba-topo";
    abaColecoes.textContent = "Coleções";

    abaColecoes.onclick = (e) => {
      e.preventDefault();

      categoriaAtiva = "__colecoes";

      marcarAbaAtiva(abaColecoes);
      aplicarFiltrosAtivos();
      irParaSecao("secao-colecoes");
    };

    nav.appendChild(abaColecoes);
  }

  categorias.forEach((categoria) => {
    const aba = document.createElement("a");

    aba.href = `#categoria-${categoria.id}`;
    aba.className = "aba-topo";
    aba.textContent = categoria.nome;

    aba.onclick = (e) => {
      e.preventDefault();

      categoriaAtiva = String(categoria.id);

      marcarAbaAtiva(aba);
      aplicarFiltrosAtivos();
      irParaSecao(`categoria-${categoria.id}`);
    };

    nav.appendChild(aba);
  });

  nav
    .querySelectorAll(".aba-topo")
    .forEach(marcarNavegavel);

  registrarLinhaNavegavel(
    nav.querySelectorAll(".aba-topo")
  );
}

function marcarAbaAtiva(abaClicada) {
  document
    .querySelectorAll(".aba-topo")
    .forEach((aba) => aba.classList.remove("ativa"));

  abaClicada.classList.add("ativa");
}

function irParaSecao(id) {
  const elemento = document.getElementById(id);

  if (elemento) {
    elemento.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function rolarFiltroGeneros(direcao) {
  const linha = document.getElementById("filtro-generos");

  linha.scrollBy({
    left: direcao * 220,
    behavior: "smooth",
  });
}

function montarFiltroGeneros() {
  const linha = document.getElementById("filtro-generos");

  linha.innerHTML = "";

  const chipTodos = document.createElement("div");

  chipTodos.className = "chip-filtro ativo";
  chipTodos.textContent = "Todos os gêneros";

  chipTodos.onclick = () => {
    aplicarFiltroGenero(null, chipTodos);
  };

  linha.appendChild(chipTodos);

  generosCache.forEach((genero) => {
    const chip = document.createElement("div");

    chip.className = "chip-filtro";
    chip.textContent = genero.nome;

    chip.onclick = () => {
      aplicarFiltroGenero(genero.nome, chip);
    };

    linha.appendChild(chip);
  });

  linha
    .querySelectorAll(".chip-filtro")
    .forEach(marcarNavegavel);

  registrarLinhaNavegavel(
    linha.querySelectorAll(".chip-filtro")
  );
}

function normalizarTextoCatalogo(valor) {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function generoCorresponde(
  generoDoVideo,
  generoSelecionado
) {
  if (!generoSelecionado) {
    return true;
  }

  const videoGenero =
    normalizarTextoCatalogo(generoDoVideo);

  const filtroGenero =
    normalizarTextoCatalogo(generoSelecionado);

  return (
    videoGenero === filtroGenero ||
    videoGenero.replace(/s$/, "") ===
      filtroGenero.replace(/s$/, "")
  );
}

function aplicarFiltrosAtivos() {
  document
    .querySelectorAll(".secao-categoria")
    .forEach((secao) => {
      const secaoSelecionada =
        categoriaAtiva === null ||
        (
          categoriaAtiva !== "__colecoes" &&
          secao.id === `categoria-${categoriaAtiva}`
        );

      let algumVideoVisivel = false;

      secao
        .querySelectorAll(".card-video")
        .forEach((card) => {
          const mostraGenero = generoCorresponde(
            card.dataset.genero,
            generoAtivo
          );

          const deveMostrar =
            categoriaAtiva !== "__colecoes" &&
            secaoSelecionada &&
            mostraGenero;

          card.style.display = deveMostrar ? "" : "none";

          if (deveMostrar) {
            algumVideoVisivel = true;
          }
        });

      secao.style.display =
        algumVideoVisivel ? "" : "none";
    });

  const secaoColecoes =
    document.getElementById("secao-colecoes");

  if (secaoColecoes) {
    secaoColecoes.style.display =
      categoriaAtiva === null ||
      categoriaAtiva === "__colecoes"
        ? ""
        : "none";
  }
}

function aplicarFiltroGenero(
  genero,
  chipClicado
) {
  generoAtivo = genero;

  document
    .querySelectorAll(".chip-filtro")
    .forEach((chip) => chip.classList.remove("ativo"));

  chipClicado.classList.add("ativo");

  aplicarFiltrosAtivos();
}

function abrirVideo(videoId) {
  if (!assinanteAtual) {
    window.location.href = "assinatura.html";
    return;
  }

  window.location.href =
    "player.html?id=" + videoId;
}

async function sair() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
