// =========================================================
// CONFIGURAÇÃO DO SUPABASE
// =========================================================
const SUPABASE_URL = "https://cefyzitdkvtynhwsxdvv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AorMLpxhH9CHLdgKLigQoA_eVDgvJEv";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------
// Funções auxiliares reutilizadas em várias telas
// ---------------------------------------------------------

async function getUsuarioLogado() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

async function exigirLogin() {
  const user = await getUsuarioLogado();
  if (!user) {
    window.location.href = "index.html";
  }
  return user;
}

// Administradores e equipe sempre têm acesso total, sem precisar de
// teste grátis nem assinatura — isso é só para clientes.
async function usuarioEhAdmin(usuarioId) {
  const { data } = await supabaseClient
    .from("profiles")
    .select("is_admin")
    .eq("id", usuarioId)
    .maybeSingle();
  return !!data?.is_admin;
}

async function usuarioEhAssinante(usuarioId) {
  if (await usuarioEhAdmin(usuarioId)) return true;

  const { data, error } = await supabaseClient
    .from("assinaturas")
    .select("status, data_expiracao")
    .eq("usuario_id", usuarioId)
    .in("status", ["ativa", "trial"])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    if (!data.data_expiracao) return true;
    if (new Date(data.data_expiracao) > new Date()) return true;
  }

  // Rede de segurança: mesmo sem registro de assinatura (ou se o
  // teste grátis não foi concedido por algum motivo), ninguém é
  // cobrado antes de completar 2 dias desde a criação da conta.
  return await aindaDentroDoPrazoDeContaNova(usuarioId);
}

// Diferente de usuarioEhAssinante(): essa função só retorna true se
// a pessoa tem uma assinatura PAGA de verdade (status "ativa").
// Teste grátis não conta aqui — usada na tela de planos, pra sempre
// deixar quem está em teste grátis assinar antes do prazo acabar.
async function usuarioTemAssinaturaPaga(usuarioId) {
  const { data, error } = await supabaseClient
    .from("assinaturas")
    .select("status, data_expiracao")
    .eq("usuario_id", usuarioId)
    .eq("status", "ativa")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    if (!data.data_expiracao) return true;
    if (new Date(data.data_expiracao) > new Date()) return true;
  }

  return false;
}

async function aindaDentroDoPrazoDeContaNova(usuarioId) {
  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("criado_em")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!perfil?.criado_em) return false;

  const doisDiasDepois = new Date(perfil.criado_em);
  doisDiasDepois.setDate(doisDiasDepois.getDate() + 2);
  return new Date() < doisDiasDepois;
}

// Retorna os detalhes da assinatura/teste atual, para mostrar avisos
// de quantos dias faltam (usado no aviso fechável do catálogo)
async function obterStatusAssinatura(usuarioId) {
  const { data } = await supabaseClient
    .from("assinaturas")
    .select("status, data_expiracao")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) return data;

  // Sem nenhum registro de assinatura — mostra o teste grátis baseado
  // na data de criação da conta, como rede de segurança.
  const { data: perfil } = await supabaseClient
    .from("profiles")
    .select("criado_em")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!perfil?.criado_em) return null;

  const expiracao = new Date(perfil.criado_em);
  expiracao.setDate(expiracao.getDate() + 2);

  return { status: "trial", data_expiracao: expiracao.toISOString() };
}
