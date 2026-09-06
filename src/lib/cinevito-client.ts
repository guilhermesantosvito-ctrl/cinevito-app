export type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: { nome?: string; name?: string };
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

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const SESSION_KEY = 'cinevito-auth-session';

export const hasRuntimeConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function storedSession(): { access_token: string; user: SessionUser } | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getStoredUser(): SessionUser | null {
  const sessionUser = storedSession()?.user;
  if (sessionUser) return sessionUser;
  const demoEmail = localStorage.getItem('cinevito-demo-user');
  return demoEmail ? { id: 'demo-user', email: demoEmail, user_metadata: { nome: demoEmail.split('@')[0] } } : null;
}

export function getAccessToken(): string | null {
  return storedSession()?.access_token ?? null;
}

function saveSession(session: { access_token: string; user: SessionUser }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('cinevito-auth-change'));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
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
  const result = await request<{ access_token: string; user: SessionUser }>(
    '/auth/v1/token?grant_type=password',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  saveSession(result);
  return result.user;
}

export async function signUp(nome: string, email: string, password: string, nascimento?: string, codigo?: string) {
  const result = await request<{ access_token?: string; user: SessionUser }>(
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
  const rows = await request<Array<{ nome?: string; email?: string; is_admin?: boolean; admin_master?: boolean; codigo_indicacao?: string }>>(
    `/rest/v1/profiles?select=nome,email,is_admin,codigo_indicacao&id=eq.${encodeURIComponent(user.id)}&limit=1`,
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
