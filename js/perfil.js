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
})();

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
