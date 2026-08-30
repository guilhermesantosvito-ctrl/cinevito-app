let usuarioAtual = null;
let planoSelecionado = "padrao";
let periodoSelecionado = "mensal";
let paymentBrickController = null;

const mp = new MercadoPago("APP_USR-471c3a9b-ff0f-4743-a417-e54b9f13e902", { locale: "pt-BR" });

const PLANOS = {
  basico: {
    nome: "Básico",
    dispositivos: 1,
    periodos: {
      mensal: { label: "Mensal", preco: 14.90 },
      trimestral: { label: "Trimestral", preco: 39.90 },
      anual: { label: "Anual", preco: 129.00 }
    }
  },
  padrao: {
    nome: "Padrão",
    dispositivos: 2,
    periodos: {
      mensal: { label: "Mensal", preco: 19.90 },
      trimestral: { label: "Trimestral", preco: 54.90 },
      anual: { label: "Anual", preco: 179.00 }
    }
  },
  premium: {
    nome: "Premium",
    dispositivos: 4,
    periodos: {
      mensal: { label: "Mensal", preco: 26.90 },
      trimestral: { label: "Trimestral", preco: 74.90 },
      anual: { label: "Anual", preco: 239.00 }
    }
  }
};

(async function iniciarAssinatura() {
  usuarioAtual = await exigirLogin();
  if (!usuarioAtual) return;

  const assinante = await usuarioEhAssinante(usuarioAtual.id);
  if (assinante) {
    document.getElementById("status-assinatura").style.display = "block";
    document.getElementById("planos-area").style.display = "none";
    return;
  }

  renderizarPeriodos();
})();

function selecionarPlano(plano) {
  planoSelecionado = plano;
  document.querySelectorAll(".aba-plano").forEach(el => el.classList.remove("ativa"));
  document.querySelector(`.aba-plano[data-plano="${plano}"]`).classList.add("ativa");
  periodoSelecionado = "mensal";
  renderizarPeriodos();
}

function renderizarPeriodos() {
  const dados = PLANOS[planoSelecionado];
  const container = document.getElementById("lista-periodos");
  container.innerHTML = "";

  Object.keys(dados.periodos).forEach(chave => {
    const periodo = dados.periodos[chave];
    const card = document.createElement("div");
    card.className = "plano-card" + (chave === periodoSelecionado ? " selecionado" : "");
    card.style.cursor = "pointer";
    card.onclick = () => {
      periodoSelecionado = chave;
      renderizarPeriodos();
    };
    card.innerHTML = `
      <div class="texto-muted">Plano ${dados.nome} — ${periodo.label}</div>
      <div class="plano-preco">R$ ${periodo.preco.toFixed(2).replace(".", ",")}
        <span style="font-size:13px; color:var(--text-muted);">/ ${chave === "mensal" ? "mês" : chave === "trimestral" ? "trimestre" : "ano"}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

async function continuarParaPagamento() {
  document.getElementById("planos-area").style.display = "none";
  document.getElementById("area-pagamento").style.display = "block";

  const dados = PLANOS[planoSelecionado];
  let preco = dados.periodos[periodoSelecionado].preco;

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
        bankTransfer: "all"
      }
    },
    callbacks: {
      onReady: () => {},
      onSubmit: (formData) => {
        return new Promise(async (resolve, reject) => {
          const chavePlano = `${planoSelecionado}-${periodoSelecionado}`;
          const mensagemEl = document.getElementById("mensagem-pagamento");
          mensagemEl.textContent = "";

          try {
            const { data, error } = await supabaseClient.functions.invoke("processar-pagamento", {
              body: {
                usuario_id: usuarioAtual.id,
                plano: chavePlano,
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
