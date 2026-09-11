import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, CircleAlert, Clapperboard, Copy, Download, Eye, EyeOff,
  Film, Heart, Info, KeyRound, Library, LogIn, LogOut, Play, RefreshCw, Search,
  Send, Settings, ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  adminAddEpisodio, adminAddToEquipe, adminAddVideoToColecao, adminCreateCategoria, adminCreateColecao, adminCreateCupom, adminCreateGenero, adminCreatePlano, adminCreateSerie, adminCreateTemporada, adminCreateVideo,
  adminDeleteColecao, adminDeleteCupom, adminDeletePlano, adminDeleteSerie, adminDeleteTemporada, adminDeleteVideo, adminPromoverMaster, adminRebaixarMaster, adminRemoveEpisodio, adminRemoveVideoFromColecao, adminRemoverDaEquipe, adminReorderColecaoVideos, adminReorderLayout, adminToggleCupom, adminToggleLayoutVisible, adminUpdatePlano, adminUpdateVideo,
  checkCatalogAccess, clearSession, fetchAdminClients, fetchAdminCupons, fetchAdminPlans, fetchAdminVideos, fetchCategorias, fetchCatalogoLayout, fetchCatalogoLayoutPublico, fetchColecaoVideos, fetchColecoes, fetchColecoesParaCatalogo, fetchContinuarAssistindo, fetchEpisodioInfo, fetchEpisodioVideoIds, fetchEpisodios, fetchEquipe, fetchGenerosList, fetchMySubscription, fetchPlans, fetchProfile, fetchSerieCompleta, fetchSeries, fetchTemporadas, fetchVideos, getAccessToken, getStoredUser, grantAccess, hasRuntimeConfig,
  processPayment, requestPasswordReset, revokeAccess, salvarProgresso, signIn, signUp, submitSuggestion, updatePlanActive, type Categoria, type Cliente, type Colecao, type ContinuarAssistindoItem, type Cupom, type Episodio, type Equipe, type Genero, type LayoutItem, type MinhaAssinatura, type Plan, type SessionUser, type Serie, type Temporada, type Video,
} from '@/lib/cinevito-client';
import '@/index.css';
const queryClient = new QueryClient();
const MP_PUBLIC_KEY = 'APP_USR-471c3a9b-ff0f-4743-a417-e54b9f13e902';
const fallbackShelves = ['Início', 'Filmes Clássicos', 'Documentários', 'Curtas-Metragens'];
const genres = ['Todos os gêneros', 'Ação', 'Aventura', 'Comédia', 'Documentário', 'Drama', 'Natureza', 'Terror'];
const VIDEO_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-forms';
const CATALOG_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
function normalizeCatalogLabel(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function videoBelongsToShelf(video: Video, shelf: string) {
  if (shelf === 'Início') return true;
  const category = normalizeCatalogLabel(video.categoria);
  const target = normalizeCatalogLabel(shelf);
  const aliases: Record<string, string[]> = {
    'filmes classicos': ['filmes classicos', 'classicos', 'classico'],
    documentarios: ['documentarios', 'documentario'],
    'curtas metragens': ['curtas metragens', 'curtas', 'curta'],
  };
  return (aliases[target] || [target]).some((label) => category === label || category.includes(label));
}
function initials(user: SessionUser | null) {
  const name = user?.user_metadata?.nome || user?.user_metadata?.name || user?.email || '?';
  return name.split(/[ @]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}
function titleCaseName(user: SessionUser | null) {
  return user?.user_metadata?.nome || user?.user_metadata?.name || user?.email?.split('@')[0] || 'visitante';
}
function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredUser());
  useEffect(() => {
    const update = () => setUser(getStoredUser());
    window.addEventListener('cinevito-auth-change', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('cinevito-auth-change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return user;
}
function useCatalogAccess(user: SessionUser | null) {
  const [access, setAccess] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) { setAccess(false); return; }
    let cancelled = false;
    setAccess(null);
    checkCatalogAccess()
      .then((value) => { if (!cancelled) setAccess(value); })
      .catch(() => { if (!cancelled) setAccess(false); });
    return () => { cancelled = true; };
  }, [user?.id]);
  return access;
}
function useColecoesDoCatalogo() {
  const [colecoes, setColecoes] = useState<Array<{ colecao: Colecao; videos: Video[] }>>([]);
  useEffect(() => {
    if (!hasRuntimeConfig) return;
    let cancelled = false;
    const carregar = () => fetchColecoesParaCatalogo().then((data) => { if (!cancelled) setColecoes(data); }).catch(() => { if (!cancelled) setColecoes([]); });
    carregar();
    const intervalId = window.setInterval(carregar, CATALOG_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);
  return colecoes;
}
function useSeriesDoCatalogo() {
  const [series, setSeries] = useState<Serie[]>([]);
  useEffect(() => {
    if (!hasRuntimeConfig) return;
    let cancelled = false;
    const carregar = () => fetchSeries().then((data) => { if (!cancelled) setSeries(data); }).catch(() => { if (!cancelled) setSeries([]); });
    carregar();
    const intervalId = window.setInterval(carregar, CATALOG_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);
  return series;
}
function useCatalogLayoutPublico() {
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  useEffect(() => {
    if (!hasRuntimeConfig) return;
    let cancelled = false;
    const carregar = () => fetchCatalogoLayoutPublico().then((data) => { if (!cancelled) setLayout(data); }).catch(() => { if (!cancelled) setLayout([]); });
    carregar();
    const intervalId = window.setInterval(carregar, CATALOG_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);
  return layout;
}
function useEpisodioVideoIds() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!hasRuntimeConfig) return;
    let cancelled = false;
    const carregar = () => fetchEpisodioVideoIds().then((data) => { if (!cancelled) setIds(new Set(data)); }).catch(() => { if (!cancelled) setIds(new Set()); });
    carregar();
    const intervalId = window.setInterval(carregar, CATALOG_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);
  return ids;
}
function useContinuarAssistindo(user: SessionUser | null) {
  const [items, setItems] = useState<ContinuarAssistindoItem[]>([]);
  useEffect(() => {
    if (!user || !hasRuntimeConfig) { setItems([]); return; }
    let cancelled = false;
    fetchContinuarAssistindo().then((data) => { if (!cancelled) setItems(data); }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [user?.id]);
  return items;
}
function extractVideoUrl(input: string): string {
  const trimmed = input.trim();
  const iframeMatch = trimmed.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (iframeMatch) return iframeMatch[1];
  return trimmed;
}
function getEmbedInfo(url?: string | null): { type: 'file' | 'embed' | 'none'; src: string } {
  if (!url) return { type: 'none', src: '' };
  const trimmed = url.trim();
  const yt = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return { type: 'embed', src: `https://www.youtube.com/embed/${yt[1]}` };
  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { type: 'embed', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  const archive = trimmed.match(/archive\.org\/details\/([^/?#]+)/);
  if (archive) return { type: 'embed', src: `https://archive.org/embed/${archive[1]}` };
  if (trimmed.includes('archive.org/embed/')) return { type: 'embed', src: trimmed };
  if (/\.(mp4|webm|ogv|m3u8)(\?|$)/i.test(trimmed)) return { type: 'file', src: trimmed };
  return { type: 'embed', src: trimmed };
}
// ================= CONVITE PARA INSTALAR O APP =================
type PlataformaInstalacao = 'ios' | 'android' | 'desktop' | 'tv';
function detectarPlataformaInstalacao(): PlataformaInstalacao {
  const ua = navigator.userAgent.toLowerCase();
  const ehTV = /smarttv|smart-tv|googletv|appletv|hbbtv|netcast|viera|aquos|bravia|tizen|web0s|webos|crkey|roku|firetv|aft\b/i.test(ua);
  if (ehTV) return 'tv';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}
function useInstallPrompt(user: SessionUser | null) {
  const [deferredEvent, setDeferredEvent] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<PlataformaInstalacao>('desktop');
  useEffect(() => {
    function handler(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => {
    if (!user) { setVisible(false); return; }
    const jaInstalado = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (jaInstalado) { setVisible(false); return; }
    const plataforma = detectarPlataformaInstalacao();
    setPlatform(plataforma);
    if (plataforma === 'tv') { setVisible(false); return; }
    const chave = `cinevito-install-dismissed-${plataforma}`;
    const dispensadoEm = Number(localStorage.getItem(chave) || 0);
    const janelaEspera = plataforma === 'desktop' ? 14 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (dispensadoEm && Date.now() - dispensadoEm < janelaEspera) { setVisible(false); return; }
    setVisible(true);
  }, [user?.id]);
  function dismiss() {
    localStorage.setItem(`cinevito-install-dismissed-${platform}`, String(Date.now()));
    setVisible(false);
  }
  async function install() {
    if (!deferredEvent) return;
    deferredEvent.prompt();
    try { await deferredEvent.userChoice; } catch { /* ignore */ }
    setDeferredEvent(null);
    localStorage.setItem(`cinevito-install-dismissed-${platform}`, String(Date.now()));
    setVisible(false);
  }
  return { visible, platform, canInstallDirectly: Boolean(deferredEvent), install, dismiss };
}
function InstallBanner({ user }: { user: SessionUser | null }) {
  const { visible, platform, canInstallDirectly, install, dismiss } = useInstallPrompt(user);
  if (!visible) return null;
  if (platform !== 'ios' && !canInstallDirectly) return null;
  return (
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 78, zIndex: 40, background: 'var(--bg-card, #11151f)', border: '1px solid #2ec4b6', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
      <Download size={20} color="#00c8ff" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: '.84rem', lineHeight: 1.4 }}>
        <strong>Instale o CineVito</strong>
        <p className="muted" style={{ margin: '2px 0 0' }}>
          {platform === 'ios'
            ? 'Toque em Compartilhar e depois em "Adicionar à Tela de Início" pra abrir como um app.'
            : 'Adicione o CineVito à tela do seu aparelho pra abrir direto, como um app.'}
        </p>
      </div>
      {platform !== 'ios' && <button className="primary-button focus-tv" onClick={install} style={{ flexShrink: 0 }}>Instalar</button>}
      <button className="icon-button focus-tv" onClick={dismiss} aria-label="Agora não" style={{ flexShrink: 0 }}><X size={16} /></button>
    </div>
  );
}
function ToastMessage({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="status" data-testid="status-toast"><span>{message}</span><button className="icon-button" onClick={onClose} aria-label="Fechar aviso" data-testid="button-close-toast"><X size={15} /></button></div>;
}
function Brand() {
  const user = useAuth();
  return <Link href={user ? '/catalogo' : '/'} className="brand-mark focus-tv" data-testid="link-brand"><Clapperboard size={22} strokeWidth={1.8} /><span>CineVito</span></Link>;
}
const navigation = [
  { href: '/catalogo', label: 'Catálogo', icon: Film },
  { href: '/colecao', label: 'Minha coleção', icon: Library },
  { href: '/sugestao', label: 'Sugerir', icon: Send },
  { href: '/faq', label: 'Ajuda', icon: Info },
];
function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const user = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user || !hasRuntimeConfig) { setIsAdmin(false); return; }
    let cancelled = false;
    fetchProfile()
      .then((profile) => { if (!cancelled) setIsAdmin(Boolean((profile as { is_admin?: boolean } | null)?.is_admin)); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [user]);
  useEffect(() => {
    if (!user && location !== '/' && location !== '/index.html') {
      setLocation('/');
    }
  }, [user, location]);
  const isHome = location === '/' || location === '/index.html';
  const active = (href: string) => location === href || location === `${href}.html` || (href === '/catalogo' && location.startsWith('/player'));
  async function logout() {
    clearSession();
    setLocation('/');
  }
  if (isHome) return <>{children}</>;
  return (
    <div className="app-frame">
      <div className="sprocket-strip" />
      <header className="topbar">
        <div className="content-wrap topbar-inner">
          <Brand />
          <nav className="topbar-nav" aria-label="Navegação principal">
            {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="nav-link focus-tv" aria-current={active(href) ? 'page' : undefined} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} />{label}</Link>)}
          </nav>
          <div className="topbar-actions">
            {isAdmin && <Link href="/admin" className="nav-link focus-tv" data-testid="link-admin"><Settings size={16} />Painel</Link>}{user ? <><Link href="/perfil" className="avatar focus-tv" aria-label="Abrir perfil" data-testid="link-profile-avatar">{initials(user)}</Link><button className="icon-button focus-tv" onClick={logout} title="Sair" aria-label="Sair" data-testid="button-logout"><LogOut size={17} /></button></> : <Link href="/" className="secondary-button focus-tv" data-testid="link-login"><LogIn size={15} />Entrar</Link>}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <InstallBanner user={user} />
      <nav className="mobile-nav" aria-label="Navegação mobile">
        {navigation.slice(0, 3).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="mobile-nav-link focus-tv" aria-current={active(href) ? 'page' : undefined} data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{label}</span></Link>)}
        <Link href={user ? '/perfil' : '/'} className="mobile-nav-link focus-tv" aria-current={location === '/perfil' ? 'page' : undefined} data-testid="link-mobile-profile"><UserRound size={17} /><span>{user ? 'Perfil' : 'Entrar'}</span></Link>
      </nav>
    </div>
  );
}
function AuthPage() {
  const [, setLocation] = useLocation();
  const user = useAuth();
  useEffect(() => {
    if (user) setLocation('/catalogo');
  }, [user]);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ nome: '', email: '', password: '', nascimento: '', codigo: '', lembrar: false });
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      setMode('signup');
      setForm((current) => ({ ...current, codigo: ref.toUpperCase() }));
    }
  }, []);
  function update(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!form.email || !form.password || (mode === 'signup' && !form.nome)) {
      setError('Preencha os campos obrigatórios para continuar.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        if (hasRuntimeConfig) await signIn(form.email, form.password);
        else {
          localStorage.setItem('cinevito-demo-user', form.email);
          window.dispatchEvent(new Event('cinevito-auth-change'));
        }
        setLocation('/catalogo');
      } else {
        if (hasRuntimeConfig) {
          const result = await signUp(form.nome, form.email, form.password, form.nascimento, form.codigo);
          if (!result.access_token) {
            setNotice('Conta criada. Verifique seu e-mail para confirmar o acesso.');
            setMode('login');
          } else setLocation('/catalogo');
        } else {
          localStorage.setItem('cinevito-demo-user', form.email);
          window.dispatchEvent(new Event('cinevito-auth-change'));
          setLocation('/catalogo');
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home-shell">
      <div className="auth-layout reveal">
        <section className="auth-aside">
          <Brand />
          <div className="auth-aside-copy">
            <div className="eyebrow">Cinema brasileiro, do seu jeito</div>
            <h1>Seu próximo<br /><span>filme.</span></h1>
            <p>Um catálogo para assistir no celular, no computador ou na sala. Sem pressa, com curadoria e controle sobre a sua sessão.</p>
          </div>
          <div className="auth-aside-meta"><i /> PWA para todas as telas</div>
        </section>
        <section className="auth-panel">
          <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h2>
          <p>{mode === 'login' ? 'Entre para continuar assistindo de onde parou.' : 'Comece seu acesso ao catálogo do CineVito.'}</p>
          <div className="auth-tabs" role="tablist">
            <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'} data-testid="tab-login">Entrar</button>
            <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')} role="tab" aria-selected={mode === 'signup'} data-testid="tab-signup">Criar conta</button>
          </div>
          <form onSubmit={submit}>
            {mode === 'signup' && <div className="field"><label htmlFor="auth-name">Seu nome</label><input id="auth-name" className="input focus-tv" value={form.nome} onChange={(e) => update('nome', e.target.value)} placeholder="Como quer ser chamado?" autoComplete="name" data-testid="input-signup-name" /></div>}
            <div className="field"><label htmlFor="auth-email">E-mail</label><input id="auth-email" type="email" className="input focus-tv" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" data-testid="input-auth-email" /></div>
            <div className="field"><label htmlFor="auth-password">Senha</label><div className="password-wrap"><input id="auth-password" type={showPassword ? 'text' : 'password'} className="input focus-tv" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Sua senha" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} data-testid="input-auth-password" /><button type="button" className="password-toggle focus-tv" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} data-testid="button-toggle-password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            {mode === 'signup' && <><div className="field"><label htmlFor="auth-birth">Data de nascimento <span className="muted">(opcional)</span></label><input id="auth-birth" type="date" className="input focus-tv" value={form.nascimento} onChange={(e) => update('nascimento', e.target.value)} data-testid="input-signup-birth" /></div><div className="field"><label htmlFor="auth-referral">Código de indicação <span className="muted">(opcional)</span></label><input id="auth-referral" className="input focus-tv" value={form.codigo} onChange={(e) => update('codigo', e.target.value.toUpperCase())} placeholder="Ex.: VITO4X9K" data-testid="input-signup-referral" /></div></>}
            {mode === 'login' && <label className="check-row"><input type="checkbox" checked={form.lembrar} onChange={(e) => update('lembrar', e.target.checked)} data-testid="checkbox-remember-email" />Lembrar meu e-mail neste aparelho</label>}
            {error && <p className="form-error" role="alert" data-testid="status-auth-error">{error}</p>}
            {notice && <p className="form-success" role="status" data-testid="status-auth-success">{notice}</p>}
            <button type="submit" className="primary-button button-wide focus-tv" disabled={busy} data-testid="button-submit-auth">{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar no CineVito' : 'Criar minha conta'}<ArrowLeft size={16} className="rotate-180" /></button>
            {mode === 'login' && <Link href="/redefinir-senha" className="quiet-button button-wide focus-tv" data-testid="link-forgot-password">Esqueci minha senha</Link>}
          </form>
          <p className="auth-footnote">Ao continuar, você concorda com os termos de uso do CineVito.</p>
        </section>
      </div>
    </div>
  );
}
function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-head"><div className="page-head-copy"><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}
function Poster({ video, favorite, onFavorite, onOpen, subtitle }: { video: Video; favorite: boolean; onFavorite: () => void; onOpen: () => void; subtitle?: string }) {
  const poster = video.url_capa ? undefined : ({
    '--poster': 'linear-gradient(145deg, #0d596c, #172532 50%, #e58d49)',
  } as CSSProperties);
  return <article className="video-card reveal" data-testid={`card-video-${video.id}`}><div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={poster}><div className="poster-art" style={video.url_capa ? { backgroundImage: `url(${video.url_capa})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><span className="poster-meta">{video.ano || 'CINEVITO'}</span><strong className="poster-word">{video.titulo}</strong></div>{video.premium && <span className="premium-badge">Premium</span>}<button className={`poster-favorite focus-tv ${favorite ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); onFavorite(); }} aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} data-testid={`button-favorite-${video.id}`}><Heart size={15} fill={favorite ? 'currentColor' : 'none'} /></button></div><div className="video-info"><div><h3 className="video-title" data-testid={`text-video-title-${video.id}`}>{video.titulo}</h3><p className="video-subtitle">{subtitle || video.genero || video.categoria || 'Catálogo CineVito'}</p></div><Play size={14} color="#00c8ff" /></div></article>;
}
function SerieCard({ serie, onOpen }: { serie: Serie; onOpen: () => void }) {
  const style = serie.capa_url ? undefined : ({ '--poster': 'linear-gradient(145deg, #4a1942, #172532 50%, #e58d49)' } as CSSProperties);
  return <article className="video-card reveal"><div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={style}><div className="poster-art" style={serie.capa_url ? { backgroundImage: `url(${serie.capa_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><span className="poster-meta">SÉRIE</span><strong className="poster-word">{serie.titulo}</strong></div></div><div className="video-info"><div><h3 className="video-title">{serie.titulo}</h3><p className="video-subtitle">{serie.genero || 'Série · Temporadas'}</p></div><Play size={14} color="#00c8ff" /></div></article>;
}
function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]); const [loading, setLoading] = useState(hasRuntimeConfig); const [error, setError] = useState('');
  useEffect(() => {
    if (!hasRuntimeConfig) { setLoading(false); return; }
    let cancelled = false;
    const carregar = async (primeiraVez: boolean) => {
      try {
        const items = await fetchVideos();
        if (!cancelled) setVideos(items);
      } catch (fetchError) {
        if (!cancelled && primeiraVez) setError(fetchError instanceof Error ? fetchError.message : 'Não foi possível carregar o catálogo.');
      } finally {
        if (!cancelled && primeiraVez) setLoading(false);
      }
    };
    carregar(true);
    const intervalId = window.setInterval(() => carregar(false), CATALOG_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);
  return { videos, loading, error };
}
function ContinueCard({ item, onOpen }: { item: ContinuarAssistindoItem; onOpen: () => void }) {
  const video = item.videos;
  if (!video) return null;
  const subtitle = item.series ? `${item.series.titulo}${item.numero_episodio ? ` · Ep. ${item.numero_episodio}` : ''}` : undefined;
  const style = video.url_capa ? undefined : ({ '--poster': 'linear-gradient(145deg, #0d596c, #172532 50%, #e58d49)' } as CSSProperties);
  return <article className="video-card reveal"><div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={style}><div className="poster-art" style={video.url_capa ? { backgroundImage: `url(${video.url_capa})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><span className="poster-meta">CONTINUAR</span><strong className="poster-word">{item.series?.titulo || video.titulo}</strong></div></div><div className="video-info"><div><h3 className="video-title">{item.series?.titulo || video.titulo}</h3><p className="video-subtitle">{subtitle || 'Continuar assistindo'}</p></div><Play size={14} color="#00c8ff" /></div></article>;
}
function CatalogPage() {
  const [, setLocation] = useLocation();
  const user = useAuth();
  const access = useCatalogAccess(user);
  const { videos, loading, error } = useVideos();
  const colecoes = useColecoesDoCatalogo();
  const series = useSeriesDoCatalogo();
  const layout = useCatalogLayoutPublico();
  const episodioVideoIds = useEpisodioVideoIds();
  const continuarAssistindo = useContinuarAssistindo(user);
  const [shelf, setShelf] = useState('Início');
  const [genre, setGenre] = useState('Todos os gêneros');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem('cinevito-favorites') || '[]'));
  const filtered = useMemo(() => videos.filter((video) => {
    const text = `${video.titulo} ${video.descricao || ''} ${video.genero || ''}`.toLowerCase();
    const selectedGenre = normalizeCatalogLabel(genre);
    const videoGenre = normalizeCatalogLabel(video.genero);
    return (!query || text.includes(query.toLowerCase()))
      && (genre === 'Todos os gêneros' || videoGenre === selectedGenre || videoGenre.includes(selectedGenre))
      && videoBelongsToShelf(video, shelf)
      && !episodioVideoIds.has(video.id);
  }), [videos, query, genre, shelf, episodioVideoIds]);
  const filteredSeries = useMemo(() => series.filter((serie) => {
    const selectedGenre = normalizeCatalogLabel(genre);
    const serieGenre = normalizeCatalogLabel(serie.genero);
    return genre === 'Todos os gêneros' || serieGenre === selectedGenre || serieGenre.includes(selectedGenre);
  }), [series, genre]);
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
  }
  function openVideo(id: string) {
    setLocation(access ? `/player/${id}` : '/assinatura');
  }
  function renderSeriesSection(key: string) {
    if (!filteredSeries.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">Séries</h2><div className="section-rule" /></div>
      <div className="video-grid">{filteredSeries.map((serie) => <SerieCard key={serie.id} serie={serie} onOpen={() => setLocation(`/serie/${serie.id}`)} />)}</div>
    </section>;
  }
  function renderColecaoSection(colecaoId: string, key: string) {
    const found = colecoes.find((c) => c.colecao.id === colecaoId);
    if (!found || !found.videos.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{found.colecao.titulo}</h2><div className="section-rule" /></div>
      <div className="video-grid">{found.videos.map((video) => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />)}</div>
    </section>;
  }
  function renderCatalogoGeralSection(key: string) {
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{shelf === 'Início' ? 'Todo o catálogo' : shelf}</h2><div className="section-rule" /><span>{filtered.length.toString().padStart(2, '0')} títulos</span></div>
      {filtered.length ? <div className="video-grid">{filtered.map((video) => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />)}</div> : <div className="empty-state" data-testid="status-catalog-empty"><Search size={25} /><h3>{videos.length ? 'Nenhum título encontrado' : 'Catálogo ainda vazio'}</h3><p>{videos.length ? 'Tente outro termo ou limpe os filtros para voltar ao catálogo.' : 'Os títulos aparecem aqui assim que forem cadastrados no painel administrativo.'}</p>{videos.length > 0 && <button className="quiet-button focus-tv" onClick={() => { setQuery(''); setGenre('Todos os gêneros'); setShelf('Início'); }} data-testid="button-clear-catalog-filters">Limpar filtros</button>}</div>}
    </section>;
  }
  return <div className="content-wrap page-main">
    <PageHeader eyebrow="A sua sala de cinema" title={`Olá, ${titleCaseName(user)}.`} description="Escolha algo para assistir. O catálogo se adapta à sua tela, do celular à Smart TV." action={<Link href="/assinatura" className="primary-button focus-tv" data-testid="link-subscription"><Sparkles size={16} />Ver planos</Link>} />
    {!hasRuntimeConfig && <div className="notice notice-cyan" data-testid="status-runtime-demo"><Info size={17} color="#00c8ff" /><span><strong>Modo de demonstração.</strong> O ambiente ainda não está conectado ao Supabase; os dados desta sessão ficam apenas neste aparelho.</span></div>}
    {!user && <div className="notice notice-orange" data-testid="status-catalog-auth"><CircleAlert size={17} color="#ff8228" /><span><strong>Você está navegando como visitante.</strong> Entre para salvar favoritos e continuar assistindo em outros dispositivos.</span><Link href="/" className="quiet-button focus-tv" data-testid="link-catalog-login">Entrar</Link></div>}
    {user && access === false && <div className="notice notice-orange" data-testid="status-catalog-locked"><CircleAlert size={17} color="#ff8228" /><span><strong>Seu acesso gratuito acabou.</strong> Assine um plano para continuar assistindo ao catálogo completo.</span><Link href="/assinatura" className="quiet-button focus-tv">Ver planos</Link></div>}
    <div className="catalog-toolbar"><div className="search-wrap"><Search size={16} /><input className="input focus-tv" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no catálogo" aria-label="Buscar no catálogo" data-testid="input-search-catalog" /></div><Link href="/colecao" className="secondary-button focus-tv" data-testid="link-open-collection"><Heart size={15} />Minha coleção</Link></div>
    <div className="chip-row" role="tablist" aria-label="Categorias do catálogo">{fallbackShelves.map((item) => <button key={item} className={`chip focus-tv ${shelf === item ? 'active' : ''}`} onClick={() => { setShelf(item); setGenre('Todos os gêneros'); setQuery(''); }} role="tab" aria-selected={shelf === item} data-testid={`tab-shelf-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div>
    <div className="chip-row" aria-label="Filtrar por gênero">{genres.map((item) => <button key={item} className={`chip focus-tv ${genre === item ? 'active' : ''}`} onClick={() => setGenre(item)} data-testid={`button-genre-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div>
    {loading && <div className="video-grid" data-testid="status-catalog-loading">{Array.from({ length: 5 }).map((_, index) => <div className="skeleton" style={{ aspectRatio: '2/3' }} key={index} />)}</div>}
    {error && <div className="notice notice-orange" role="alert" data-testid="status-catalog-error"><CircleAlert size={17} color="#ff8275" /><span>{error}</span><button className="quiet-button focus-tv" onClick={() => window.location.reload()} data-testid="button-retry-catalog"><RefreshCw size={15} />Tentar de novo</button></div>}
    {!loading && !error && shelf === 'Início' && continuarAssistindo.length > 0 && <section className="shelf" style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">Continuar assistindo</h2><div className="section-rule" /></div>
      <div className="video-grid">{continuarAssistindo.filter((item) => item.videos).map((item) => <ContinueCard key={item.id} item={item} onOpen={() => openVideo(item.video_id)} />)}</div>
    </section>}
    {!loading && !error && shelf === 'Início' && layout.length > 0 && layout.map((item) => {
      if (item.tipo === 'series') return renderSeriesSection(item.id);
      if (item.tipo === 'colecao' && item.colecao_id) return renderColecaoSection(item.colecao_id, item.id);
      if (item.tipo === 'catalogo_geral') return renderCatalogoGeralSection(item.id);
      return null;
    })}
    {!loading && !error && shelf === 'Início' && layout.length === 0 && <>
      {renderSeriesSection('series-fallback')}
      {colecoes.map((c) => renderColecaoSection(c.colecao.id, c.colecao.id))}
      {renderCatalogoGeralSection('geral-fallback')}
    </>}
    {!loading && !error && shelf !== 'Início' && renderCatalogoGeralSection('geral-shelf')}
  </div>;
}
function findVideo(videos: Video[], id: string) {
  return videos.find((video) => video.id === id);
}
function PlayerPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { videos, loading } = useVideos();
  const user = useAuth();
  const access = useCatalogAccess(user);
  useEffect(() => {
    if (access === false) setLocation('/assinatura');
  }, [access]);
  const video = findVideo(videos, params.id || new URLSearchParams(window.location.search).get('id') || '');
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('cinevito-favorites') || '[]').includes(video?.id));
  const [episodioInfo, setEpisodioInfo] = useState<{ episodio: Episodio; serieId: string; proximo?: Episodio } | null>(null);
  const [episodiosDaTemporada, setEpisodiosDaTemporada] = useState<Episodio[]>([]);
  useEffect(() => {
    if (!video || access !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchEpisodioInfo(video.id);
        if (cancelled) return;
        if (info) {
          setEpisodioInfo(info);
          const lista = await fetchEpisodios(info.episodio.temporada_id);
          if (!cancelled) setEpisodiosDaTemporada(lista);
          if (user) await salvarProgresso({ video_id: video.id, serie_id: info.serieId, temporada_id: info.episodio.temporada_id, numero_episodio: info.episodio.numero });
        } else {
          setEpisodioInfo(null);
          setEpisodiosDaTemporada([]);
          if (user) await salvarProgresso({ video_id: video.id });
        }
      } catch { /* salvar progresso é best-effort, nunca deve travar o player */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, access, user?.id]);
  function toggle() {
    if (!video) return;
    const current: string[] = JSON.parse(localStorage.getItem('cinevito-favorites') || '[]');
    const next = current.includes(video.id) ? current.filter((id) => id !== video.id) : [...current, video.id];
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
    setSaved(!saved);
  }
  if (loading || access === null || access === false) return <div className="content-wrap page-main"><div className="skeleton" style={{ aspectRatio: '16/9' }} /></div>;
  if (!video) return <div className="content-wrap page-main"><div className="empty-state"><CircleAlert size={26} /><h3>Vídeo não encontrado</h3><p>Esse título não está mais disponível no catálogo.</p><Link href="/catalogo" className="primary-button focus-tv">Voltar ao catálogo</Link></div></div>;
  const embed = getEmbedInfo(video.url_video);
  return <div className="content-wrap page-main"><button className="quiet-button focus-tv" onClick={() => setLocation('/catalogo')} data-testid="button-back-catalog"><ArrowLeft size={16} />Voltar ao catálogo</button><div className="player-stage" style={{ marginTop: 17 }}><div className="player-box">
    {embed.type === 'file' && <video src={embed.src} controls playsInline data-testid="video-player" style={{ width: '100%', height: '100%' }} />}
    {embed.type === 'embed' && <iframe src={embed.src} title={video.titulo} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen sandbox={VIDEO_IFRAME_SANDBOX} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', border: 0 }} data-testid="video-player" />}
    {embed.type === 'none' && <div className="player-idle"><Play size={38} /><strong>Pronto para assistir</strong><span>Este título ainda não tem um link de vídeo cadastrado.</span></div>}
  </div><div className="player-details"><div><div className="eyebrow">{video.genero || video.categoria || 'CineVito'} {video.ano ? ` / ${video.ano}` : ''}{episodioInfo ? ` · Ep. ${episodioInfo.episodio.numero}` : ''}</div><h1 className="section-title" style={{ marginTop: 7 }} data-testid="text-player-title">{video.titulo}</h1><p>{video.descricao || 'Este título faz parte do catálogo CineVito.'}</p></div><div className="player-actions"><button className={`secondary-button focus-tv ${saved ? 'active' : ''}`} onClick={toggle} data-testid="button-player-favorite"><Heart size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Na coleção' : 'Salvar'}</button>{episodioInfo?.proximo && <button className="primary-button focus-tv" onClick={() => setLocation(`/player/${episodioInfo.proximo!.video_id}`)}>Próximo episódio<ChevronRight size={16} /></button>}</div></div>
  {episodiosDaTemporada.length > 1 && <div style={{ marginTop: 20 }}>
    <h3 className="section-title" style={{ fontSize: '1rem' }}>Episódios desta temporada</h3>
    <div className="admin-list" style={{ marginTop: 10 }}>{episodiosDaTemporada.map((ep) => <div key={ep.id} role="button" tabIndex={0} onClick={() => setLocation(`/player/${ep.video_id}`)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLocation(`/player/${ep.video_id}`)} className="result-row" style={{ cursor: 'pointer', border: ep.video_id === video.id ? '1px solid var(--accent-teal, #2ec4b6)' : undefined }}>
      <span><strong>Ep. {ep.numero}</strong> — {ep.titulo || ep.videos?.titulo}</span>
      {ep.video_id === video.id ? <span className="muted" style={{ fontSize: '.78rem' }}>Assistindo</span> : <Play size={15} color="#00c8ff" />}
    </div>)}</div>
  </div>}
  </div></div>;
}
function SeriePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const user = useAuth();
  const access = useCatalogAccess(user);
  const [data, setData] = useState<{ serie: Serie | null; temporadas: Array<{ temporada: Temporada; episodios: Episodio[] }> } | null>(null);
  const [activeTemporada, setActiveTemporada] = useState(0);
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    fetchSerieCompleta(params.id).then((result) => { if (!cancelled) setData(result); }).catch(() => { if (!cancelled) setData({ serie: null, temporadas: [] }); });
    return () => { cancelled = true; };
  }, [params.id]);
  function openEpisodio(videoId: string) {
    setLocation(access ? `/player/${videoId}` : '/assinatura');
  }
  if (!data) return <div className="content-wrap page-main"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!data.serie) return <div className="content-wrap page-main"><div className="empty-state"><CircleAlert size={26} /><h3>Série não encontrada</h3><Link href="/catalogo" className="primary-button focus-tv" style={{ marginTop: 12 }}>Voltar ao catálogo</Link></div></div>;
  const atual = data.temporadas[activeTemporada];
  return <div className="content-wrap page-main">
    <button className="quiet-button focus-tv" onClick={() => setLocation('/catalogo')}><ArrowLeft size={16} />Voltar ao catálogo</button>
    <PageHeader eyebrow="Série" title={data.serie.titulo} description={data.serie.descricao || undefined} />
    {data.temporadas.length > 0 && <div className="chip-row" role="tablist">{data.temporadas.map((item, index) => <button key={item.temporada.id} className={'chip focus-tv ' + (activeTemporada === index ? 'active' : '')} onClick={() => setActiveTemporada(index)} role="tab" aria-selected={activeTemporada === index}>{item.temporada.titulo || `Temporada ${item.temporada.numero}`}</button>)}</div>}
    {atual && <div className="admin-list" style={{ marginTop: 18 }}>{atual.episodios.length ? atual.episodios.map((ep) => <div className="result-row" key={ep.id} role="button" tabIndex={0} onClick={() => openEpisodio(ep.video_id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openEpisodio(ep.video_id)} style={{ cursor: 'pointer' }}><span><strong>Ep. {ep.numero}</strong> — {ep.titulo || ep.videos?.titulo}</span><Play size={16} color="#00c8ff" /></div>) : <p className="muted">Nenhum episódio cadastrado nesta temporada ainda.</p>}</div>}
    {!data.temporadas.length && <p className="muted" style={{ marginTop: 18 }}>Nenhuma temporada cadastrada ainda.</p>}
  </div>;
}
function CollectionPage() {
  const [, setLocation] = useLocation();
  const user = useAuth();
  const access = useCatalogAccess(user);
  const { videos } = useVideos();
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem('cinevito-favorites') || '[]'));
  const collection = videos.filter((video) => favorites.includes(video.id));
  function remove(id: string) {
    const next = favorites.filter((value) => value !== id);
    setFavorites(next);
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
  }
  function openVideo(id: string) {
    setLocation(access ? `/player/${id}` : '/assinatura');
  }
  return <div className="content-wrap page-main"><PageHeader eyebrow="O que você guardou" title="Minha coleção" description="Seus títulos favoritos em um só lugar, prontos para a próxima sessão." />{collection.length ? <div className="video-grid">{collection.map((video) => <Poster key={video.id} video={video} favorite onFavorite={() => remove(video.id)} onOpen={() => openVideo(video.id)} />)}</div> : <div className="empty-state" data-testid="status-collection-empty"><Heart size={27} /><h3>Ainda está vazio</h3><p>Use o coração nos títulos do catálogo para montar sua coleção.</p><Link href="/catalogo" className="primary-button focus-tv" data-testid="link-collection-catalog">Explorar catálogo</Link></div>}</div>;
}
function subscriptionLabel(sub: MinhaAssinatura | null): { status: string; origem: string } {
  if (!sub) return { status: 'Sem plano', origem: 'Nenhuma assinatura registrada ainda.' };
  const status = sub.status === 'ativa' ? 'Ativa' : sub.status === 'trial' ? 'Teste grátis' : sub.status === 'pendente' ? 'Pagamento em análise' : 'Inativa';
  let origem = 'Pagamento confirmado.';
  if (sub.plano?.startsWith('Indicação')) origem = 'Recompensa do programa de indicação.';
  else if (sub.concedido_por_admin) origem = sub.motivo_concessao ? `Cortesia concedida pelo admin — ${sub.motivo_concessao}` : 'Cortesia concedida pelo admin.';
  else if (sub.status === 'trial') origem = 'Teste grátis de novo cadastro.';
  else if (!sub.id_pagamento_gateway) origem = 'Sem pagamento registrado.';
  return { status, origem };
}
function ProfilePage() {
  const user = useAuth();
  const [profile, setProfile] = useState<{ nome?: string; email?: string; codigo_indicacao?: string } | null>(null);
  const [subscription, setSubscription] = useState<MinhaAssinatura | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (hasRuntimeConfig && user) { fetchProfile().then(setProfile).catch(() => setProfile(null)); fetchMySubscription().then(setSubscription).catch(() => setSubscription(null)); } }, [user]);
  const name = profile?.nome || titleCaseName(user);
  const { status, origem } = subscriptionLabel(subscription);
  async function copyReferral() {
    const code = profile?.codigo_indicacao;
    if (!code) return;
    await navigator.clipboard?.writeText(`${window.location.origin}/?ref=${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }
  return <div className="content-wrap page-main"><PageHeader eyebrow="Sua conta" title="Perfil" description="Gerencie seus dados, sua assinatura e o acesso do CineVito." /><div className="two-col"><section className="panel panel-pad"><div className="profile-hero"><div className="profile-avatar">{initials(user)}</div><div><h1>{name}</h1><p data-testid="text-profile-email">{profile?.email || user?.email || 'Sessão local'}</p></div></div><div className="status-card" data-testid="status-profile-subscription"><h3>Acesso ao CineVito</h3>{subscription ? <><p><strong>{subscription.plano || 'Plano'}</strong> · {status}</p><p className="muted" style={{ fontSize: '.8rem' }}>{origem}</p>{subscription.data_expiracao && <p className="muted" style={{ fontSize: '.8rem' }}>Válido até {new Date(subscription.data_expiracao).toLocaleDateString('pt-BR')}</p>}</> : <p>{user ? 'Você ainda não tem nenhuma assinatura registrada.' : 'Entre para consultar sua assinatura.'}</p>}<Link href="/assinatura" className="primary-button focus-tv" style={{ width: 'fit-content', marginTop: 7 }} data-testid="link-profile-subscription">Ver assinatura</Link></div></section><section className="panel panel-pad"><h2 className="panel-title">Seu código de indicação</h2>{profile?.codigo_indicacao ? <><p className="muted" style={{ fontSize: '.8rem', lineHeight: 1.5 }}>Compartilhe o link. A indicação só é confirmada depois que a pessoa fizer um pagamento.</p><div className="code-box"><code data-testid="text-referral-code">{profile.codigo_indicacao}</code><button className="icon-button focus-tv" onClick={copyReferral} aria-label="Copiar link de indicação" data-testid="button-copy-referral">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><p className="muted" style={{ fontSize: '.72rem', marginBottom: 0 }}>{copied ? 'Link copiado.' : 'Não há campanha ativa no momento? Seu código continua válido.'}</p></> : <div className="notice notice-cyan"><Info size={16} /><span>Seu código aparece aqui depois do primeiro pagamento aprovado (acesso de cortesia não gera código).</span></div>}</section></div></div>;
}
function loadMercadoPagoSdk(): Promise<void> {
  if ((window as unknown as { MercadoPago?: unknown }).MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('mp-sdk-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o checkout.')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'mp-sdk-script';
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar o checkout.'));
    document.head.appendChild(script);
  });
}
function SubscriptionPage() {
  const user = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]); const [loading, setLoading] = useState(hasRuntimeConfig); const [selected, setSelected] = useState(''); const [category, setCategory] = useState('');
  const [cupom, setCupom] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState<'idle' | 'loading' | 'ready' | 'submitting' | 'approved' | 'pending' | 'rejected' | 'error'>('idle');
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [pix, setPix] = useState<{ copiaCola?: string | null; qrBase64?: string | null } | null>(null);
  const brickRef = useRef<{ unmount: () => void } | null>(null);
  useEffect(() => { if (hasRuntimeConfig) fetchPlans().then((items) => { setPlans(items); setCategory(items[0]?.categoria || ''); }).catch(() => setPlans([])).finally(() => setLoading(false)); }, []);
  function duration(plan: Plan) { return plan.duracao_dias ? plan.duracao_dias + ' dias' : plan.duracao_meses ? plan.duracao_meses + (plan.duracao_meses === 1 ? ' mês' : ' meses') : 'período definido no plano'; }
  const categories = Array.from(new Set(plans.map((plan) => plan.categoria || 'Plano'))); const visiblePlans = plans.filter((plan) => (plan.categoria || 'Plano') === category);
  const selectedPlan = plans.find((plan) => plan.id === selected) || null;

  useEffect(() => {
    setPix(null);
    setCheckoutMessage('');
    if (brickRef.current) { try { brickRef.current.unmount(); } catch { /* ignore */ } brickRef.current = null; }
    const container = document.getElementById('payment-brick-container');
    if (container) container.innerHTML = '';
    if (!selectedPlan || !user || !hasRuntimeConfig) { setCheckoutStatus('idle'); return; }

    let cancelled = false;
    setCheckoutStatus('loading');
    (async () => {
      try {
        await loadMercadoPagoSdk();
        if (cancelled) return;
        const MercadoPagoCtor = (window as unknown as { MercadoPago: new (key: string, opts: { locale: string }) => { bricks: () => { create: (type: string, containerId: string, settings: unknown) => Promise<{ unmount: () => void }> } } }).MercadoPago;
        const mp = new MercadoPagoCtor(MP_PUBLIC_KEY, { locale: 'pt-BR' });
        const brick = await mp.bricks().create('payment', 'payment-brick-container', {
          initialization: {
            amount: Number(selectedPlan.preco) || 0,
            payer: { email: user.email || '' },
          },
          customization: {
            paymentMethods: { creditCard: 'all', debitCard: 'all', bankTransfer: 'all' },
          },
          callbacks: {
            onReady: () => { if (!cancelled) setCheckoutStatus('ready'); },
            onError: () => { if (!cancelled) { setCheckoutStatus('error'); setCheckoutMessage('Não foi possível carregar o checkout. Tente novamente.'); } },
            onSubmit: ({ formData }: { formData: unknown }) => new Promise<void>((resolve, reject) => {
              setCheckoutStatus('submitting');
              setCheckoutMessage('');
              processPayment({ usuario_id: user.id, plano_id: selectedPlan.id, formData, cupom: cupom.trim() || null })
                .then((result) => {
                  if (result.status === 'approved') {
                    setCheckoutStatus('approved');
                    setCheckoutMessage('Pagamento aprovado! Sua assinatura já está ativa.');
                  } else if (result.status === 'pending') {
                    setCheckoutStatus('pending');
                    setPix({ copiaCola: result.pix_copia_cola, qrBase64: result.pix_qr_base64 });
                    setCheckoutMessage('Pagamento em análise. Se for Pix, finalize com o código abaixo.');
                  } else {
                    setCheckoutStatus('rejected');
                    setCheckoutMessage(result.motivo || 'Pagamento recusado. Tente outro cartão ou meio de pagamento.');
                  }
                  resolve();
                })
                .catch((error) => {
                  setCheckoutStatus('error');
                  setCheckoutMessage(error instanceof Error ? error.message : 'Não foi possível processar o pagamento.');
                  reject(error);
                });
            }),
          },
        });
        if (cancelled) { brick.unmount(); return; }
        brickRef.current = brick;
      } catch (error) {
        if (!cancelled) {
          setCheckoutStatus('error');
          setCheckoutMessage(error instanceof Error ? error.message : 'Não foi possível carregar o checkout.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (brickRef.current) { try { brickRef.current.unmount(); } catch { /* ignore */ } brickRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan?.id, user?.id]);

  return <div className="content-wrap page-main"><PageHeader eyebrow="Escolha o seu acesso" title="Assine o CineVito" description="Assista ao catálogo completo em seus dispositivos. O pagamento é processado com segurança, direto por dentro do CineVito." /><div className="two-col"><section className="panel panel-pad"><h2 className="panel-title">Planos disponíveis</h2>{loading ? <div className="plan-list">{[1, 2].map((n) => <div className="skeleton" style={{ height: 94 }} key={n} />)}</div> : plans.length ? <><div className="chip-row" role="tablist">{categories.map((item) => <button key={item} className={'chip focus-tv ' + (category === item ? 'active' : '')} onClick={() => { setCategory(item); setSelected(''); }} role="tab" aria-selected={category === item}>{item}</button>)}</div><div className="plan-list">{visiblePlans.map((plan) => <div className={'plan-card ' + (selected === plan.id ? 'selected' : '')} key={plan.id} onClick={() => setSelected(plan.id)}><div><h3>{plan.nome}</h3><p>{plan.descricao || ((plan.dispositivos || 1) + ' dispositivo(s) · ' + duration(plan))}</p></div><div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}><strong className="plan-price">{typeof plan.preco === 'number' ? 'R$ ' + plan.preco.toFixed(2).replace('.', ',') : 'Consultar'}</strong><button className="primary-button focus-tv" onClick={(event) => { event.stopPropagation(); setSelected(plan.id); }} data-testid={'button-select-plan-' + plan.id}>{selected === plan.id ? 'Selecionado' : 'Escolher'}</button></div></div>)}</div></> : <div className="empty-state"><Settings size={24} /><h3>Planos em configuração</h3><p>Quando os planos estiverem publicados, eles aparecerão aqui para checkout.</p></div>}</section><aside className="panel panel-pad"><div className="eyebrow">Pagamento seguro</div><h2 className="panel-title" style={{ marginTop: 9 }}>Checkout protegido</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.65 }}>Pagamento com cartão ou Pix, processado com segurança direto por dentro do CineVito. Nenhum dado de cartão fica salvo nesta interface.</p>
    {!user && <div className="notice notice-orange" style={{ marginTop: 16 }}><Info size={16} color="#ff8228" /><span>Entre na sua conta para continuar o checkout.</span><Link href="/" className="quiet-button focus-tv">Entrar</Link></div>}
    {user && !selectedPlan && <div className="notice notice-orange" style={{ marginTop: 16 }}><Info size={16} color="#ff8228" /><span>Selecione um plano para continuar ao checkout seguro.</span></div>}
    {user && selectedPlan && checkoutStatus !== 'approved' && <>
      <div className="field" style={{ marginTop: 12 }}><label htmlFor="checkout-cupom">Cupom de desconto (opcional)</label><input id="checkout-cupom" className="input focus-tv" value={cupom} onChange={(event) => setCupom(event.target.value.toUpperCase())} placeholder="Ex.: ANIVERSARIO10" /></div>
      {checkoutStatus === 'loading' && <p className="muted" style={{ fontSize: '.8rem', marginTop: 10 }}>Carregando checkout seguro...</p>}
      {checkoutStatus !== 'pending' && <div id="payment-brick-container" style={{ marginTop: 12 }} />}
    </>}
    {checkoutMessage && <div className={checkoutStatus === 'approved' ? 'notice notice-cyan' : checkoutStatus === 'pending' ? 'notice notice-cyan' : 'notice notice-orange'} style={{ marginTop: 16 }}>{checkoutStatus === 'approved' ? <Check size={16} /> : <Info size={16} />}<span>{checkoutMessage}</span></div>}
    {checkoutStatus === 'pending' && pix?.copiaCola && <div className="notice notice-cyan" style={{ marginTop: 12, display: 'block' }}><strong>Pague com Pix</strong>{pix.qrBase64 && <img src={`data:image/png;base64,${pix.qrBase64}`} alt="QR Code Pix" style={{ width: 180, marginTop: 10, display: 'block' }} />}<p className="muted" style={{ fontSize: '.72rem', marginTop: 8, wordBreak: 'break-all' }}>{pix.copiaCola}</p><button className="secondary-button focus-tv" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(pix.copiaCola || '')}>Copiar código Pix</button></div>}
    {checkoutStatus === 'approved' && <Link href="/catalogo" className="primary-button focus-tv" style={{ marginTop: 12 }}>Ir para o catálogo</Link>}
  </aside></div></div>;
}
function SuggestionPage() {
  const [form, setForm] = useState({ titulo: '', genero: '', ano: '' });
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.titulo.trim()) return;
    setState('loading');
    setErrorMessage('');
    try {
      if (hasRuntimeConfig) await submitSuggestion({ titulo: form.titulo.trim(), genero: form.genero.trim() || undefined, ano_lancamento: form.ano ? Number(form.ano) : undefined });
      else localStorage.setItem('cinevito-last-suggestion', JSON.stringify(form));
      setState('success');
      setForm({ titulo: '', genero: '', ano: '' });
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar agora. Tente novamente.');
    }
  }
  return
