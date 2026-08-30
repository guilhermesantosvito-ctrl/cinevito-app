let usuarioAtual = null;
let planoSelecionado = "padrao";

// Preços exibidos aqui são só para mostrar na tela.
// O valor cobrado de verdade é sempre conferido no servidor (Edge Function),
// então mesmo que alguém tente mexer no navegador, não muda o preço real.
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

let periodoSelecionado = "mensal";

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

async function assinar() {
  const erroEl = document.getElementById("assinatura-erro");
  erroEl.style.display = "none";

  const chavePlano = `${planoSelecionado}-${periodoSelecionado}`;

  try {
    const { data, error } = await supabaseClient.functions.invoke("criar-assinatura", {
      body: {
        usuario_id: usuarioAtual.id,
        email: usuarioAtual.email,
        plano: chavePlano
      }
    });

    if (error || !data?.checkout_url) {
      throw new Error(error?.message || "Resposta inválida do servidor");
    }

    window.location.href = data.checkout_url;

  } catch (e) {
    erroEl.textContent = "Não foi possível iniciar o checkout: " + e.message;
    erroEl.style.display = "block";
  }
}
