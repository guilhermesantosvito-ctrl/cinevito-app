let usuarioAdmin = null;
let souAdminMaster = false;
let categoriasCache = [];
let videosCache = [];
let generosCacheAdmin = [];
let videoEditandoId = null;
let planosCacheAdmin = [];
let planoEditandoId = null;
let clientesCacheAdmin = [];
let clienteSelecionadoId = null;

(async function iniciarAdmin() {
  const usuario = await exigirLogin();
  if (!usuario) return;
  usuarioAdmin = usuario;

  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("is_admin, admin_master")
    .eq("id", usuario.id)
    .maybeSingle();

  if (!perfil?.is_admin) {
    alert("Esta área é só para administradores.");
    window.location.href = "catalogo.html";
    return;
  }

  souAdminMaster = !!perfil.admin_master;
  if (souAdminMaster) {
    document.getElementById("aba-btn-equipe").style.display = "block";
    document.getElementById("aba-btn-planos").style.display = "block";
    document.getElementById("aba-btn-indicacoes").style.display = "block";
  }

  await carregarCategoriasNoSelect();
  await carregarGenerosNoSelect();
  await carregarListaVideos();
  await carregarListaColecoes();
  await carregarListaGeneros();

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
  document.getElementById("aba-clientes").style.display = nome === "clientes" ? "block" : "none";
  document.getElementById("aba-planos").style.display = nome === "planos" ? "block" : "none";
  document.getElementById("aba-equipe").style.display = nome === "equipe" ? "block" : "none";
  document.getElementById("aba-indicacoes").style.display = nome === "indicacoes" ? "block" : "none";

  if (nome === "clientes") carregarClientes();
  if (nome === "planos") carregarListaPlanosAdmin();
  if (nome === "equipe") carregarEquipe();
  if (nome === "indicacoes") carregarListaCampanhasIndicacao();
}

// ================= GÊNEROS =================

async function carregarGenerosNoSelect() {
  const { data } = await supabaseClient.from("generos").select("*").order("ordem");
  generosCacheAdmin = data || [];
  const select = document.getElementById("v-genero");
  select.innerHTML = generosCacheAdmin.map(g => `<option value="${g.nome}">${g.nome}</option>`).join("");
}

async function adicionarGenero() {
  const erroEl = document.getElementById("g-erro");
  erroEl.style.display = "none";
  const nome = document.getElementById("g-nome").value.trim();

  if (!nome) {
    erroEl.textContent = "Digite o nome do gênero.";
    erroEl.style.display = "block";
    return;
  }

  const proximaOrdem = generosCacheAdmin.length > 0
    ? Math.max(...generosCacheAdmin.map(g => g.ordem || 0)) + 1
    : 1;

  const { error } = await supabaseClient.from("generos").insert({ nome, ordem: proximaOrdem });

  if (error) {
    erroEl.textContent = "Erro ao adicionar: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  document.getElementById("g-nome").value = "";
  await carregarGenerosNoSelect();
  await carregarListaGeneros();
}

async function carregarListaGeneros() {
  const container = document.getElementById("lista-generos");
  if (generosCacheAdmin.length === 0) {
    container.innerHTML = '<p class="texto-muted">Nenhum gênero cadastrado ainda.</p>';
    return;
  }
  container.innerHTML = generosCacheAdmin.map(g => `
    <div class="lista-item">
      <span>${g.nome}</span>
      <button onclick="apagarGenero('${g.id}')">Apagar</button>
    </div>
  `).join("");
}

async function apagarGenero(id) {
  if (!confirm("Apagar este gênero? (vídeos que já usam ele mantêm o texto, mas o filtro some)")) return;
  await supabaseClient.from("generos").delete().eq("id", id);
  await carregarGenerosNoSelect();
  await carregarListaGeneros();
}

// ================= VÍDEOS =================

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
  const genero = document.getElementById("v-genero").value;

  if (!urlBruta || !titulo || !categoriaId) {
    erroEl.textContent = "Preencha ao menos o link, o título e a categoria.";
    erroEl.style.display = "block";
    return;
  }

  const urlNormalizada = normalizarUrlVideo(urlBruta);
  const capaDigitada = document.getElementById("v-capa").value.trim();
  const capaFinal = capaDigitada || sugerirCapaAutomatica(urlNormalizada);

  const dadosVideo = {
    titulo,
    descricao: document.getElementById("v-descricao").value.trim(),
    categoria_id: categoriaId,
    genero: genero,
    url_video: urlNormalizada,
    url_capa: capaFinal,
    fonte: "Adicionado manualmente",
    licenca: document.getElementById("v-licenca").value.trim(),
    ano: parseInt(document.getElementById("v-ano").value) || null
  };

  let error;
  if (videoEditandoId) {
    ({ error } = await supabaseClient.from("videos").update(dadosVideo).eq("id", videoEditandoId));
  } else {
    ({ error } = await supabaseClient.from("videos").insert(dadosVideo));
  }

  if (error) {
    erroEl.textContent = "Erro ao salvar: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  cancelarEdicaoVideo();
  await carregarListaVideos();
}

function editarVideo(id) {
  const video = videosCache.find(v => v.id === id);
  if (!video) return;

  videoEditandoId = id;
  document.getElementById("v-url").value = video.url_video || "";
  document.getElementById("v-titulo").value = video.titulo || "";
  document.getElementById("v-descricao").value = video.descricao || "";
  document.getElementById("v-categoria").value = video.categoria_id || "";
  document.getElementById("v-genero").value = video.genero || "";
  document.getElementById("v-capa").value = video.url_capa || "";
  document.getElementById("v-licenca").value = video.licenca || "";
  document.getElementById("v-ano").value = video.ano || "";

  document.getElementById("botao-salvar-video").textContent = "Salvar alterações";
  document.getElementById("link-cancelar-edicao").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelarEdicaoVideo() {
  videoEditandoId = null;
  ["v-url", "v-titulo", "v-descricao", "v-capa", "v-ano"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("botao-salvar-video").textContent = "Adicionar ao catálogo";
  document.getElementById("link-cancelar-edicao").style.display = "none";
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
      <span>${v.titulo}${v.genero ? ' <span class="texto-muted">· ' + v.genero + '</span>' : ' <span class="texto-muted">· sem gênero</span>'}</span>
      <span>
        <button onclick="editarVideo('${v.id}')" style="color:var(--accent-teal); margin-right:10px;">Editar</button>
        <button onclick="apagarVideo('${v.id}')">Apagar</button>
      </span>
    </div>
  `).join("");
}

async function apagarVideo(id) {
  if (!confirm("Apagar este vídeo do catálogo?")) return;
  await supabaseClient.from("videos").delete().eq("id", id);
  await carregarListaVideos();
}

// ================= COLEÇÕES =================

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

// ================= CLIENTES (CRM) =================

async function carregarClientes() {
  const corpo = document.getElementById("corpo-tabela-clientes");
  corpo.innerHTML = '<tr><td colspan="8" class="texto-muted">Carregando...</td></tr>';

  const { data: perfis, error: erroPerfis } = await supabaseClient
    .from("profiles")
    .select("id, nome, email, data_nascimento, is_admin")
    .order("criado_em", { ascending: false });

  if (erroPerfis) {
    corpo.innerHTML = `<tr><td colspan="8" class="texto-muted">Erro ao carregar: ${erroPerfis.message}</td></tr>`;
    return;
  }

  const clientes = (perfis || []).filter(p => !p.is_admin);
  clientesCacheAdmin = clientes;

  const { data: assinaturas } = await supabaseClient
    .from("assinaturas")
    .select("usuario_id, status, plano, data_expiracao, criado_em")
    .order("criado_em", { ascending: false });

  const assinaturaPorUsuario = {};
  (assinaturas || []).forEach(a => {
    if (!assinaturaPorUsuario[a.usuario_id]) assinaturaPorUsuario[a.usuario_id] = a;
  });

  if (clientes.length === 0) {
    corpo.innerHTML = '<tr><td colspan="8" class="texto-muted">Nenhum cliente ainda.</td></tr>';
    return;
  }

  corpo.innerHTML = clientes.map(c => {
    const assinatura = assinaturaPorUsuario[c.id];
    let selo = '<span class="selo-status selo-inativa">Sem plano</span>';
    let plano = "-";
    let validade = "-";

    if (assinatura) {
      plano = assinatura.plano || "-";
      if (assinatura.data_expiracao) {
        validade = new Date(assinatura.data_expiracao).toLocaleDateString("pt-BR");
      }
      if (assinatura.status === "ativa") selo = '<span class="selo-status selo-ativa">Assinante</span>';
      else if (assinatura.status === "trial") selo = '<span class="selo-status selo-trial">Teste grátis</span>';
      else selo = '<span class="selo-status selo-inativa">Inativo</span>';
    }

    const aniversario = c.data_nascimento
      ? new Date(c.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      : "-";

    const nomeSeguro = (c.nome || "Sem nome").replace(/'/g, "\\'");

    return `
      <tr>
        <td>${c.nome || "Sem nome"}</td>
        <td>${c.email || "-"}</td>
        <td>${selo}</td>
        <td>${plano}</td>
        <td>${validade}</td>
        <td>${aniversario}</td>
        <td><a href="mailto:${c.email}">✉️ E-mail</a></td>
        <td><button onclick="abrirConcederAcesso('${c.id}', '${nomeSeguro}')" style="color:var(--accent-teal);">Conceder acesso</button></td>
      </tr>
    `;
  }).join("");
}

// ---- Conceder acesso manual (Fase 1 do CRM) ----

function abrirConcederAcesso(id, nome) {
  clienteSelecionadoId = id;
  document.getElementById("ca-cliente-nome").textContent = nome || "Sem nome";
  document.getElementById("ca-quantidade").value = 30;
  document.getElementById("ca-unidade").value = "dias";
  document.getElementById("ca-motivo").value = "";
  document.getElementById("ca-erro").style.display = "none";
  const painel = document.getElementById("painel-conceder-acesso");
  painel.style.display = "block";
  painel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function fecharPainelConceder() {
  clienteSelecionadoId = null;
  document.getElementById("painel-conceder-acesso").style.display = "none";
}

function sortearCliente() {
  if (!clientesCacheAdmin || clientesCacheAdmin.length === 0) {
    alert("Nenhum cliente carregado ainda. Abra a aba Clientes primeiro pra carregar a lista.");
    return;
  }
  const escolhido = clientesCacheAdmin[Math.floor(Math.random() * clientesCacheAdmin.length)];
  abrirConcederAcesso(escolhido.id, escolhido.nome || escolhido.email || "Sem nome");
}

async function confirmarConcederAcesso() {
  const erroEl = document.getElementById("ca-erro");
  erroEl.style.display = "none";

  if (!clienteSelecionadoId) return;

  const quantidade = parseInt(document.getElementById("ca-quantidade").value);
  const unidade = document.getElementById("ca-unidade").value;
  const motivo = document.getElementById("ca-motivo").value.trim();

  if (!quantidade || quantidade <= 0) {
    erroEl.textContent = "Digite uma quantidade válida.";
    erroEl.style.display = "block";
    return;
  }

  // Busca a assinatura ativa atual do cliente, se houver, pra somar o
  // tempo concedido (mesma regra de "nunca perde tempo pago" da renovação).
  const { data: ativaAtual } = await supabaseClient
    .from("assinaturas")
    .select("id, data_expiracao, limite_dispositivos")
    .eq("usuario_id", clienteSelecionadoId)
    .eq("status", "ativa")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agora = new Date();
  let base = agora;
  let dispositivosHerdados = 1;

  if (ativaAtual) {
    dispositivosHerdados = ativaAtual.limite_dispositivos || 1;
    if (ativaAtual.data_expiracao && new Date(ativaAtual.data_expiracao) > agora) {
      base = new Date(ativaAtual.data_expiracao);
    }
    await supabaseClient.from("assinaturas").update({ status: "substituida" }).eq("id", ativaAtual.id);
  }

  const expiracao = new Date(base);
  if (unidade === "dias") {
    expiracao.setDate(expiracao.getDate() + quantidade);
  } else {
    expiracao.setMonth(expiracao.getMonth() + quantidade);
  }

  const { error } = await supabaseClient.from("assinaturas").insert({
    usuario_id: clienteSelecionadoId,
    status: "ativa",
    plano: "Cortesia (concedido pelo admin)",
    plano_id: null,
    limite_dispositivos: dispositivosHerdados,
    data_inicio: agora.toISOString(),
    data_expiracao: expiracao.toISOString(),
    concedido_por_admin: true,
    motivo_concessao: motivo || null
  });

  if (error) {
    erroEl.textContent = "Erro ao conceder acesso: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  fecharPainelConceder();
  await carregarClientes();
}

// ================= PLANOS (só admin master) =================

async function carregarListaPlanosAdmin() {
  const container = document.getElementById("lista-planos-admin");
  const { data, error } = await supabaseClient
    .from("planos")
    .select("*")
    .order("ordem", { ascending: true });

  if (error) {
    container.innerHTML = `<p class="texto-muted">Erro ao carregar: ${error.message}</p>`;
    return;
  }

  planosCacheAdmin = data || [];

  if (planosCacheAdmin.length === 0) {
    container.innerHTML = '<p class="texto-muted">Nenhum plano cadastrado ainda.</p>';
    return;
  }

  container.innerHTML = planosCacheAdmin.map(p => {
    const duracaoTexto = p.duracao_dias
      ? `${p.duracao_dias} ${p.duracao_dias === 1 ? "dia" : "dias"}`
      : `${p.duracao_meses} ${p.duracao_meses === 1 ? "mês" : "meses"}`;

    return `
    <div class="lista-item">
      <span>
        ${p.nome} <span class="texto-muted">· ${p.categoria || "sem categoria"} · R$ ${Number(p.preco).toFixed(2).replace(".", ",")} · ${duracaoTexto} · ${p.dispositivos} disp.</span>
        ${p.ativo ? '<span class="selo-status selo-ativa">Ativo</span>' : '<span class="selo-status selo-inativa">Desativado</span>'}
      </span>
      <span>
        <button onclick="editarPlano('${p.id}')" style="color:var(--accent-teal); margin-right:10px;">Editar</button>
        <button onclick="alternarAtivoPlano('${p.id}', ${!p.ativo})" style="color:var(--accent-teal); margin-right:10px;">${p.ativo ? "Desativar" : "Ativar"}</button>
        <button onclick="apagarPlano('${p.id}')">Apagar</button>
      </span>
    </div>
  `;
  }).join("");
}

async function salvarPlano() {
  const erroEl = document.getElementById("p-erro");
  erroEl.style.display = "none";

  const nome = document.getElementById("p-nome").value.trim();
  const categoria = document.getElementById("p-categoria").value.trim();
  const descricao = document.getElementById("p-descricao").value.trim();
  const preco = parseFloat(document.getElementById("p-preco").value);
  const dispositivos = parseInt(document.getElementById("p-dispositivos").value) || 1;
  const quantidadeDuracao = parseInt(document.getElementById("p-duracao").value) || 1;
  const unidadeDuracao = document.getElementById("p-duracao-unidade").value;

  if (!nome || isNaN(preco) || preco <= 0) {
    erroEl.textContent = "Preencha ao menos o nome e um preço válido (maior que zero — o Mercado Pago não aceita cobrança de R$ 0,00; pra dar acesso grátis a um cliente específico, use \"Conceder acesso\" na aba Clientes).";
    erroEl.style.display = "block";
    return;
  }

  const dadosPlano = {
    nome,
    categoria: categoria || nome,
    descricao,
    preco,
    dispositivos,
    // "duracao_meses" não pode ficar vazio no banco, então quando a
    // unidade escolhida é "dias" guardamos 0 nele (sinal de "veja
    // duracao_dias") e o valor de verdade vai em duracao_dias.
    duracao_meses: unidadeDuracao === "meses" ? quantidadeDuracao : 0,
    duracao_dias: unidadeDuracao === "dias" ? quantidadeDuracao : null
  };

  let error;
  if (planoEditandoId) {
    ({ error } = await supabaseClient.from("planos").update(dadosPlano).eq("id", planoEditandoId));
  } else {
    const proximaOrdem = planosCacheAdmin.length > 0
      ? Math.max(...planosCacheAdmin.map(p => p.ordem || 0)) + 1
      : 1;
    ({ error } = await supabaseClient.from("planos").insert({ ...dadosPlano, ordem: proximaOrdem }));
  }

  if (error) {
    erroEl.textContent = "Erro ao salvar: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  cancelarEdicaoPlano();
  await carregarListaPlanosAdmin();
}

function editarPlano(id) {
  const plano = planosCacheAdmin.find(p => p.id === id);
  if (!plano) return;

  planoEditandoId = id;
  document.getElementById("p-nome").value = plano.nome || "";
  document.getElementById("p-categoria").value = plano.categoria || "";
  document.getElementById("p-descricao").value = plano.descricao || "";
  document.getElementById("p-preco").value = plano.preco || "";
  document.getElementById("p-dispositivos").value = plano.dispositivos || 1;

  if (plano.duracao_dias) {
    document.getElementById("p-duracao").value = plano.duracao_dias;
    document.getElementById("p-duracao-unidade").value = "dias";
  } else {
    document.getElementById("p-duracao").value = plano.duracao_meses || 1;
    document.getElementById("p-duracao-unidade").value = "meses";
  }

  document.getElementById("botao-salvar-plano").textContent = "Salvar alterações";
  document.getElementById("link-cancelar-edicao-plano").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelarEdicaoPlano() {
  planoEditandoId = null;
  ["p-nome", "p-categoria", "p-descricao", "p-preco"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("p-dispositivos").value = 1;
  document.getElementById("p-duracao").value = 1;
  document.getElementById("p-duracao-unidade").value = "meses";
  document.getElementById("botao-salvar-plano").textContent = "Criar plano";
  document.getElementById("link-cancelar-edicao-plano").style.display = "none";
}

async function alternarAtivoPlano(id, novoValor) {
  await supabaseClient.from("planos").update({ ativo: novoValor }).eq("id", id);
  await carregarListaPlanosAdmin();
}

async function apagarPlano(id) {
  if (!confirm("Apagar este plano? Assinaturas antigas que já usaram ele continuam registradas normalmente, só some da lista de opções pra novos clientes.")) return;
  await supabaseClient.from("planos").delete().eq("id", id);
  await carregarListaPlanosAdmin();
}

// ================= EQUIPE (só admin master) =================

async function carregarEquipe() {
  const container = document.getElementById("lista-equipe");
  container.innerHTML = "Carregando...";

  const { data: perfis, error } = await supabaseClient
    .from("profiles")
    .select("id, nome, email, admin_master")
    .eq("is_admin", true)
    .order("criado_em", { ascending: true });

  if (error) {
    container.innerHTML = `<p class="texto-muted">Erro ao carregar: ${error.message}</p>`;
    return;
  }

  if (!perfis || perfis.length === 0) {
    container.innerHTML = '<p class="texto-muted">Ninguém além de você tem acesso ainda.</p>';
    return;
  }

  container.innerHTML = perfis.map(p => {
    const ehVoce = p.id === usuarioAdmin.id;
    const selo = p.admin_master
      ? '<span class="selo-status selo-trial">Admin master</span>'
      : '<span class="selo-status selo-ativa">Equipe</span>';

    let acoes = '<span class="texto-muted">Você</span>';
    if (!ehVoce) {
      acoes = p.admin_master
        ? `<button onclick="rebaixarParaEquipe('${p.id}')">Tornar equipe</button>`
        : `<button onclick="promoverParaMaster('${p.id}')" style="color:var(--accent-teal); margin-right:10px;">Tornar master</button>
           <button onclick="removerDaEquipe('${p.id}')">Remover acesso</button>`;
    }

    return `
      <div class="lista-item">
        <span>${p.nome || "Sem nome"} <span class="texto-muted">· ${p.email}</span> ${selo}</span>
        <span>${acoes}</span>
      </div>
    `;
  }).join("");
}

async function adicionarNaEquipe() {
  const erroEl = document.getElementById("eq-erro");
  erroEl.style.display = "none";
  const email = document.getElementById("eq-email").value.trim().toLowerCase();

  if (!email) {
    erroEl.textContent = "Digite o e-mail da pessoa.";
    erroEl.style.display = "block";
    return;
  }

  const { data: perfil, error: erroBusca } = await supabaseClient
    .from("profiles")
    .select("id, is_admin")
    .eq("email", email)
    .maybeSingle();

  if (erroBusca || !perfil) {
    erroEl.textContent = "Não encontrei ninguém com esse e-mail. A pessoa precisa criar uma conta no CineVito primeiro.";
    erroEl.style.display = "block";
    return;
  }

  if (perfil.is_admin) {
    erroEl.textContent = "Essa pessoa já tem acesso ao painel.";
    erroEl.style.display = "block";
    return;
  }

  const { error: erroUpdate } = await supabaseClient
    .from("profiles")
    .update({ is_admin: true, admin_master: false })
    .eq("id", perfil.id);

  if (erroUpdate) {
    erroEl.textContent = "Erro ao dar acesso: " + erroUpdate.message;
    erroEl.style.display = "block";
    return;
  }

  document.getElementById("eq-email").value = "";
  await carregarEquipe();
}

async function promoverParaMaster(id) {
  if (!confirm("Tornar essa pessoa admin master? Ela vai poder adicionar e remover outros administradores, e criar/editar planos, igual você.")) return;
  await supabaseClient.from("profiles").update({ admin_master: true }).eq("id", id);
  await carregarEquipe();
}

async function rebaixarParaEquipe(id) {
  if (!confirm("Tirar o acesso de admin master dessa pessoa? Ela continua com acesso ao painel, mas não vai poder mais gerenciar outros administradores nem os planos.")) return;
  await supabaseClient.from("profiles").update({ admin_master: false }).eq("id", id);
  await carregarEquipe();
}

async function removerDaEquipe(id) {
  if (!confirm("Remover o acesso dessa pessoa ao painel administrativo?")) return;
  await supabaseClient.from("profiles").update({ is_admin: false, admin_master: false }).eq("id", id);
  await carregarEquipe();
}

// ================= INDICAÇÕES (só admin master) =================

let campanhasIndicacaoCache = [];

async function carregarListaCampanhasIndicacao() {
  const container = document.getElementById("lista-campanhas-indicacao");
  const { data, error } = await supabaseClient
    .from("campanhas_indicacao")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="texto-muted">Erro ao carregar: ${error.message}</p>`;
    return;
  }

  campanhasIndicacaoCache = data || [];

  if (campanhasIndicacaoCache.length === 0) {
    container.innerHTML = '<p class="texto-muted">Nenhuma campanha criada ainda.</p>';
    return;
  }

  container.innerHTML = campanhasIndicacaoCache.map(c => `
    <div class="lista-item">
      <span>
        ${c.titulo} <span class="texto-muted">· indique ${c.meta_indicacoes} ganhe ${c.recompensa_quantidade} ${c.recompensa_unidade}</span>
        ${c.ativa ? '<span class="selo-status selo-ativa">Ativa</span>' : '<span class="selo-status selo-inativa">Inativa</span>'}
      </span>
      <span>
        <button onclick="prepararEmailCampanha('${c.id}')" style="color:var(--accent-teal); margin-right:10px;">✉️ Preparar e-mail</button>
        ${c.ativa
          ? `<button onclick="desativarCampanhaIndicacao('${c.id}')">Desativar</button>`
          : `<button onclick="ativarCampanhaIndicacao('${c.id}')" style="color:var(--accent-teal); margin-right:10px;">Ativar</button>
             <button onclick="apagarCampanhaIndicacao('${c.id}')">Apagar</button>`
        }
      </span>
    </div>
  `).join("");
}

async function prepararEmailCampanha(campanhaId) {
  const campanha = campanhasIndicacaoCache.find(c => c.id === campanhaId);
  if (!campanha) return;

  const { data: perfis, error } = await supabaseClient
    .from("profiles")
    .select("email")
    .eq("is_admin", false);

  if (error) {
    alert("Erro ao buscar e-mails dos clientes: " + error.message);
    return;
  }

  const emails = (perfis || []).map(p => p.email).filter(Boolean);

  if (emails.length === 0) {
    alert("Nenhum cliente com e-mail cadastrado ainda.");
    return;
  }

  if (emails.length > 80) {
    const continuar = confirm(
      `Você tem ${emails.length} clientes cadastrados. Links de e-mail (mailto) não são feitos pra listas grandes — seu programa de e-mail pode travar ou cortar destinatários. Continuar mesmo assim?`
    );
    if (!continuar) return;
  }

  const assunto = encodeURIComponent(`🎬 Nova campanha no CineVito: ${campanha.titulo}`);
  const corpo = encodeURIComponent(
`Oi!

Temos uma novidade no CineVito: ${campanha.titulo}

Indique ${campanha.meta_indicacoes} amigos e, quando eles assinarem um plano pago, você ganha ${campanha.recompensa_quantidade} ${campanha.recompensa_unidade} grátis!

Seu código de indicação está no seu perfil, dentro do app — é só compartilhar o link com quem quiser.

Equipe CineVito`
  );

  window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${assunto}&body=${corpo}`;
}

async function salvarCampanhaIndicacao() {
  const erroEl = document.getElementById("ind-erro");
  erroEl.style.display = "none";

  const titulo = document.getElementById("ind-titulo").value.trim();
  const meta = parseInt(document.getElementById("ind-meta").value);
  const recompensaQtd = parseInt(document.getElementById("ind-recompensa-qtd").value);
  const recompensaUnidade = document.getElementById("ind-recompensa-unidade").value;

  if (!titulo || !meta || meta <= 0 || !recompensaQtd || recompensaQtd <= 0) {
    erroEl.textContent = "Preencha o título, uma meta e uma recompensa válidas.";
    erroEl.style.display = "block";
    return;
  }

  const { error } = await supabaseClient.from("campanhas_indicacao").insert({
    titulo,
    meta_indicacoes: meta,
    recompensa_quantidade: recompensaQtd,
    recompensa_unidade: recompensaUnidade,
    ativa: false
  });

  if (error) {
    erroEl.textContent = "Erro ao criar campanha: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  document.getElementById("ind-titulo").value = "";
  document.getElementById("ind-meta").value = 5;
  document.getElementById("ind-recompensa-qtd").value = 1;
  document.getElementById("ind-recompensa-unidade").value = "meses";
  await carregarListaCampanhasIndicacao();
}

async function ativarCampanhaIndicacao(id) {
  if (!confirm("Ativar essa campanha? A campanha ativa atual (se houver) será desativada automaticamente.")) return;
  // Só uma campanha ativa por vez: desativa todas antes de ativar a escolhida
  await supabaseClient.from("campanhas_indicacao").update({ ativa: false }).eq("ativa", true);
  await supabaseClient.from("campanhas_indicacao").update({ ativa: true }).eq("id", id);
  await carregarListaCampanhasIndicacao();
}

async function desativarCampanhaIndicacao(id) {
  if (!confirm("Desativar essa campanha? Os clientes vão parar de ver o progresso de indicação até você ativar outra.")) return;
  await supabaseClient.from("campanhas_indicacao").update({ ativa: false }).eq("id", id);
  await carregarListaCampanhasIndicacao();
}

async function apagarCampanhaIndicacao(id) {
  if (!confirm("Apagar esta campanha? Indicações já confirmadas nela continuam registradas, só não aparece mais na lista.")) return;
  await supabaseClient.from("campanhas_indicacao").delete().eq("id", id);
  await carregarListaCampanhasIndicacao();
}
