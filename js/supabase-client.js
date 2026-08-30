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

async function usuarioEhAssinante(usuarioId) {
  const { data, error } = await supabaseClient
    .from("assinaturas")
    .select("status, data_expiracao")
    .eq("usuario_id", usuarioId)
    .eq("status", "ativa")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  if (!data.data_expiracao) return true;
  return new Date(data.data_expiracao) > new Date();
}
