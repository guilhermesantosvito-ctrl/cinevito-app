(async function iniciarPerfil() {
  const usuario = await exigirLogin();
  if (!usuario) return;

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

  const { data: assinatura } = await supabaseClient
    .from("assinaturas")
    .select("status, plano, data_expiracao")
    .eq("usuario_id", usuario.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planoEl = document.getElementById("perfil-plano");
  const validadeEl = document.getElementById("perfil-validade");

  if (!assinatura || assinatura.status === "inativa") {
    planoEl.textContent = "Sem plano ativo";
    validadeEl.textContent = "";
  } else {
    const nomesPlano = { "teste-gratis": "Teste grátis" };
    planoEl.textContent = nomesPlano[assinatura.plano] || assinatura.plano || "Ativo";

    if (assinatura.data_expiracao) {
      const data = new Date(assinatura.data_expiracao);
      validadeEl.textContent = "Válido até " + data.toLocaleDateString("pt-BR");
    }
  }
})();

async function sairDoPerfil() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
