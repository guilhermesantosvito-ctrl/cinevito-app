import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, Check, ChevronDown, CircleAlert, Clapperboard, Copy, Eye, EyeOff,
  Film, Heart, Info, KeyRound, Library, LogIn, LogOut, Play, RefreshCw, Search,
  Send, Settings, ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  adminAddVideoToColecao, adminCreateCategoria, adminCreateColecao, adminCreateGenero, adminCreateVideo, adminDeleteColecao, adminDeleteVideo, adminRemoveVideoFromColecao, adminReorderColecaoVideos, adminUpdateVideo,
  checkCatalogAccess, clearSession, fetchAdminClients, fetchAdminPlans, fetchAdminVideos, fetchCategorias, fetchColecaoVideos, fetchColecoes, fetchColecoesParaCatalogo, fetchGenerosList, fetchMySubscription, fetchPlans, fetchProfile, fetchVideos, getAccessToken, getStoredUser, grantAccess, hasRuntimeConfig,
  processPayment, requestPasswordReset, revokeAccess, signIn, signUp, submitSuggestion, updatePlanActive, type Categoria, type Cliente, type Colecao, type Genero, type MinhaAssinatura, type Plan, type SessionUser, type Video,
} from '@/lib/cinevito-client';
import '@/index.css';
const queryClient = new QueryClient();
const MP_PUBLIC_KEY = 'APP_USR-471c3a9b-ff0f-4743-a417-e54b9f13e902';
const fallbackShelves = ['Início', 'Filmes Clássicos', 'Documentários', 'Curtas-Metragens'];
const genres = ['Todos os gêneros', 'Ação', 'Aventura', 'Comédia', 'Documentário', 'Drama', 'Natureza', 'Terror'];
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
    fetchColecoesParaCatalogo().then((data) => { if (!cancelled) setColecoes(data); }).catch(() => { if (!cancelled) setColecoes([]); });
    return () => { cancelled = true; };
  }, []);
  return colecoes;
}
// Aceita tanto uma URL simples quanto um código <iframe> completo colado
// pelo admin — se for um iframe, extrai o "src" de dentro dele; senão,
// usa o texto como veio (depois de tirar espaços nas pontas).
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
function Poster({ video, favorite, onFavorite, onOpen }: { video: Video; favorite: boolean; onFavorite: () => void; onOpen: () => void }) {
  const poster = video.url_capa ? undefined : ({
    '--poster': 'linear-gradient(145deg, #0d596c, #172532 50%, #e58d49)',
  } as CSSProperties);
  return <article className="video-card reveal" data-testid={`card-video-${video.id}`}><div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={poster}><div className="poster-art" style={video.url_capa ? { backgroundImage: `url(${video.url_capa})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><span className="poster-meta">{video.ano || 'CINEVITO'}</span><strong className="poster-word">{video.titulo}</strong></div>{video.premium && <span className="premium-badge">Premium</span>}<button className={`poster-favorite focus-tv ${favorite ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); onFavorite(); }} aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} data-testid={`button-favorite-${video.id}`}><Heart size={15} fill={favorite ? 'currentColor' : 'none'} /></button></div><div className="video-info"><div><h3 className="video-title" data-testid={`text-video-title-${video.id}`}>{video.titulo}</h3><p className="video-subtitle">{video.genero || video.categoria || 'Catálogo CineVito'}</p></div><Play size={14} color="#00c8ff" /></div></article>;
}
function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]); const [loading, setLoading] = useState(hasRuntimeConfig); const [error, setError] = useState('');
  useEffect(() => { if (!hasRuntimeConfig) { setLoading(false); return; } let cancelled = false; (async () => { try { const items = await fetchVideos(); if (!cancelled) setVideos(items); } catch (fetchError) { if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Não foi possível carregar o catálogo.'); } finally { if (!cancelled) setLoading(false); } })(); return () => { cancelled = true; }; }, []);
  return { videos, loading, error };
}
function CatalogPage() {
  const [, setLocation] = useLocation();
  const user = useAuth();
  const access = useCatalogAccess(user);
  const { videos, loading, error } = useVideos();
  const colecoes = useColecoesDoCatalogo();
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
      && videoBelongsToShelf(video, shelf);
  }), [videos, query, genre, shelf]);
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
  }
  function openVideo(id: string) {
    setLocation(access ? `/player/${id}` : '/assinatura');
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
    {!loading && !error && shelf === 'Início' && colecoes.map(({ colecao, videos: colecaoVideos }) => (
      <section className="shelf" key={colecao.id} style={{ marginTop: 22 }}>
        <div className="shelf-heading"><h2 className="section-title">{colecao.titulo}</h2><div className="section-rule" /></div>
        <div className="video-grid">{colecaoVideos.map((video) => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />)}</div>
      </section>
    ))}
    {!loading && !error && <section className="shelf" style={{ marginTop: 22 }}><div className="shelf-heading"><h2 className="section-title">{shelf === 'Início' ? 'Todo o catálogo' : shelf}</h2><div className="section-rule" /><span>{filtered.length.toString().padStart(2, '0')} títulos</span></div>{filtered.length ? <div className="video-grid">{filtered.map((video) => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />)}</div> : <div className="empty-state" data-testid="status-catalog-empty"><Search size={25} /><h3>{videos.length ? 'Nenhum título encontrado' : 'Catálogo ainda vazio'}</h3><p>{videos.length ? 'Tente outro termo ou limpe os filtros para voltar ao catálogo.' : 'Os títulos aparecem aqui assim que forem cadastrados no painel administrativo.'}</p>{videos.length > 0 && <button className="quiet-button focus-tv" onClick={() => { setQuery(''); setGenre('Todos os gêneros'); setShelf('Início'); }} data-testid="button-clear-catalog-filters">Limpar filtros</button>}</div>}</section>}
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
    {embed.type === 'embed' && <iframe src={embed.src} title={video.titulo} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} data-testid="video-player" />}
    {embed.type === 'none' && <div className="player-idle"><Play size={38} /><strong>Pronto para assistir</strong><span>Este título ainda não tem um link de vídeo cadastrado.</span></div>}
  </div><div className="player-details"><div><div className="eyebrow">{video.genero || video.categoria || 'CineVito'} {video.ano ? ` / ${video.ano}` : ''}</div><h1 className="section-title" style={{ marginTop: 7 }} data-testid="text-player-title">{video.titulo}</h1><p>{video.descricao || 'Este título faz parte do catálogo CineVito.'}</p></div><div className="player-actions"><button className={`secondary-button focus-tv ${saved ? 'active' : ''}`} onClick={toggle} data-testid="button-player-favorite"><Heart size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Na coleção' : 'Salvar'}</button></div></div></div></div>;
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
  return <div className="content-wrap page-main"><PageHeader eyebrow="Sua conta" title="Perfil" description="Gerencie seus dados, sua assinatura e o acesso do CineVito." /><div className="two-col"><section className="panel panel-pad"><div className="profile-hero"><div className="profile-avatar">{initials(user)}</div><div><h1>{name}</h1><p data-testid="text-profile-email">{profile?.email || user?.email || 'Sessão local'}</p></div></div><div className="status-card" data-testid="status-profile-subscription"><h3>Acesso ao CineVito</h3>{subscription ? <><p><strong>{subscription.plano || 'Plano'}</strong> · {status}</p><p className="muted" style={{ fontSize: '.8rem' }}>{origem}</p>{subscription.data_expiracao && <p className="muted" style={{ fontSize: '.8rem' }}>Válido até {new Date(subscription.data_expiracao).toLocaleDateString('pt-BR')}</p>}</> : <p>{user ? 'Você ainda não tem nenhuma assinatura registrada.' : 'Entre para consultar sua assinatura.'}</p>}<Link href="/assinatura" className="primary-button focus-tv" style={{ width: 'fit-content', marginTop: 7 }} data-testid="link-profile-subscription">Ver assinatura</Link></div></section><section className="panel panel-pad"><h2 className="panel-title">Seu código de indicação</h2>{profile?.codigo_indicacao ? <><p className="muted" style={{ fontSize: '.8rem', lineHeight: 1.5 }}>Compartilhe o link. A indicação só é confirmada depois que a pessoa fizer um pagamento.</p><div className="code-box"><code data-testid="text-referral-code">{profile.codigo_indicacao}</code><button className="icon-button focus-tv" onClick={copyReferral} aria-label="Copiar link de indicação" data-testid="button-copy-referral">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><p className="muted" style={{ fontSize: '.72rem', marginBottom: 0 }}>{copied ? 'Link copiado.' : 'Não há campanha ativa no momento? Seu código continua válido.'}</p></> : <div className="notice notice-cyan"><Info size={16} /><span>Seu código aparece aqui depois do primeiro pagamento aprovado.</span></div>}</section></div></div>;
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
  const [form, setForm] = useState({ titulo: '', mensagem: '' });
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.titulo.trim()) return;
    setState('loading');
    try {
      if (hasRuntimeConfig) await submitSuggestion(form);
      else localStorage.setItem('cinevito-last-suggestion', JSON.stringify(form));
      setState('success');
      setForm({ titulo: '', mensagem: '' });
    } catch { setState('error'); }
  }
  return <div className="content-wrap page-main"><PageHeader eyebrow="Ajude a curadoria" title="Sugira um filme" description="Não encontrou o que queria? Conte para a gente qual título deveria entrar no CineVito." /><div className="two-col"><form className="panel panel-pad" onSubmit={submit}><h2 className="panel-title">Sua sugestão</h2><div className="field"><label htmlFor="suggestion-title">Nome do filme/vídeo</label><input id="suggestion-title" className="input focus-tv" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Digite o nome do título" data-testid="input-suggestion-title" /></div><div className="field"><label htmlFor="suggestion-message">Por que você quer assistir?</label><textarea id="suggestion-message" className="input focus-tv" value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} placeholder="Uma frase já ajuda nossa curadoria." data-testid="input-suggestion-message" /></div>{state === 'success' && <p className="form-success" data-testid="status-suggestion-success">Sugestão enviada. Obrigado por ajudar o catálogo.</p>}{state === 'error' && <p className="form-error" data-testid="status-suggestion-error">Não foi possível enviar agora. Tente novamente.</p>}<button className="primary-button focus-tv" type="submit" disabled={state === 'loading'} data-testid="button-submit-suggestion"><Send size={16} />{state === 'loading' ? 'Enviando...' : 'Enviar sugestão'}</button></form><aside className="panel panel-pad"><div className="eyebrow">Como funciona</div><h2 className="panel-title" style={{ marginTop: 9 }}>Curadoria viva</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.65 }}>As sugestões ajudam a orientar os próximos títulos do catálogo. Para dúvidas sobre sua conta ou assinatura, consulte a central de ajuda.</p><Link href="/faq" className="secondary-button focus-tv" style={{ marginTop: 10 }} data-testid="link-suggestion-faq">Ir para perguntas frequentes <ArrowLeft size={15} className="rotate-180" /></Link></aside></div></div>;
}
function FaqPage() {
  const faqs = [['Como sugiro um filme que não está no catálogo?', 'Use a página Sugira um filme para enviar o título e, se quiser, uma breve justificativa. Nossa curadoria consulta as sugestões para orientar as próximas adições.'], ['Como funciona o programa de indicação?', 'Seu código é fixo e aparece no perfil. A indicação só é confirmada quando a pessoa indicada realiza um pagamento aprovado dentro do prazo da campanha ativa.'], ['Posso assistir em uma Smart TV?', 'Sim. O catálogo funciona no navegador da sua Smart TV e os elementos navegáveis têm destaque de foco para uso com controle remoto.'], ['Como funciona o teste grátis?', 'O período e as condições do seu acesso aparecem na área de assinatura e seguem a configuração vigente da plataforma.'], ['Como redefino minha senha?', 'Use o link Esqueci minha senha na tela de entrada. Você receberá as instruções no e-mail da conta.']];
  return <div className="content-wrap page-main"><PageHeader eyebrow="CineVito ajuda" title="Perguntas frequentes" description="Respostas rápidas para aproveitar melhor o seu acesso." /><div className="faq-list">{faqs.map(([question, answer], index) => <details className="faq-item" key={question} open={index === 0} data-testid={`faq-item-${index}`}><summary>{question}<ChevronDown size={17} /></summary><div className="faq-answer">{answer}</div></details>)}</div><div className="notice notice-cyan" style={{ maxWidth: 820, marginTop: 24 }}><Info size={17} /><span>Não encontrou a resposta? <a href="mailto:contatocinevito@gmail.com" style={{ color: '#56e0ff' }} data-testid="link-contact-email">contatocinevito@gmail.com</a></span></div></div>;
}
function AdminPage() {
  const user = useAuth(); const [profile, setProfile] = useState<{ is_admin?: boolean; admin_master?: boolean } | null>(null); const [tab, setTab] = useState('videos'); const [loading, setLoading] = useState(Boolean(user && hasRuntimeConfig)); const [message, setMessage] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoGenero, setNovoGenero] = useState('');
  const [videoForm, setVideoForm] = useState({ url_video: '', titulo: '', descricao: '', categoria_id: '', genero: '', url_capa: '', licenca: '', ano: '' });
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [colecoes, setColecoes] = useState<Colecao[]>([]);
  const [novaColecaoTitulo, setNovaColecaoTitulo] = useState('');
  const [novaColecaoDescricao, setNovaColecaoDescricao] = useState('');
  const [criandoColecao, setCriandoColecao] = useState(false);
  const [selectedColecao, setSelectedColecao] = useState<Colecao | null>(null);
  const [colecaoVideos, setColecaoVideos] = useState<Array<{ video_id: string; ordem: number; videos: Video }>>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [grantTarget, setGrantTarget] = useState<Cliente | null>(null);
  const [grantForm, setGrantForm] = useState<{ quantidade: number; unidade: 'dias' | 'meses'; motivo: string }>({ quantidade: 30, unidade: 'dias', motivo: '' });
  const [grantBusy, setGrantBusy] = useState(false);
  const [revokeBusyId, setRevokeBusyId] = useState<string | null>(null);
  useEffect(() => { if (!user || !hasRuntimeConfig) return; fetchProfile().then((value) => setProfile(value as { is_admin?: boolean; admin_master?: boolean })).catch(() => setProfile(null)).finally(() => setLoading(false)); }, [user]);

  async function loadVideos() { try { setVideos(await fetchAdminVideos()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.'); } }
  async function loadCategoriasEGeneros() {
    try { const [cats, gens] = await Promise.all([fetchCategorias(), fetchGenerosList()]); setCategorias(cats); setGeneros(gens); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar categorias/gêneros.'); }
  }
  useEffect(() => {
    if (!profile?.is_admin) return;
    loadVideos();
    loadCategoriasEGeneros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.is_admin]);
  async function handleCreateCategoria() {
    if (!novaCategoria.trim()) return;
    try { await adminCreateCategoria(novaCategoria.trim()); setNovaCategoria(''); await loadCategoriasEGeneros(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar a categoria.'); }
  }
  async function handleCreateGenero() {
    if (!novoGenero.trim()) return;
    try { await adminCreateGenero(novoGenero.trim()); setNovoGenero(''); await loadCategoriasEGeneros(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar o gênero.'); }
  }
  function resetVideoForm() {
    setVideoForm({ url_video: '', titulo: '', descricao: '', categoria_id: '', genero: '', url_capa: '', licenca: '', ano: '' });
    setEditingVideoId(null);
  }
  function editVideo(video: Video) {
    setEditingVideoId(video.id);
    setVideoForm({
      url_video: video.url_video || '',
      titulo: video.titulo || '',
      descricao: video.descricao || '',
      categoria_id: video.categoria_id || '',
      genero: video.genero || '',
      url_capa: video.url_capa || '',
      licenca: video.licenca || '',
      ano: video.ano ? String(video.ano) : '',
    });
  }
  async function saveVideo() {
    setMessage('');
    if (!videoForm.url_video.trim() || !videoForm.titulo.trim()) {
      setMessage('Preencha ao menos o link/código do vídeo e o título.');
      return;
    }
    setSavingVideo(true);
    const payload: Partial<Video> = {
      url_video: extractVideoUrl(videoForm.url_video),
      titulo: videoForm.titulo.trim(),
      descricao: videoForm.descricao.trim() || null,
      categoria_id: videoForm.categoria_id || null,
      genero: videoForm.genero || null,
      url_capa: videoForm.url_capa.trim() || null,
      licenca: videoForm.licenca.trim() || null,
      ano: videoForm.ano ? Number(videoForm.ano) : null,
      fonte: 'Cadastrado manualmente',
    };
    try {
      if (editingVideoId) await adminUpdateVideo(editingVideoId, payload);
      else await adminCreateVideo(payload);
      resetVideoForm();
      await loadVideos();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o vídeo.');
    } finally {
      setSavingVideo(false);
    }
  }
  async function deleteVideo(id: string) {
    if (!window.confirm('Apagar este vídeo do catálogo?')) return;
    setDeletingVideoId(id);
    try {
      await adminDeleteVideo(id);
      await loadVideos();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível apagar o vídeo.');
    } finally {
      setDeletingVideoId(null);
    }
  }

  async function loadColecoes() { try { setColecoes(await fetchColecoes()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as coleções.'); } }
  async function createColecao() {
    if (!novaColecaoTitulo.trim()) { setMessage('Dê um título para a coleção.'); return; }
    setCriandoColecao(true);
    try {
      await adminCreateColecao({ titulo: novaColecaoTitulo.trim(), descricao: novaColecaoDescricao.trim() || undefined });
      setNovaColecaoTitulo('');
      setNovaColecaoDescricao('');
      await loadColecoes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar a coleção.');
    } finally {
      setCriandoColecao(false);
    }
  }
  async function deleteColecaoHandler(id: string) {
    if (!window.confirm('Apagar esta coleção? Os vídeos continuam no catálogo normal.')) return;
    try {
      await adminDeleteColecao(id);
      if (selectedColecao?.id === id) { setSelectedColecao(null); setColecaoVideos([]); }
      await loadColecoes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível apagar a coleção.');
    }
  }
  async function selectColecao(colecao: Colecao) {
    setSelectedColecao(colecao);
    try { setColecaoVideos(await fetchColecaoVideos(colecao.id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os vídeos da coleção.'); }
  }
  async function addVideoToColecaoHandler(videoId: string) {
    if (!selectedColecao || !videoId) return;
    try {
      await adminAddVideoToColecao(selectedColecao.id, videoId);
      setColecaoVideos(await fetchColecaoVideos(selectedColecao.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar o vídeo.');
    }
  }
  async function removeVideoFromColecaoHandler(videoId: string) {
    if (!selectedColecao) return;
    try {
      await adminRemoveVideoFromColecao(selectedColecao.id, videoId);
      setColecaoVideos((current) => current.filter((item) => item.video_id !== videoId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível remover o vídeo.');
    }
  }
  function handleDragStart(index: number) { setDragIndex(index); }
  function handleDragOver(event: DragEvent) { event.preventDefault(); }
  async function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !selectedColecao) { setDragIndex(null); return; }
    const reordered = [...colecaoVideos];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setColecaoVideos(reordered);
    setDragIndex(null);
    try {
      await adminReorderColecaoVideos(selectedColecao.id, reordered.map((item) => item.video_id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a nova ordem.');
    }
  }

  async function loadPlans() { try { setPlans(await fetchAdminPlans()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os planos.'); } }
  async function loadClients() { try { setClients(await fetchAdminClients()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os clientes.'); } }
  function openGrant(client: Cliente) { setGrantTarget(client); setGrantForm({ quantidade: 30, unidade: 'dias', motivo: '' }); }
  function closeGrant() { setGrantTarget(null); }
  async function confirmGrant() {
    if (!grantTarget) return;
    setGrantBusy(true);
    try {
      await grantAccess({ usuario_id: grantTarget.id, quantidade: grantForm.quantidade, unidade: grantForm.unidade, motivo: grantForm.motivo });
      setMessage('Acesso concedido para ' + (grantTarget.nome || grantTarget.email) + '.');
      closeGrant();
      await loadClients();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível conceder acesso.');
    } finally {
      setGrantBusy(false);
    }
  }
  async function handleRevoke(client: Cliente) {
    const nome = client.nome || client.email || 'este cliente';
    if (!window.confirm(`Cancelar o acesso de ${nome}? A assinatura dela fica inativa imediatamente.`)) return;
    setRevokeBusyId(client.id);
    try {
      await revokeAccess(client.id);
      setMessage(`Acesso cancelado para ${nome}.`);
      await loadClients();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar o acesso.');
    } finally {
      setRevokeBusyId(null);
    }
  }
  async function togglePlan(plan: Plan) { try { await updatePlanActive(plan.id, !plan.ativo); await loadPlans(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o plano.'); } }

  if (!user) return <LockedPage title="Área administrativa" description="Entre com uma conta autorizada para acessar este painel." />; if (!hasRuntimeConfig) return <div className="content-wrap page-main"><PageHeader eyebrow="Administração" title="Área protegida" description="O painel administrativo precisa da configuração do Supabase." /><div className="notice notice-orange"><KeyRound size={17} color="#ff8228" /><span>Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Netlify.</span></div></div>; if (loading) return <div className="content-wrap page-main"><PageHeader eyebrow="Administração" title="Verificando acesso" description="Confirmando as permissões da sua conta." /><div className="skeleton" style={{ height: 120 }} /></div>; if (!profile?.is_admin) return <LockedPage title="Acesso restrito" description="Esta área é exclusiva para administradores CineVito." />;

  const tabs = ['videos', 'colecoes', 'clientes', 'planos'];
  return <div className="content-wrap page-main"><PageHeader eyebrow="Painel protegido" title="Administração" description={profile.admin_master ? 'Controle completo do catálogo e dos planos CineVito.' : 'Gerencie as ferramentas liberadas para sua equipe.'} /><div className="admin-tabs" role="tablist">{tabs.map((item) => <button key={item} className={'admin-tab focus-tv ' + (tab === item ? 'active' : '')} onClick={() => { setTab(item); if (item === 'videos') { loadVideos(); loadCategoriasEGeneros(); } if (item === 'colecoes') { loadColecoes(); loadVideos(); } if (item === 'planos') loadPlans(); if (item === 'clientes') loadClients(); }} role="tab" aria-selected={tab === item}>{item === 'colecoes' ? 'Coleções' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>{message && <div className="notice notice-orange" role="status">{message}</div>}

  {tab === 'videos' && <section className="panel panel-pad"><div className="eyebrow">Catálogo manual</div><h2 className="panel-title" style={{ marginTop: 8 }}>{editingVideoId ? 'Editar vídeo' : 'Adicionar vídeo'}</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>Cole um link comum (YouTube, Vimeo, Internet Archive, arquivo .mp4) <strong>ou</strong> cole o código completo de um <code>&lt;iframe&gt;</code> de incorporação — o CineVito identifica sozinho qual é qual. Sempre toca dentro do app, sem sair dele.</p>
    <div className="field"><label htmlFor="v-url">Link do vídeo ou código &lt;iframe&gt;</label><textarea id="v-url" className="input focus-tv" rows={3} value={videoForm.url_video} onChange={(e) => setVideoForm({ ...videoForm, url_video: e.target.value })} placeholder={'https://...\n\nou cole aqui: <iframe src="https://..." ...></iframe>'} /></div>
    <div className="field"><label htmlFor="v-titulo">Título</label><input id="v-titulo" className="input focus-tv" value={videoForm.titulo} onChange={(e) => setVideoForm({ ...videoForm, titulo: e.target.value })} placeholder="Nome do filme/vídeo" /></div>
    <div className="field"><label htmlFor="v-descricao">Sinopse</label><input id="v-descricao" className="input focus-tv" value={videoForm.descricao} onChange={(e) => setVideoForm({ ...videoForm, descricao: e.target.value })} placeholder="Uma linha sobre o vídeo" /></div>
    <div className="field"><label htmlFor="v-categoria">Categoria</label><select id="v-categoria" className="input focus-tv" value={videoForm.categoria_id} onChange={(e) => setVideoForm({ ...videoForm, categoria_id: e.target.value })}><option value="">Selecione...</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select><div style={{ display: 'flex', gap: 8, marginTop: 6 }}><input className="input focus-tv" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Criar nova categoria..." /><button type="button" className="secondary-button focus-tv" onClick={handleCreateCategoria}>Criar</button></div></div>
    <div className="field"><label htmlFor="v-genero">Gênero</label><select id="v-genero" className="input focus-tv" value={videoForm.genero} onChange={(e) => setVideoForm({ ...videoForm, genero: e.target.value })}><option value="">Selecione...</option>{generos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}</select><div style={{ display: 'flex', gap: 8, marginTop: 6 }}><input className="input focus-tv" value={novoGenero} onChange={(e) => setNovoGenero(e.target.value)} placeholder="Criar novo gênero..." /><button type="button" className="secondary-button focus-tv" onClick={handleCreateGenero}>Criar</button></div></div>
    <div className="field"><label htmlFor="v-capa">URL da capa (opcional)</label><input id="v-capa" className="input focus-tv" value={videoForm.url_capa} onChange={(e) => setVideoForm({ ...videoForm, url_capa: e.target.value })} placeholder="https://..." /></div>
    <div className="field"><label htmlFor="v-licenca">Licença</label><input id="v-licenca" className="input focus-tv" value={videoForm.licenca} onChange={(e) => setVideoForm({ ...videoForm, licenca: e.target.value })} placeholder="Ex.: Domínio Público" /></div>
    <div className="field"><label htmlFor="v-ano">Ano</label><input id="v-ano" type="number" className="input focus-tv" value={videoForm.ano} onChange={(e) => setVideoForm({ ...videoForm, ano: e.target.value })} placeholder="Ex.: 1968" /></div>
    <button className="primary-button focus-tv" onClick={saveVideo} disabled={savingVideo}>{savingVideo ? 'Salvando...' : editingVideoId ? 'Salvar alterações' : 'Adicionar ao catálogo'}</button>
    {editingVideoId && <button className="quiet-button focus-tv" style={{ marginLeft: 10 }} onClick={resetVideoForm}>Cancelar edição</button>}
    <h3 style={{ marginTop: 26 }}>Vídeos cadastrados</h3>
    <div className="admin-list" style={{ marginTop: 10 }}>{videos.length ? videos.map((video) => <div className="result-row" key={video.id}><span><strong>{video.titulo}</strong><small style={{ display: 'block', color: '#96a0af', marginTop: 3 }}>{video.genero || 'sem gênero'} · {video.ano || 'sem ano'}</small></span><span style={{ display: 'flex', gap: 8 }}><button className="quiet-button focus-tv" onClick={() => editVideo(video)}>Editar</button><button className="quiet-button focus-tv" onClick={() => deleteVideo(video.id)} disabled={deletingVideoId === video.id}>{deletingVideoId === video.id ? 'Apagando...' : 'Apagar'}</button></span></div>) : <p className="muted">Nenhum vídeo cadastrado ainda.</p>}</div>
  </section>}

  {tab === 'colecoes' && <section className="panel panel-pad"><div className="eyebrow">Curadoria</div><h2 className="panel-title" style={{ marginTop: 8 }}>Coleções (fileiras do catálogo)</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>Crie fileiras como "Top 10" ou "Sessão da Tarde" e arraste os títulos pra definir a ordem exata em que aparecem na página inicial do catálogo.</p>
    <div className="field"><label htmlFor="col-titulo">Título da coleção</label><input id="col-titulo" className="input focus-tv" value={novaColecaoTitulo} onChange={(e) => setNovaColecaoTitulo(e.target.value)} placeholder="Ex.: Top 10 desta semana" /></div>
    <div className="field"><label htmlFor="col-descricao">Descrição (opcional)</label><input id="col-descricao" className="input focus-tv" value={novaColecaoDescricao} onChange={(e) => setNovaColecaoDescricao(e.target.value)} placeholder="Uma linha sobre a coleção" /></div>
    <button className="primary-button focus-tv" onClick={createColecao} disabled={criandoColecao}>{criandoColecao ? 'Criando...' : 'Criar coleção'}</button>
    <h3 style={{ marginTop: 26 }}>Coleções existentes</h3>
    <div className="admin-list" style={{ marginTop: 10 }}>{colecoes.length ? colecoes.map((colecao) => <div className="result-row" key={colecao.id}><span><strong>{colecao.titulo}</strong></span><span style={{ display: 'flex', gap: 8 }}><button className="secondary-button focus-tv" onClick={() => selectColecao(colecao)}>Gerenciar vídeos</button><button className="quiet-button focus-tv" onClick={() => deleteColecaoHandler(colecao.id)}>Apagar</button></span></div>) : <p className="muted">Nenhuma coleção criada ainda.</p>}</div>
    {selectedColecao && <div style={{ marginTop: 24 }}>
      <h3>Vídeos em "{selectedColecao.titulo}"</h3>
      <div className="field"><label htmlFor="col-add-video">Adicionar vídeo</label><select id="col-add-video" className="input focus-tv" defaultValue="" onChange={(e) => { const value = e.target.value; if (value) addVideoToColecaoHandler(value); e.target.value = ''; }}><option value="">Selecione um vídeo...</option>{videos.filter((v) => !colecaoVideos.some((cv) => cv.video_id === v.id)).map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}</select></div>
      <p className="muted" style={{ fontSize: '.78rem' }}>Arraste os itens abaixo pra reordenar.</p>
      <div style={{ marginTop: 8 }}>{colecaoVideos.map((item, index) => (
        <div
          key={item.video_id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(index)}
          className="result-row"
          style={{ cursor: 'grab', border: dragIndex === index ? '1px dashed var(--accent-teal, #2ec4b6)' : undefined }}
        >
          <span>{index + 1}. {item.videos?.titulo}</span>
          <button className="quiet-button focus-tv" onClick={() => removeVideoFromColecaoHandler(item.video_id)}>Remover</button>
        </div>
      ))}{!colecaoVideos.length && <p className="muted">Nenhum vídeo nesta coleção ainda.</p>}</div>
    </div>}
  </section>}

  {tab === 'clientes' && <section className="panel panel-pad"><div className="eyebrow">CRM</div><h2 className="panel-title" style={{ marginTop: 8 }}>Clientes</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.6 }}>Lista de clientes cadastrados. "Conceder acesso" soma tempo sem passar pelo Mercado Pago. "Cancelar acesso" desativa a assinatura imediatamente.</p>{grantTarget && <div className="notice notice-cyan" style={{ marginTop: 14, display: 'block' }}><strong>Conceder acesso para: {grantTarget.nome || grantTarget.email}</strong><div className="field" style={{ marginTop: 10 }}><label htmlFor="grant-quantidade">Quantidade</label><input id="grant-quantidade" type="number" min={1} className="input focus-tv" value={grantForm.quantidade} onChange={(event) => setGrantForm({ ...grantForm, quantidade: Number(event.target.value) || 1 })} /></div><div className="field"><label htmlFor="grant-unidade">Unidade</label><select id="grant-unidade" className="input focus-tv" value={grantForm.unidade} onChange={(event) => setGrantForm({ ...grantForm, unidade: event.target.value as 'dias' | 'meses' })}><option value="dias">Dias</option><option value="meses">Meses</option></select></div><div className="field"><label htmlFor="grant-motivo">Motivo (fica registrado)</label><input id="grant-motivo" className="input focus-tv" value={grantForm.motivo} onChange={(event) => setGrantForm({ ...grantForm, motivo: event.target.value })} placeholder="Ex.: cortesia, indicação premiada..." /></div><button className="primary-button focus-tv" onClick={confirmGrant} disabled={grantBusy}>{grantBusy ? 'Concedendo...' : 'Conceder acesso'}</button><button className="quiet-button focus-tv" style={{ marginLeft: 10 }} onClick={closeGrant}>Cancelar</button></div>}<div className="admin-list" style={{ marginTop: 18 }}>{clients.length ? clients.map((client) => { const status = client.assinatura?.status === 'ativa' ? 'Assinante' : client.assinatura?.status === 'trial' ? 'Teste grátis' : client.assinatura?.status ? 'Inativo' : 'Sem plano'; const validade = client.assinatura?.data_expiracao ? new Date(client.assinatura.data_expiracao).toLocaleDateString('pt-BR') : '-'; const podeCancelar = client.assinatura?.status === 'ativa' || client.assinatura?.status === 'trial'; return <div className="result-row" key={client.id}><span><strong>{client.nome || 'Sem nome'}</strong><small style={{ display: 'block', color: '#96a0af', marginTop: 3 }}>{client.email} · {status} · {client.assinatura?.plano || 'sem plano'} · até {validade}</small></span><span style={{ display: 'flex', gap: 8 }}>{podeCancelar && <button className="quiet-button focus-tv" onClick={() => handleRevoke(client)} disabled={revokeBusyId === client.id}>{revokeBusyId === client.id ? 'Cancelando...' : 'Cancelar acesso'}</button>}<button className="secondary-button focus-tv" onClick={() => openGrant(client)}>Conceder acesso</button></span></div>; }) : <button className="secondary-button focus-tv" onClick={loadClients}>Carregar clientes</button>}</div></section>}

  {tab === 'planos' && <section className="panel panel-pad"><div className="eyebrow">Admin master</div><h2 className="panel-title" style={{ marginTop: 8 }}>Planos publicados</h2>{!profile.admin_master ? <div className="notice notice-orange"><CircleAlert size={17} /><span>Apenas o admin master pode alterar a publicação dos planos.</span></div> : plans.length ? <div className="plan-list">{plans.map((plan) => <div className="plan-card" key={plan.id}><div><h3>{plan.nome}</h3><p>{plan.categoria || 'Sem categoria'} · R$ {Number(plan.preco || 0).toFixed(2).replace('.', ',')} · {plan.dispositivos || 1} dispositivo(s)</p></div><button className="secondary-button focus-tv" onClick={() => togglePlan(plan)}>{plan.ativo ? 'Desativar' : 'Ativar'}</button></div>)}</div> : <button className="secondary-button focus-tv" onClick={loadPlans}>Carregar planos</button>}</section>}
  </div>;
}
function LockedPage({ title, description }: { title: string; description: string }) {
  return <div className="content-wrap page-main"><div className="empty-state"><KeyRound size={28} /><h3>{title}</h3><p>{description}</p><Link href="/" className="primary-button focus-tv" style={{ marginTop: 12 }} data-testid="link-locked-login">Ir para entrada</Link></div></div>;
}
function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (hasRuntimeConfig) await requestPasswordReset(email);
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  }
  return <div className="home-shell"><div className="auth-layout" style={{ maxWidth: 620 }}><section className="auth-panel" style={{ borderLeft: 0 }}><Brand /><h2 style={{ marginTop: 42 }}>Redefinir senha</h2><p>Informe o e-mail da sua conta para receber um link de recuperação.</p>{sent ? <div className="notice notice-cyan" data-testid="status-reset-success"><Check size={17} /><span>Se o e-mail existir, as instruções de recuperação serão enviadas.</span></div> : <form onSubmit={submit}><div className="field"><label htmlFor="reset-email">E-mail</label><input id="reset-email" type="email" required className="input focus-tv" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" data-testid="input-reset-email" /></div><button className="primary-button button-wide focus-tv" type="submit" disabled={busy} data-testid="button-submit-reset"> {busy ? 'Enviando...' : 'Enviar instruções'} <Send size={15} /></button></form>}<Link href="/" className="quiet-button button-wide focus-tv" style={{ marginTop: 10 }} data-testid="link-reset-back"><ArrowLeft size={15} />Voltar</Link></section></div></div>;
}
function NotFoundPage() {
  return <div className="content-wrap page-main"><div className="empty-state"><CircleAlert size={28} /><h3>Página não encontrada</h3><p>Esse endereço não faz parte do catálogo CineVito.</p><Link href="/catalogo" className="primary-button focus-tv" style={{ marginTop: 12 }} data-testid="link-not-found-catalog">Voltar ao catálogo</Link></div></div>;
}
function Router() {
  return <Switch>
    <Route path="/" component={AuthPage} /><Route path="/index.html" component={AuthPage} />
    <Route path="/catalogo" component={CatalogPage} /><Route path="/catalogo.html" component={CatalogPage} />
    <Route path="/player/:id" component={PlayerPage} /><Route path="/player.html" component={PlayerPage} />
    <Route path="/perfil" component={ProfilePage} /><Route path="/perfil.html" component={ProfilePage} />
    <Route path="/assinatura" component={SubscriptionPage} /><Route path="/assinatura.html" component={SubscriptionPage} />
    <Route path="/colecao" component={CollectionPage} /><Route path="/colecao.html" component={CollectionPage} />
    <Route path="/sugestao" component={SuggestionPage} /><Route path="/sugestao.html" component={SuggestionPage} />
    <Route path="/faq" component={FaqPage} /><Route path="/faq.html" component={FaqPage} />
    <Route path="/admin" component={AdminPage} /><Route path="/admin.html" component={AdminPage} />
    <Route path="/redefinir-senha" component={ResetPage} /><Route path="/redefinir-senha.html" component={ResetPage} />
    <Route component={NotFoundPage} />
  </Switch>;
}
function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }
  }, []);
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppShell><Router /></AppShell></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
