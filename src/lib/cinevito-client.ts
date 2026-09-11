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
export type Categoria = { id: string; nome: string; slug?: string | null; ordem?: number | null };
export type Genero = { id: string; nome: string; ordem?: number | null };
export type Colecao = { id: string; titulo: string; slug?: string | null; descricao?: string | null; capa_url?: string | null; ordem?: number | null };
export type Cupom = { codigo: string; percentual_desconto: number; ativo: boolean; valido_ate?: string | null };
export type Serie = { id: string; titulo: string; descricao?: string | null; capa_url?: string | null; categoria_id?: string | null; genero?: string | null };
export type Temporada = { id: string; serie_id: string; numero: number; titulo?: string | null };
export type Episodio = { id: string; temporada_id: string; video_id: string; numero: number; titulo?: string | null; videos?: Video };
export type Equipe = { id: string; nome?: string | null; email?: string | null; admin_master?: boolean | null };
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
export type MinhaAssinatura = {
  status?: string | null;
  plano?: string | null;
  data_inicio?: string | null;
  data_expiracao?: string | null;
  concedido_por_admin?: boolean | null;
  motivo_concessao?: string | null;
  id_pagamento_gateway?: string | null;
};
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const SESSION_KEY = 'cinevito-auth-session';
const SUPABASE_SESSION_KEY = 'sb-cefyzitdkvtynhwsxdvv-auth-token';
const BACKGROUND_KEY = 'cinevito-background-since';
const BACKGROUND_LIMIT_MS = 3 * 60 * 1000;
const ADMIN_FLAG_KEY = 'cinevito-is-admin';
export function isAdminCached(): boolean {
  return localStorage.getItem(ADMIN_FLAG_KEY) === 'true';
}
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
  if (isExpiredSession() && !isAdminCached()) { clearSession(); return null; }
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
  localStorage.removeItem(ADMIN_FLAG_KEY);
  window.dispatchEvent(new Event('cinevito-auth-change'));
}
function irParaEntrada() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
    window.location.href = '/';
  }
}
function checkBackgroundLogout() {
  if (isAdminCached()) { window.dispatchEvent(new Event('cinevito-auth-change')); return; }
  if (isExpiredSession()) {
    clearSession();
    irParaEntrada();
    return;
  }
  window.dispatchEvent(new Event('cinevito-auth-change'));
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) localStorage.setItem(BACKGROUND_KEY, String(Date.now()));
    else checkBackgroundLogout();
  });
  window.addEventListener('pageshow', checkBackgroundLogout);
  window.addEventListener('focus', checkBackgroundLogout);
  const registrarAtividade = () => localStorage.setItem(BACKGROUND_KEY, String(Date.now()));
  ['click', 'keydown', 'touchstart', 'scroll'].forEach((evento) => {
    window.addEventListener(evento, registrarAtividade, { passive: true });
  });
  window.setInterval(() => {
    if (isAdminCached()) return;
    if (isExpiredSession() && getStoredUser()) {
      clearSession();
      irParaEntrada();
    }
  }, 15000);
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SUPABASE_SESSION_KEY);
  localStorage.removeItem(BACKGROUND_KEY);
  localStorage.removeItem(ADMIN_FLAG_KEY);
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
  const result = rows[0] || { nome: user.user_metadata?.nome || user.user_metadata?.name, email: user.email };
  try { localStorage.setItem(ADMIN_FLAG_KEY, String(Boolean((result as { is_admin?: boolean }).is_admin))); } catch { /* ignore */ }
  return result;
}
export async function submitSuggestion(payload: { titulo: string; genero?: string; ano_lancamento?: number }) {
  const user = getStoredUser();
  if (!user) throw new Error('Entre na sua conta para enviar uma sugestão.');
  return request('/rest/v1/sugestoes_filmes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      usuario_id: user.id,
      titulo_sugerido: payload.titulo,
      genero: payload.genero || null,
      ano_lancamento: payload.ano_lancamento || null,
    }),
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
export async function adminCreatePlano(payload: Partial<Plan>) {
  return request('/rest/v1/planos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
}
export async function adminUpdatePlano(id: string, payload: Partial<Plan>) {
  return request('/rest/v1/planos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
}
export async function adminDeletePlano(id: string) {
  return request('/rest/v1/planos?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
export async function fetchAdminVideos(): Promise<Video[]> { return request<Video[]>('/rest/v1/videos?select=*&order=criado_em.desc'); }
export async function requestPasswordReset(email: string) {
  return request('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ email, redirect_to: `${window.location.origin}/redefinir-senha` }),
  });
}

// ================= CATÁLOGO MANUAL (Vídeos, Categorias, Gêneros) =================

function slugify(value: string) {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function fetchCategorias(): Promise<Categoria[]> {
  return request<Categoria[]>('/rest/v1/categorias?select=*&order=ordem.asc');
}
export async function fetchGenerosList(): Promise<Genero[]> {
  return request<Genero[]>('/rest/v1/generos?select=*&order=ordem.asc');
}
export async function adminCreateCategoria(nome: string) {
  const existentes = await fetchCategorias();
  const jaExiste = existentes.some((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (jaExiste) throw new Error('Essa categoria já existe.');
  const proximaOrdem = existentes.length ? Math.max(...existentes.map((c) => c.ordem || 0)) + 1 : 1;
  return request('/rest/v1/categorias', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ nome, slug: slugify(nome), ordem: proximaOrdem }) });
}
export async function adminCreateGenero(nome: string) {
  const existentes = await fetchGenerosList();
  const jaExiste = existentes.some((g) => g.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (jaExiste) throw new Error('Esse gênero já existe.');
  const proximaOrdem = existentes.length ? Math.max(...existentes.map((g) => g.ordem || 0)) + 1 : 1;
  return request('/rest/v1/generos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ nome, ordem: proximaOrdem }) });
}
export async function adminCreateVideo(payload: Partial<Video>) {
  return request('/rest/v1/videos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
}
export async function adminUpdateVideo(id: string, payload: Partial<Video>) {
  return request('/rest/v1/videos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
}
export async function adminDeleteVideo(id: string) {
  return request('/rest/v1/videos?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// ================= COLEÇÕES (fileiras curadas manualmente, tipo "Top 10") =================

export async function fetchColecoes(): Promise<Colecao[]> {
  return request<Colecao[]>('/rest/v1/colecoes?select=*&order=ordem.asc');
}
export async function adminCreateColecao(payload: { titulo: string; descricao?: string; capa_url?: string }) {
  const existentes = await fetchColecoes();
  const proximaOrdem = existentes.length ? Math.max(...existentes.map((c) => c.ordem || 0)) + 1 : 1;
  return request('/rest/v1/colecoes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      titulo: payload.titulo,
      slug: slugify(payload.titulo) + '-' + Date.now().toString(36),
      descricao: payload.descricao || null,
      capa_url: payload.capa_url || null,
      ordem: proximaOrdem,
    }),
  });
}
export async function adminDeleteColecao(id: string) {
  await request('/rest/v1/colecao_videos?colecao_id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return request('/rest/v1/colecoes?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
export async function fetchColecaoVideos(colecaoId: string): Promise<Array<{ video_id: string; ordem: number; videos: Video }>> {
  return request(`/rest/v1/colecao_videos?select=video_id,ordem,videos(*)&colecao_id=eq.${encodeURIComponent(colecaoId)}&order=ordem.asc`);
}
export async function adminAddVideoToColecao(colecaoId: string, videoId: string) {
  const existentes = await request<Array<{ ordem: number }>>(`/rest/v1/colecao_videos?select=ordem&colecao_id=eq.${encodeURIComponent(colecaoId)}`);
  const proximaOrdem = existentes.length ? Math.max(...existentes.map((c) => c.ordem || 0)) + 1 : 1;
  return request('/rest/v1/colecao_videos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ colecao_id: colecaoId, video_id: videoId, ordem: proximaOrdem }) });
}
export async function adminRemoveVideoFromColecao(colecaoId: string, videoId: string) {
  return request(`/rest/v1/colecao_videos?colecao_id=eq.${encodeURIComponent(colecaoId)}&video_id=eq.${encodeURIComponent(videoId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
export async function adminReorderColecaoVideos(colecaoId: string, orderedVideoIds: string[]) {
  await Promise.all(orderedVideoIds.map((videoId, index) =>
    request(`/rest/v1/colecao_videos?colecao_id=eq.${encodeURIComponent(colecaoId)}&video_id=eq.${encodeURIComponent(videoId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ordem: index + 1 }),
    }),
  ));
}
export async function fetchColecoesParaCatalogo(): Promise<Array<{ colecao: Colecao; videos: Video[] }>> {
  const colecoes = await fetchColecoes();
  const resultados = await Promise.all(colecoes.map(async (colecao) => {
    const linhas = await request<Array<{ video_id: string; ordem: number; videos: Video }>>(
      `/rest/v1/colecao_videos?select=video_id,ordem,videos(*)&colecao_id=eq.${encodeURIComponent(colecao.id)}&order=ordem.asc`,
    );
    return { colecao, videos: linhas.map((linha) => linha.videos).filter(Boolean) };
  }));
  return resultados.filter((item) => item.videos.length > 0);
}

// ================= SÉRIES E TEMPORADAS =================

export async function fetchSeries(): Promise<Serie[]> {
  return request<Serie[]>('/rest/v1/series?select=*&order=titulo.asc');
}
export async function adminCreateSerie(payload: { titulo: string; descricao?: string; capa_url?: string; categoria_id?: string; genero?: string }) {
  return request('/rest/v1/series', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      titulo: payload.titulo,
      descricao: payload.descricao || null,
      capa_url: payload.capa_url || null,
      categoria_id: payload.categoria_id || null,
      genero: payload.genero || null,
    }),
  });
}
export async function adminDeleteSerie(id: string) {
  return request('/rest/v1/series?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
export async function fetchTemporadas(serieId: string): Promise<Temporada[]> {
  return request<Temporada[]>(`/rest/v1/temporadas?select=*&serie_id=eq.${encodeURIComponent(serieId)}&order=numero.asc`);
}
export async function adminCreateTemporada(serieId: string, numero: number, titulo?: string) {
  return request('/rest/v1/temporadas', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ serie_id: serieId, numero, titulo: titulo || null }) });
}
export async function adminDeleteTemporada(id: string) {
  return request('/rest/v1/temporadas?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
export async function fetchEpisodios(temporadaId: string): Promise<Episodio[]> {
  return request<Episodio[]>(`/rest/v1/episodios?select=*,videos(*)&temporada_id=eq.${encodeURIComponent(temporadaId)}&order=numero.asc`);
}
export async function adminAddEpisodio(temporadaId: string, videoId: string, numero: number, titulo?: string) {
  return request('/rest/v1/episodios', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ temporada_id: temporadaId, video_id: videoId, numero, titulo: titulo || null }) });
}
export async function adminRemoveEpisodio(id: string) {
  return request('/rest/v1/episodios?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
export async function fetchSerieCompleta(serieId: string): Promise<{ serie: Serie | null; temporadas: Array<{ temporada: Temporada; episodios: Episodio[] }> }> {
  const series = await request<Serie[]>(`/rest/v1/series?select=*&id=eq.${encodeURIComponent(serieId)}&limit=1`);
  const temporadas = await fetchTemporadas(serieId);
  const temporadasComEpisodios = await Promise.all(temporadas.map(async (temporada) => ({ temporada, episodios: await fetchEpisodios(temporada.id) })));
  return { serie: series[0] || null, temporadas: temporadasComEpisodios };
}

// ================= CUPONS DE DESCONTO =================

export async function fetchAdminCupons(): Promise<Cupom[]> {
  return request<Cupom[]>('/rest/v1/cupons?select=*&order=codigo.asc');
}
export async function adminCreateCupom(payload: { codigo: string; percentual_desconto: number; valido_ate?: string | null }) {
  return request('/rest/v1/cupons', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      codigo: payload.codigo.trim().toUpperCase(),
      percentual_desconto: payload.percentual_desconto,
      valido_ate: payload.valido_ate || null,
      ativo: true,
    }),
  });
}
export async function adminToggleCupom(codigo: string, ativo: boolean) {
  return request('/rest/v1/cupons?codigo=eq.' + encodeURIComponent(codigo), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ativo }) });
}
export async function adminDeleteCupom(codigo: string) {
  return request('/rest/v1/cupons?codigo=eq.' + encodeURIComponent(codigo), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// ================= EQUIPE (só admin master gerencia) =================

export async function fetchEquipe(): Promise<Equipe[]> {
  return request<Equipe[]>('/rest/v1/profiles?select=id,nome,email,admin_master&is_admin=eq.true&order=criado_em.asc');
}
export async function adminAddToEquipe(email: string) {
  const rows = await request<Array<{ id: string; is_admin?: boolean }>>(`/rest/v1/profiles?select=id,is_admin&email=eq.${encodeURIComponent(email.trim().toLowerCase())}&limit=1`);
  const perfil = rows[0];
  if (!perfil) throw new Error('Não encontrei ninguém com esse e-mail. A pessoa precisa criar uma conta no CineVito primeiro.');
  if (perfil.is_admin) throw new Error('Essa pessoa já tem acesso ao painel.');
  return request('/rest/v1/profiles?id=eq.' + encodeURIComponent(perfil.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_admin: true, admin_master: false }) });
}
export async function adminPromoverMaster(id: string) {
  return request('/rest/v1/profiles?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ admin_master: true }) });
}
export async function adminRebaixarMaster(id: string) {
  return request('/rest/v1/profiles?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ admin_master: false }) });
}
export async function adminRemoverDaEquipe(id: string) {
  return request('/rest/v1/profiles?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_admin: false, admin_master: false }) });
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

export async function checkCatalogAccess(): Promise<boolean> {
  const user = getStoredUser();
  if (!user) return false;
  if (!hasRuntimeConfig) return true;

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

export async function fetchMySubscription(): Promise<MinhaAssinatura | null> {
  const user = getStoredUser();
  if (!user) return null;
  const rows = await request<MinhaAssinatura[]>(
    `/rest/v1/assinaturas?select=status,plano,data_inicio,data_expiracao,concedido_por_admin,motivo_concessao,id_pagamento_gateway&usuario_id=eq.${encodeURIComponent(user.id)}&order=criado_em.desc&limit=1`,
  );
  return rows[0] || null;
}
