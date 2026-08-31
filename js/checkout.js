let usuarioAtual = null;
let planosDisponiveis = [];
let categoriasPlanos = [];
let categoriaSelecionada = null;
let planoSelecionadoId = null;
let paymentBrickController = null;

// Chave pública do Mercado Pago (segura pra ficar no navegador)
const mp = new MercadoPago("APP_USR-471c3a9b-ff0f-4743-a417-e54b9f13e902", { locale: "pt-BR" });

(async function iniciarAssinatura() {
  usuarioAtual = await exigirLogin();
  if (!usuarioAtual) return;

  const jaAssina = await usuarioTemAssinaturaPaga(usuarioAtual.id);
  if (jaAssina) {
    document.getElementById("status-assinatura").style.display = "block";
    document.getElementById("planos-area").style.display = "none";
    return;
  }

  await carregarPlanos();
})();

async function mostrarTrocaDePlano() {
  document.getElementById("status-assinatura").style.display = "none";
  document.getElementById("planos-area").style.display = "block";
  await carregarPlanos();
}

async function carregarPlanos() {
  const containerLista = document.getElementById("lista-planos");

  const { data, error } = await supabaseClient
    .from("planos")
    .select("*")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error || !data || data.length === 0) {
    containerLista.innerHTML = '<p class="texto-muted">Nenhum plano disponível no momento.</p>';
    return;
  }

  planosDisponiveis = data;

  // Agrupa os planos pela categoria (ex: Básico/Padrão/Premium), na ordem em que aparecem
  categoriasPlanos = [];
  planosDisponiveis.forEach(p => {
    const cat = p.categoria || p.nome;
    if (!categoriasPlanos.includes(cat)) categoriasPlanos.push(cat);
  });

  categoriaSelecionada = categoriasPlanos[0];
  const primeiroDaCategoria = planosDisponiveis.find(p => (p.categoria || p.nome) === categoriaSelecionada);
  planoSelecionadoId = primeiroDaCategoria ? primeiroDaCategoria.id : null;

  renderizarAbasPlanos();
  renderizarListaPlanos();
}

function renderizarAbasPlanos() {
  const container = document.getElementById("abas-planos");

  if (categoriasPlanos.length <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = categoriasPlanos.map(cat => {
    const exemplo = planosDisponiveis.find(p => (p.categoria || p.nome) === cat);
    const dispositivos = exemplo ? exemplo.dispositivos : 1;
    return `
      <div class="aba-plano${cat === categoriaSelecionada ? " ativa" : ""}" onclick="selecionarCategoria('${cat.replace(/'/g, "\\'")}')">
        <div class="aba-titulo">${cat}</div>
        <div class="aba-sub">${dispositivos} dispositivo${dispositivos > 1 ? "s" : ""}</div>
      </div>
    `;
  }).join("");
}

function selecionarCategoria(cat) {
  categoriaSelecionada = cat;
  const planosDaCategoria = planosDisponiveis.filter(p => (p.categoria || p.nome) === cat);
  planoSelecionadoId = planosDaCategoria.length > 0 ? planosDaCategoria[0].id : null;
  renderizarAbasPlanos();
  renderizarListaPlanos();
}

function renderizarListaPlanos() {
  const container = document.getElementById("lista-planos");
  const planosDaCategoria = planosDisponiveis.filter(p => (p.categoria || p.nome) === categoriaSelecionada);

  container.innerHTML = planosDaCategoria.map(p => `
    <div class="plano-card${p.id === planoSelecionadoId ? " selecionado" : ""}" style="cursor:pointer; margin-bottom:8px;" onclick="selecionarPlano('${p.id}')">
      <div class="texto-muted">${p.nome}${p.descricao ? " — " + p.descricao : ""}</div>
      <div class="plano-preco">R$ ${Number(p.preco).toFixed(2).replace(".", ",")}
        <span style="font-size:13px; color:var(--text-muted);">/ ${p.duracao_meses === 1 ? "mês" : p.duracao_meses + " meses"}</span>
      </div>
    </div>
  `).join("");
}

function selecionarPlano(id) {
  planoSelecionadoId = id;
  renderizarListaPlanos();
}

async function continuarParaPagamento() {
  document.getElementById("planos-area").style.display = "none";
  document.getElementById("area-pagamento").style.display = "block";

  const plano = planosDisponiveis.find(p => p.id === planoSelecionadoId);
  let preco = Number(plano.preco);

  const codigoCupom = document.getElementById("campo-cupom").value.trim().toUpperCase();
  let cupomValido = null;

  if (codigoCupom) {
    const { data: cupom } = await supabaseClient
      .from("cupons")
      .select("*")
      .eq("codigo", codigoCupom)
      .eq("ativo", true)
      .maybeSingle();

    if (cupom && (!cupom.valido_ate || new Date(cupom.valido_ate) >= new Date())) {
      cupomValido = codigoCupom;
      preco = Math.round((preco * (1 - cupom.percentual_desconto / 100)) * 100) / 100;
    }
  }

  if (paymentBrickController) {
    paymentBrickController.unmount();
  }

  const settings = {
    initialization: {
      amount: preco,
      payer: { email: usuarioAtual.email }
    },
    customization: {
      paymentMethods: {
        creditCard: "all",
        bankTransfer: "all" // habilita Pix
      }
    },
    callbacks: {
      onReady: () => {},
      onSubmit: ({ formData }) => {
        return new Promise(async (resolve, reject) => {
          const mensagemEl = document.getElementById("mensagem-pagamento");
          mensagemEl.textContent = "";

          try {
            const { data, error } = await supabaseClient.functions.invoke("processar-pagamento", {
              body: {
                usuario_id: usuarioAtual.id,
                plano_id: planoSelecionadoId,
                formData: formData,
                cupom: cupomValido
              }
            });

            if (error) throw new Error(error.message);

            if (data.status === "approved") {
              mensagemEl.style.color = "var(--accent-teal)";
              mensagemEl.textContent = "Pagamento aprovado! Redirecionando...";
              setTimeout(() => window.location.href = "catalogo.html", 1500);
              resolve();

            } else if (data.status === "pending" && data.pix_copia_cola) {
              document.getElementById("brick-pagamento").style.display = "none";
              const areaPix = document.getElementById("area-pix");
              areaPix.style.display = "block";
              areaPix.innerHTML = `
                <div class="pix-caixa">
                  <strong style="color:var(--accent-gold);">Escaneie ou copie o código Pix</strong>
                  <img src="data:image/png;base64,${data.pix_qr_base64}" alt="QR Code Pix">
                  <div class="pix-codigo" id="pix-codigo-texto">${data.pix_copia_cola}</div>
                  <button class="btn btn-secondary" style="margin-top:10px;" onclick="copiarCodigoPix()">Copiar código</button>
                  <p class="texto-muted" style="margin-top:10px;">Assim que o pagamento for confirmado, seu acesso libera automaticamente.</p>
                </div>
              `;
              resolve();

            } else {
              mensagemEl.style.color = "var(--danger)";
              mensagemEl.textContent = "Pagamento recusado: " + (data.motivo || "tente outro cartão.");
              reject();
            }

          } catch (e) {
            mensagemEl.style.color = "var(--danger)";
            mensagemEl.textContent = "Erro ao processar: " + e.message;
            reject();
          }
        });
      },
      onError: (error) => {
        console.error(error);
      }
    }
  };

  paymentBrickController = await mp.bricks().create("payment", "brick-pagamento", settings);
}

function voltarParaPlanos() {
  document.getElementById("area-pagamento").style.display = "none";
  document.getElementById("planos-area").style.display = "block";
  document.getElementById("area-pix").style.display = "none";
  document.getElementById("brick-pagamento").style.display = "block";
  document.getElementById("mensagem-pagamento").textContent = "";
  if (paymentBrickController) {
    paymentBrickController.unmount();
    paymentBrickController = null;
  }
}

function copiarCodigoPix() {
  const texto = document.getElementById("pix-codigo-texto").textContent;
  navigator.clipboard.writeText(texto);
  alert("Código Pix copiado!");
}
