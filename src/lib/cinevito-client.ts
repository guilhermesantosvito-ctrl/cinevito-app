export type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: { nome?: string; name?: string; nascimento?: string; [key: string]: unknown };
  created_at?: string;
};
export type Video = {
  id: string;
  titulo: string;
  descricao?: string | null;
  genero?: string | null;
  url_video?: string | null;
  url_capa?: string | null;
  ano?: number | null;
  premium?: boolean | null;
  categoria?: string | null;
  categoria_id?: string | null;
  fonte?: string | null;
  licenca?: string | null;
};
export type Plan = {
  id: string;
  nome: string;
  categoria?: string | null;
  descricao?: string | null;
  preco?: number | null;
  duracao_meses?: number | null;
  duracao_dias?: number | null;
  limite_dispositivos?: number | null;
  dispositivos?: number | null;
  ativo?: boolean | null;
  ordem?: number | null;
};
export type ClienteAssinatura = {
  status?: string | null;
  plano?: string | null;
  data_expiracao?: string | null;
  data_inicio?: string | null;
  criado_em?: string | null;
  limite_dispositivos?: number | null;
};
export type Cliente = {
  id: string;
  nome?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  criado_em?: string | null;
  is_admin?: boolean | null;
  assinatura?: ClienteAssinatura | null;
};
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const SESSION_KEY = 'cinevito-auth-session';
const SUPABASE_SESSION_KEY = 'sb-cefyzitdkvtynhwsxdvv-auth-token';
const BACKGROUND_KEY = 'cinevito-background-since';
const BACKGROUND_LIMIT_MS = 3 * 60 * 1000;
export const MASTER_ADMIN_EMAIL = 'guilhermesantosvito@gmail.com';
export const hasRuntimeConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
function isExpiredSession() {
  const since = Number(localStorage.getItem(BACKGROUND_KEY) || 0);
  return since > 0 && Date.now() - since >= BACKGROUND_LIMIT_MS;
}
function storedSession(): { access_token: string; refresh_token?: string; expires_in?: number; expires_at?: number; token_type?: string; user: SessionUser } | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
export function getStoredUser(): SessionUser | null {
  if (isExpiredSession()) { clearSession(); return null; }
  const sessionUser = storedSession()?.user;
  if (sessionUser) return sessionUser;
  const demoEmail = localStorage.getItem('cinevito-demo-user');
  return demoEmail ? { id: 'demo-user', email: demoEmail, user_metadata: { nome: demoEmail.split('@')[0] } } : null;
}
export function getAccessToken(): string | null {
  return storedSession()?.access_token ?? null;
}
function saveSession(session: { access_token: string; refresh_token?: string; expires_in?: number; expires_at?: number; token_type?: string; user: SessionUser }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify({ ...session, expires_at: session.expires_at || (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : undefined) }));
  localStorage.removeItem(BACKGROUND_KEY);
  window.dispatchEvent(new Event('cinevito-auth-change'));
}
function checkBackgroundLogout() {
  const estavaExpirada = isExpiredSession();
  if (estavaExpirada) {
    clearSession();
    if (typeof window !== 'undefined' && window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      window.location.href = '/';
      return;
    }
  }
  window.dispatchEvent(new Event('cinevito-auth-change'));
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) localStorage.setItem(BACKGROUND_KEY, String(Date.now()));
    else checkBackgroundLogout();
  });
  window.addEventListener('pageshow', checkBackgroundLogout);
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SUPABASE_SESSION_KEY);
  localStorage.removeItem(BACKGROUND_KEY);
  localStorage.removeItem('cinevito-demo-user');
  window.dispatchEvent(new Event('cinevito-auth-change'));
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!hasRuntimeConfig) throw new Error('A configuração do CineVito ainda não está disponível neste ambiente.');
  const token = getAccessToken();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }
  if (!response.ok) {
    const message = typeof parsed === 'object' && parsed && 'msg' in parsed ? String(parsed.msg) :
      typeof parsed === 'object' && parsed && 'message' in parsed ? String(parsed.message) :
      `Não foi possível concluir a operação (${response.status}).`;
    throw new Error(message);
  }
  return parsed as T;
}
export async function signIn(email: string, password: string) {
  const result = await request<{ access_token: string; refresh_token?: string; expires_in?: number; expires_at?: number; token_type?: string; user: SessionUser }>(
    '/auth/v1/token?grant_type=password',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  saveSession(result);
  return result.user;
}
export async function signUp(nome: string, email: string, password: string, nascimento?: string, codigo?: string) {
  const result = await request<{ access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; token_type?: string; user: SessionUser }>(
    '/auth/v1/signup',
    { method: 'POST', body: JSON.stringify({ email, password, data: { nome, nascimento, codigo_indicacao: codigo || undefined } }) },
  );
  if (result.access_token) saveSession(result as { access_token: string; user: SessionUser });
  return result;
}
export async function fetchVideos(): Promise<Video[]> {
  return request<Video[]>('/rest/v1/videos?select=*&order=criado_em.desc');
}
export async function fetchPlans(): Promise<Plan[]> {
  return request<Plan[]>('/rest/v1/planos?select=*&ativo=eq.true&order=ordem.asc,preco.asc');
}
export async function fetchProfile() {
  const user = getStoredUser();
  if (!user) return null;
  const rows = await request<Array<{ nome?: string; email?: string; is_admin?: boolean; admin_master?: boolean; codigo_indicacao?: string; nascimento?: string }>>(
    `/rest/v1/profiles?select=nome,email,is_admin,admin_master,codigo_indicacao&id=eq.${encodeURIComponent(user.id)}&limit=1`,
  );
  return rows[0] || { nome: user.user_metadata?.nome || user.user_metadata?.name, email: user.email };
}
export async function invokeVerifier(url: string) {
  const result = await request<{
    links?: Array<{ url: string; status?: string; detalhe?: string; mensagem?: string; tipo?: string }>;
    resultados?: Array<{ url: string; status?: string; detalhe?: string; mensagem?: string; tipo?: string }>;
    total?: number;
    linksEncontrados?: number;
    error?: string;
  }>(
    '/functions/v1/verificar-videos',
    { method: 'POST', body: JSON.stringify({ url }) },
  );
  const links = result.links ?? result.resultados ?? [];
  return {
    ...result,
    total: result.total ?? result.linksEncontrados ?? links.length,
    links: links.map((item) => ({
      ...item,
      detalhe: item.detalhe ?? item.mensagem,
    })),
  };
}
export async function submitSuggestion(payload: { titulo: string; mensagem: string }) {
  return request('/rest/v1/sugestoes_filmes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ titulo: payload.titulo, mensagem: payload.mensagem }),
  });
}
export async function updateProfile(payload: { nome: string }) {
  const user = getStoredUser();
  if (!user) throw new Error('Faça login para editar o perfil.');
  const updated = await request<SessionUser>('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ data: { ...(user.user_metadata || {}), nome: payload.nome.trim() } }) });
  const session = storedSession();
  if (session) saveSession({ ...session, user: updated });
  try { await request('/rest/v1/profiles?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: user.id, nome: payload.nome.trim(), email: user.email }) }); } catch { /* O perfil de autenticação já foi atualizado; algumas bases antigas não permitem upsert em profiles. */ }
  return updated;
}
export async function processPayment(payload: { usuario_id: string; plano_id: string; formData: unknown; cupom?: string | null }) {
  return request<{ status: string; motivo?: string; pix_copia_cola?: string; pix_qr_base64?: string }>('/functions/v1/processar-pagamento', { method: 'POST', body: JSON.stringify(payload) });
}
export async function fetchAdminPlans(): Promise<Plan[]> { return request<Plan[]>('/rest/v1/planos?select=*&order=ordem.asc,preco.asc'); }
export async function updatePlanActive(id: string, ativo: boolean) { return request('/rest/v1/planos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ativo }) }); }
export async function fetchAdminVideos(): Promise<Video[]> { return request<Video[]>('/rest/v1/videos?select=*&order=criado_em.desc'); }
export async function invokeCatalogSync(query = '') { return request<{ found: number; added: number; updated: number; titles: string[] }>('/functions/v1/sincronizar-catalogo', { method: 'POST', body: JSON.stringify({ query }) }); }
export async function requestPasswordReset(email: string) {
  return request('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ email, redirect_to: `${window.location.origin}/redefinir-senha` }),
  });
}

// ================= CRM: Clientes =================

export async function fetchAdminClients(): Promise<Cliente[]> {
  const [perfis, assinaturas] = await Promise.all([
    request<Array<{ id: string; nome?: string; email?: string; data_nascimento?: string; criado_em?: string; is_admin?: boolean }>>(
      '/rest/v1/profiles?select=id,nome,email,data_nascimento,criado_em,is_admin&order=criado_em.desc',
    ),
    request<Array<{ usuario_id: string; status?: string; plano?: string; data_expiracao?: string; data_inicio?: string; criado_em?: string; limite_dispositivos?: number }>>(
      '/rest/v1/assinaturas?select=usuario_id,status,plano,data_expiracao,data_inicio,criado_em,limite_dispositivos&order=criado_em.desc',
    ),
  ]);
  const latestByUser = new Map<string, ClienteAssinatura>();
  assinaturas.forEach((row) => {
    if (!latestByUser.has(row.usuario_id)) latestByUser.set(row.usuario_id, row);
  });
  return perfis
    .filter((perfil) => !perfil.is_admin)
    .map((perfil) => ({ ...perfil, assinatura: latestByUser.get(perfil.id) || null }));
}

export async function grantAccess(payload: { usuario_id: string; quantidade: number; unidade: 'dias' | 'meses'; motivo?: string }) {
  const ativas = await request<Array<{ id: string; data_expiracao?: string; limite_dispositivos?: number }>>(
    `/rest/v1/assinaturas?select=id,data_expiracao,limite_dispositivos&usuario_id=eq.${encodeURIComponent(payload.usuario_id)}&status=eq.ativa&order=criado_em.desc&limit=1`,
  );
  const atual = ativas[0];
  const agora = new Date();
  let base = agora;
  let dispositivosHerdados = 1;

  if (atual) {
    dispositivosHerdados = atual.limite_dispositivos || 1;
    if (atual.data_expiracao && new Date(atual.data_expiracao) > agora) base = new Date(atual.data_expiracao);
    await request(`/rest/v1/assinaturas?id=eq.${encodeURIComponent(atual.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'substituida' }),
    });
  }

  const expiracao = new Date(base);
  if (payload.unidade === 'dias') expiracao.setDate(expiracao.getDate() + payload.quantidade);
  else expiracao.setMonth(expiracao.getMonth() + payload.quantidade);

  return request('/rest/v1/assinaturas', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      usuario_id: payload.usuario_id,
      status: 'ativa',
      plano: 'Cortesia (concedido pelo admin)',
      limite_dispositivos: dispositivosHerdados,
      data_inicio: agora.toISOString(),
      data_expiracao: expiracao.toISOString(),
      concedido_por_admin: true,
      motivo_concessao: payload.motivo || null,
    }),
  });
}

// Cancela o acesso do cliente: marca como "inativa" qualquer assinatura
// dele que esteja "ativa" ou em "trial". Não apaga nada, só desliga o
// acesso — o histórico da assinatura continua registrado no banco.
export async function revokeAccess(usuario_id: string) {
  const emUso = await request<Array<{ id: string }>>(
    `/rest/v1/assinaturas?select=id&usuario_id=eq.${encodeURIComponent(usuario_id)}&status=in.(ativa,trial)`,
  );
  if (!emUso.length) return;
  await Promise.all(
    emUso.map((row) => request(`/rest/v1/assinaturas?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'inativa' }),
    })),
  );
}

// ================= CONTROLE DE ACESSO AO CATÁLOGO =================

// Decide se a pessoa logada pode assistir vídeo agora. Regra:
// 1) admin sempre pode;
// 2) senão, precisa ter uma assinatura "ativa" ou "trial" cuja
//    data_expiracao ainda não passou;
// 3) se não existir nenhum registro de assinatura, cai na rede de
//    segurança do teste grátis de 3 dias contados da criação da conta
//    (mesma regra usada no restante do app).
export async function checkCatalogAccess(): Promise<boolean> {
  const user = getStoredUser();
  if (!user) return false;
  if (!hasRuntimeConfig) return true; // modo de demonstração sem backend: libera

  const perfil = await request<Array<{ is_admin?: boolean; criado_em?: string }>>(
    `/rest/v1/profiles?select=is_admin,criado_em&id=eq.${encodeURIComponent(user.id)}&limit=1`,
  );
  const info = perfil[0];
  if (info?.is_admin) return true;

  const assinaturas = await request<Array<{ status?: string; data_expiracao?: string }>>(
    `/rest/v1/assinaturas?select=status,data_expiracao&usuario_id=eq.${encodeURIComponent(user.id)}&status=in.(ativa,trial)&order=criado_em.desc&limit=1`,
  );
  const atual = assinaturas[0];
  if (atual) {
    if (!atual.data_expiracao) return true;
    return new Date(atual.data_expiracao) > new Date();
  }

  if (info?.criado_em) {
    const limite = new Date(info.criado_em);
    limite.setDate(limite.getDate() + 3);
    return new Date() < limite;
  }
  return false;
}
