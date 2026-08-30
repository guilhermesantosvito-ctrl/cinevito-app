let usuarioAdmin = null;
let categoriasCache = [];
let videosCache = [];

(async function iniciarAdmin() {
  const usuario = await exigirLogin();
  if (!usuario) return;
  usuarioAdmin = usuario;

  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("is_admin")
    .eq("id", usuario.id)
    .maybeSingle();

  if (!perfil?.is_admin) {
    alert("Esta área é só para administradores.");
    window.location.href = "catalogo.html";
    return;
  }

  await carregarCategoriasNoSelect();
  await carregarListaVideos();
  await carregarListaColecoes();

  document.getElementById("v-url").addEventListener("blur", () => {
    const bruto = document.getElementById("v-url").value;
    if (!bruto) return;
    const normalizado = normalizarUrlVideo(bruto);
    const capaAtual = document.getElementById("v-capa").value;
    if (!capaAtual) {
      const capaSugerida = sugerirCapaAutomatica(normalizado);
      if (capaSugerida) document.getElementById("v-capa").value = capaSugerida;
    }
  });
})();

function mostrarAba(nome) {
  document.querySelectorAll(".aba").forEach(el => el.classList.remove("ativa"));
  document.querySelector(`.aba[data-aba="${nome}"]`).classList.add("ativa");
  document.getElementById("aba-videos").style.display = nome === "videos" ? "block" : "none";
  document.getElementById("aba-colecoes").style.display = nome === "colecoes" ? "block" : "none";
}

async function carregarCategoriasNoSelect() {
  const { data } = await supabaseClient.from("categorias").select("*").order("ordem");
  categoriasCache = data || [];
  const select = document.getElementById("v-categoria");
  select.innerHTML = categoriasCache.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
}

async function salvarVideo() {
  const erroEl = document.getElementById("v-erro");
  erroEl.style.display = "none";

  const urlBruta = document.getElementById("v-url").value.trim();
  const titulo = document.getElementById("v-titulo").value.trim();
  const categoriaId = document.getElementById("v-categoria").value;

  if (!urlBruta || !titulo || !categoriaId) {
    erroEl.textContent = "Preencha ao menos o link, o título e a categoria.";
    erroEl.style.display = "block";
    return;
  }

  const urlNormalizada = normalizarUrlVideo(urlBruta);
  const capaDigitada = document.getElementById("v-capa").value.trim();
  const capaFinal = capaDigitada || sugerirCapaAutomatica(urlNormalizada);

  const { error } = await supabaseClient.from("videos").insert({
    titulo,
    descricao: document.getElementById("v-descricao").value.trim(),
    categoria_id: categoriaId,
    url_video: urlNormalizada,
    url_capa: capaFinal,
    fonte: "Adicionado manualmente",
    licenca: document.getElementById("v-licenca").value.trim(),
    ano: parseInt(document.getElementById("v-ano").value) || null
  });

  if (error) {
    erroEl.textContent = "Erro ao salvar: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  ["v-url", "v-titulo", "v-descricao", "v-capa", "v-ano"].forEach(id => document.getElementById(id).value = "");

  await carregarListaVideos();
}

async function carregarListaVideos() {
  const { data } = await supabaseClient.from("videos").select("*").order("criado_em", { ascending: false });
  videosCache = data || [];
  const container = document.getElementById("lista-videos");

  if (videosCache.length === 0) {
    container.innerHTML = '<p class="texto-muted">Nenhum vídeo cadastrado ainda.</p>';
    return;
  }

  container.innerHTML = videosCache.map(v => `
    <div class="lista-item">
      <span>${v.titulo}</span>
      <button onclick="apagarVideo('${v.id}')">Apagar</button>
    </div>
  `).join("");
}

async function apagarVideo(id) {
  if (!confirm("Apagar este vídeo do catálogo?")) return;
  await supabaseClient.from("videos").delete().eq("id", id);
  await carregarListaVideos();
}

async function salvarColecao() {
  const erroEl = document.getElementById("c-erro");
  erroEl.style.display = "none";

  const titulo = document.getElementById("c-titulo").value.trim();
  if (!titulo) {
    erroEl.textContent = "Dê um título para a coleção.";
    erroEl.style.display = "block";
    return;
  }

  const slug = gerarSlug(titulo);

  const { error } = await supabaseClient.from("colecoes").insert({
    titulo,
    slug,
    descricao: document.getElementById("c-descricao").value.trim(),
    capa_url: document.getElementById("c-capa").value.trim()
  });

  if (error) {
    erroEl.textContent = "Erro ao salvar: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  ["c-titulo", "c-descricao", "c-capa"].forEach(id => document.getElementById(id).value = "");
  await carregarListaColecoes();
}

async function carregarListaColecoes() {
  const { data: colecoes } = await supabaseClient.from("colecoes").select("*").order("ordem");
  const container = document.getElementById("lista-colecoes");

  if (!colecoes || colecoes.length === 0) {
    container.innerHTML = '<p class="texto-muted">Nenhuma coleção criada ainda.</p>';
    return;
  }

  container.innerHTML = colecoes.map(c => `
    <div class="lista-item" style="flex-direction:column; align-items:stretch;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${c.titulo}</strong>
        <div>
          <button onclick="alternarEdicaoColecao('${c.id}')" style="color:var(--accent-teal); margin-right:12px;">Gerenciar vídeos</button>
          <button onclick="apagarColecao('${c.id}')">Apagar</button>
        </div>
      </div>
      <div id="colecao-videos-${c.id}" style="display:none; margin-top:10px;"></div>
    </div>
  `).join("");
}

async function apagarColecao(id) {
  if (!confirm("Apagar esta coleção? (os vídeos continuam no catálogo normal)")) return;
  await supabaseClient.from("colecoes").delete().eq("id", id);
  await carregarListaColecoes();
}

async function alternarEdicaoColecao(colecaoId) {
  const painel = document.getElementById(`colecao-videos-${colecaoId}`);
  const abrir = painel.style.display === "none";
  painel.style.display = abrir ? "block" : "none";
  if (!abrir) return;

  if (videosCache.length === 0) {
    await carregarListaVideos();
  }

  const { data: jaNaColecao } = await supabaseClient
    .from("colecao_videos")
    .select("video_id")
    .eq("colecao_id", colecaoId);

  const idsNaColecao = new Set((jaNaColecao || []).map(v => v.video_id));

  painel.innerHTML = videosCache.map(v => `
    <div class="checkbox-linha">
      <input type="checkbox" ${idsNaColecao.has(v.id) ? "checked" : ""}
        onchange="alternarVideoNaColecao('${colecaoId}', '${v.id}', this.checked)">
      <span>${v.titulo}</span>
    </div>
  `).join("");
}

async function alternarVideoNaColecao(colecaoId, videoId, incluir) {
  if (incluir) {
    await supabaseClient.from("colecao_videos").insert({ colecao_id: colecaoId, video_id: videoId });
  } else {
    await supabaseClient.from("colecao_videos").delete().eq("colecao_id", colecaoId).eq("video_id", videoId);
  }
}
