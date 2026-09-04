let usuarioPerfil = null;

(async function iniciarPerfil() {
  const usuario = await exigirLogin();
  if (!usuario) return;
  usuarioPerfil = usuario;

  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("nome, email")
    .eq("id", usuario.id)
    .maybeSingle();

  const nome = perfil?.nome || "Sem nome";
  const email = perfil?.email || usuario.email;

  document.getElementById("perfil-nome").textContent = nome;
  document.getElementById("perfil-email").textContent = email;
  document.getElementById("avatar-grande").textContent = nome.charAt(0).toUpperCase();

  document.getElementById("editar-nome").value = perfil?.nome || "";
  document.getElementById("editar-email").value = email;

  const { data: assinatura } = await supabaseClient
    .from("assinaturas")
    .select("status, plano, data_expiracao")
    .eq("usuario_id", usuario.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planoEl = document.getElementById("perfil-plano");
  const validadeEl = document.getElementById("perfil-validade");
  const botaoCancelar = document.getElementById("botao-cancelar-assinatura");

  // Só considera "plano ativo" quando o pagamento foi realmente confirmado
  // (status "ativa") ou é um teste grátis em andamento (status "trial").
  // "pendente" (tentativa em andamento) e "inativa"/"substituida" não contam.
  if (assinatura && (assinatura.status === "ativa" || assinatura.status === "trial")) {
    const nomesPlano = { "teste-gratis": "Teste grátis" };
    planoEl.textContent = nomesPlano[assinatura.plano] || assinatura.plano || "Ativo";

    if (assinatura.data_expiracao) {
      const data = new Date(assinatura.data_expiracao);
      validadeEl.textContent = "Válido até " + data.toLocaleDateString("pt-BR");
    } else {
      validadeEl.textContent = "";
    }

    botaoCancelar.style.display = assinatura.status === "ativa" ? "block" : "none";
  } else {
    planoEl.textContent = "Sem plano ativo";
    validadeEl.textContent = "";
    botaoCancelar.style.display = "none";
  }

  await carregarIndicacao();
})();

async function carregarIndicacao() {
  const { data, error } = await supabaseClient.rpc("minhas_indicacoes_stats");
  if (error || !data || data.length === 0) return;

  const stats = data[0];
  if (!stats.codigo) return; // ainda não fez nenhuma assinatura paga, não tem código ainda

  document.getElementById("cartao-indicacao").style.display = "block";
  document.getElementById("ind-codigo-texto").textContent = stats.codigo;

  const areaStatus = document.getElementById("ind-status-campanha");
  if (stats.tem_campanha_ativa) {
    areaStatus.innerHTML = `
      <strong style="color:var(--accent-gold);">${stats.campanha_titulo}</strong>
      <p class="texto-muted" style="margin:4px 0 0;">Você já tem ${stats.confirmadas} de ${stats.meta_indicacoes} indicações confirmadas. Complete a meta e ganhe ${stats.recompensa_quantidade} ${stats.recompensa_unidade} grátis!</p>
    `;
  } else {
    areaStatus.innerHTML = '<p class="texto-muted">Nenhuma campanha de indicação ativa no momento. Guarde seu código — avisamos quando tiver uma nova!</p>';
  }
}

function copiarCodigoIndicacao() {
  const texto = document.getElementById("ind-codigo-texto").textContent;
  if (!texto || texto === "-") return;
  const link = window.location.origin + "/index.html?ref=" + texto;
  navigator.clipboard.writeText(link);
  alert("Link de indicação copiado! Cole onde quiser compartilhar.");
}

async function cancelarAssinatura() {
  if (!confirm("Cancelar sua assinatura agora? Você perde o acesso ao catálogo imediatamente.")) return;

  const { data: atual } = await supabaseClient
    .from("assinaturas")
    .select("id")
    .eq("usuario_id", usuarioPerfil.id)
    .eq("status", "ativa")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!atual) return;

  const { error } = await supabaseClient
    .from("assinaturas")
    .update({ status: "inativa" })
    .eq("id", atual.id);

  if (error) {
    alert("Não foi possível cancelar: " + error.message);
    return;
  }

  document.getElementById("perfil-plano").textContent = "Sem plano ativo";
  document.getElementById("perfil-validade").textContent = "";
  document.getElementById("botao-cancelar-assinatura").style.display = "none";
}

async function salvarEdicaoPerfil() {
  const erroEl = document.getElementById("editar-erro");
  const sucessoEl = document.getElementById("editar-sucesso");
  erroEl.style.display = "none";
  sucessoEl.style.display = "none";

  const novoNome = document.getElementById("editar-nome").value.trim();
  const novoEmail = document.getElementById("editar-email").value.trim();

  if (!novoNome || !novoEmail) {
    erroEl.textContent = "Preencha nome e e-mail.";
    erroEl.style.display = "block";
    return;
  }

  const { data: perfilAtual } = await supabaseClient
    .from("profiles")
    .select("nome, email")
    .eq("id", usuarioPerfil.id)
    .maybeSingle();

  const registrosMudanca = [];
  if (perfilAtual?.nome !== novoNome) {
    registrosMudanca.push({
      usuario_id: usuarioPerfil.id,
      campo: "nome",
      valor_antigo: perfilAtual?.nome || null,
      valor_novo: novoNome
    });
  }
  const emailAtualDeVerdade = (usuarioPerfil.email || "").toLowerCase();
  const emailMudou = novoEmail.toLowerCase() !== emailAtualDeVerdade;
  if (emailMudou) {
    registrosMudanca.push({
      usuario_id: usuarioPerfil.id,
      campo: "email",
      valor_antigo: usuarioPerfil.email || null,
      valor_novo: novoEmail
    });
  }

  const { error: erroPerfil } = await supabaseClient
    .from("profiles")
    .update({ nome: novoNome, email: novoEmail })
    .eq("id", usuarioPerfil.id);

  if (erroPerfil) {
    erroEl.textContent = "Erro ao salvar: " + erroPerfil.message;
    erroEl.style.display = "block";
    return;
  }

  if (emailMudou) {
    const { error: erroAuth } = await supabaseClient.auth.updateUser({ email: novoEmail });
    if (erroAuth) {
      erroEl.textContent = "Nome salvo, mas não foi possível atualizar o e-mail de login: " + erroAuth.message;
      erroEl.style.display = "block";
      return;
    }
  }

  // Registra a mudança pra fins de CRM/recorrência
  if (registrosMudanca.length > 0) {
    await supabaseClient.from("alteracoes_perfil").insert(registrosMudanca);
  }

  sucessoEl.textContent = emailMudou
    ? "Salvo! Verifique seu e-mail antigo ou novo para confirmar a troca de e-mail."
    : "Informações atualizadas!";
  sucessoEl.style.display = "block";

  document.getElementById("perfil-nome").textContent = novoNome;
  document.getElementById("perfil-email").textContent = novoEmail;
  document.getElementById("avatar-grande").textContent = novoNome.charAt(0).toUpperCase();
}

async function sairDoPerfil() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
