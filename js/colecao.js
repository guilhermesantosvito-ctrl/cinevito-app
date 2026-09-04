const COLUNAS_GRADE_COLECAO = 2; // precisa bater com o CSS: grid-template-columns: repeat(2, 1fr)
let linhasNavegaveisColecao = [];

function marcarNavegavelColecao(elemento) {
  if (!elemento) return;
  elemento.classList.add("focavel-tv");
  if (!elemento.hasAttribute("tabindex")) elemento.setAttribute("tabindex", "0");
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

// Agrupa os cards em "linhas" de acordo com o número de colunas da grade,
// pra que as setas ← → andem dentro da linha e ↑ ↓ pulem entre linhas.
function registrarGradeNavegavelColecao(elementos, colunas) {
  linhasNavegaveisColecao = [];
  const lista = Array.from(elementos);
  for (let i = 0; i < lista.length; i += colunas) {
    linhasNavegaveisColecao.push(lista.slice(i, i + colunas));
  }
}

function moverFocoHorizontalColecao(elementoAtual, direcao) {
  for (const linha of linhasNavegaveisColecao) {
    const indice = linha.indexOf(elementoAtual);
    if (indice === -1) continue;
    const proximoIndice = indice + direcao;
    if (proximoIndice >= 0 && proximoIndice < linha.length) {
      linha[proximoIndice].focus();
      linha[proximoIndice].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return;
  }
}

function moverFocoVerticalColecao(elementoAtual, direcao) {
  let indiceLinhaAtual = -1;
  let indiceColunaAtual = -1;
  linhasNavegaveisColecao.forEach((linha, i) => {
    const idx = linha.indexOf(elementoAtual);
    if (idx !== -1) { indiceLinhaAtual = i; indiceColunaAtual = idx; }
  });
  if (indiceLinhaAtual === -1) return;

  const proximaLinha = indiceLinhaAtual + direcao;
  if (proximaLinha < 0 || proximaLinha >= linhasNavegaveisColecao.length) return;

  const linha = linhasNavegaveisColecao[proximaLinha];
  const alvo = linha[Math.min(indiceColunaAtual, linha.length - 1)];
  if (alvo) {
    alvo.focus();
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

document.addEventListener("keydown", (e) => {
  const ativo = document.activeElement;
  if (!ativo || !ativo.classList || !ativo.classList.contains("focavel-tv")) return;

  if (e.key === "ArrowLeft") { e.preventDefault(); moverFocoHorizontalColecao(ativo, -1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); moverFocoHorizontalColecao(ativo, 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moverFocoVerticalColecao(ativo, -1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); moverFocoVerticalColecao(ativo, 1); }
});

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
      <div class="card-video" onclick="abrirDaColecao('${v.id}', ${assinante})">
        <img src="${v.url_capa}" alt="${v.titulo}" loading="lazy">
        <div class="titulo-card">${v.titulo}</div>
      </div>
    `;
  }).join("");

  grade.querySelectorAll(".card-video").forEach(marcarNavegavelColecao);
  registrarGradeNavegavelColecao(grade.querySelectorAll(".card-video"), COLUNAS_GRADE_COLECAO);
})();

function abrirDaColecao(videoId, assinante) {
  if (!assinante) {
    window.location.href = "assinatura.html";
    return;
  }
  window.location.href = "player.html?id=" + videoId;
}
