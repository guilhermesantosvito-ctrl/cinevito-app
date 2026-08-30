// =========================================================
// CONFIGURAÇÃO DO SUPABASE
// =========================================================
const SUPABASE_URL = "https://cefyzitdkvtynhwsxdvv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AorMLpxhH9CHLdgKLigQoA_eVDgvJEv";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  if (error || !data) return false;
  if (!data.data_expiracao) return true;
  return new Date(data.data_expiracao) > new Date();
}

async function obterStatusAssinatura(usuarioId) {
  const { data } = await supabaseClient
    .from("assinaturas")
    .select("status, data_expiracao")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}
