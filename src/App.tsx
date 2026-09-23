import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, CircleAlert, Clapperboard, Copy, Download, Eye, EyeOff,
  Film, Heart, Info, KeyRound, Library, LogIn, LogOut, MoreVertical, Play, Plus, Radio, RefreshCw, Search,
  Send, Settings, ShieldCheck, Share2, Smartphone, Sparkles, Trash2, UserRound, Users, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  adminAddEpisodio, adminAddToEquipe, adminAddVideoToColecao, adminCreateCategoria, adminCreateColecao, adminCreateCupom, adminCreateGenero, adminCreateLayoutSection, adminCreatePlano, adminCreateSerie, adminCreateTemporada, adminCreateVideo,
  adminDeleteColecao, adminDeleteCupom, adminDeleteLayoutSection, adminDeletePlano, adminDeleteSerie, adminDeleteTemporada, adminDeleteVideo, adminPromoverMaster, adminRebaixarMaster, adminRemoveEpisodio, adminRemoveVideoFromColecao, adminRemoverDaEquipe, adminReorderColecaoVideos, adminReorderLayout, adminToggleCupom, adminToggleLayoutVisible, adminUpdateLayoutSection, adminUpdatePlano, adminUpdateVideo,
  checkCatalogAccess, clearSession, fetchAdminClients, fetchAdminCupons, fetchAdminPlans, fetchAdminVideos, fetchCategorias, fetchCatalogoLayout, fetchCatalogoLayoutPublico, fetchColecaoVideos, fetchColecoes, fetchColecoesParaCatalogo, fetchContinuarAssistindo, fetchEpisodioInfo, fetchEpisodioVideoIds, fetchEpisodios, fetchEquipe, fetchGenerosList, fetchMySubscription, fetchPlans, fetchProfile, fetchSerieCompleta, fetchSeries, fetchTemporadas, fetchVideos, getAccessToken, getStoredUser, grantAccess, hasRuntimeConfig,
  processPayment, requestPasswordReset, revokeAccess, salvarProgresso, signIn, signUp, submitSuggestion, updatePlanActive, registrarVisualizacao, removeContinuarAssistindo, type Categoria, type Cliente, type Colecao, type ContinuarAssistindoItem, type Cupom, type Episodio, type Equipe, type Genero, type LayoutItem, type LayoutSectionConfig, type MinhaAssinatura, type Plan, type SessionUser, type Serie, type Temporada, type Video,
} from '@/lib/cinevito-client';

import { UserUploadPage } from './pages/user-upload';
import { AdminUploadsPage } from './pages/admin-uploads';
import '@/index.css';

const queryClient = new QueryClient();
const MP_PUBLIC_KEY = 'APP_USR-471c3a9b-ff0f-4743-a417-e54b9f13e902';
const CATALOG_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const MAIN_TABS = ['Início', 'Filmes', 'Séries'];

// BLINDAGEM TYPESCRIPT APLICADA AQUI (as any)
const LAYOUT_SECTION_TYPES: Array<{ value: LayoutItem['tipo']; label: string }> = [
  { value: 'hero', label: 'Início: Banner Hero (destaque rotativo no topo)' },
  { value: 'carrossel', label: 'Início: Carrossel horizontal padrão' },
  { value: 'top10', label: 'Início: Top 10 com numeração em destaque' },
  { value: 'elenco', label: 'Início: Grade por Ator/Diretor' },
  { value: 'categoria', label: 'Início: Categoria específica' },
  { value: 'ao_vivo_fileira' as any, label: 'TV: Fileira Customizada' },
];

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

function resolveVideosByIds(all: Video[], ids: string[] | undefined): Video[] {
  if (!ids || !ids.length) return [];
  const map = new Map(all.map((v) => [v.id, v]));
  return ids.map((id) => map.get(id)).filter((v): v is Video => Boolean(v));
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
  const carregar = () => {
    if (!user || !hasRuntimeConfig) { setItems([]); return; }
    fetchContinuarAssistindo().then(setItems).catch(() => setItems([]));
  };
  useEffect(() => { carregar(); }, [user?.id]);
  return { items, recarregar: carregar };
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

  if (trimmed.includes('mixdrop') || trimmed.includes('miixdrop')) {
    const mixMatch = trimmed.match(/(?:mixdrop|miixdrop)\.(?:top|to|club|co|sx|bz)\/(?:f|e|e6)\/([a-zA-Z0-9_-]+)/);
    if (mixMatch) return { type: 'embed', src: `https://mixdrop.top/e/${mixMatch[1]}` };
  }
  if (trimmed.includes('streamtape')) {
    const tapeMatch = trimmed.match(/streamtape\.com\/(?:v|e)\/([a-zA-Z0-9_-]+)/);
    if (tapeMatch) return { type: 'embed', src: `https://streamtape.com/e/${tapeMatch[1]}` };
  }
  if (trimmed.includes('playmogo') || trimmed.includes('dood')) {
    const doodMatch = trimmed.match(/(?:playmogo\.com|doodstream\.com|dood\.(?:to|watch|so|la|sh|re))\/[de]\/([a-zA-Z0-9_-]+)/);
    if (doodMatch) return { type: 'embed', src: `https://playmogo.com/e/${doodMatch[1]}` };
  }
  if (trimmed.includes('bysebuho') || trimmed.includes('byse')) {
    const byseMatch = trimmed.match(/bysebuho\.com\/[de]\/([a-zA-Z0-9_-]+)/);
    if (byseMatch) return { type: 'embed', src: `https://bysebuho.com/e/${byseMatch[1]}` };
  }

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

type PlataformaInstalacao = 'ios' | 'android' | 'desktop' | 'tv';
function detectarPlataformaInstalacao(): PlataformaInstalacao {
  const ua = navigator.userAgent.toLowerCase();
  const ehTV = /smarttv|smart-tv|googletv|appletv|hbbtv|netcast|viera|aquos|bravia|tizen|web0s|webos|crkey|roku|firetv|aft\b/i.test(ua);
  if (ehTV) return 'tv';
  const ehIpadDisfarcadoDeMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || ehIpadDisfarcadoDeMac) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function useInstallPrompt(user: SessionUser | null) {
  const [deferredEvent, setDeferredEvent] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<PlataformaInstalacao>('desktop');
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  useEffect(() => {
    function handler(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => {
    const jaInstalado = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setAlreadyInstalled(jaInstalado);
    const plataforma = detectarPlataformaInstalacao();
    setPlatform(plataforma);
    if (!user || jaInstalado || plataforma === 'tv') { setVisible(false); return; }
    if (plataforma === 'desktop') {
      const dispensadoEm = Number(localStorage.getItem('cinevito-install-dismissed-desktop') || 0);
      const janela = 14 * 24 * 60 * 60 * 1000;
      if (dispensadoEm && Date.now() - dispensadoEm < janela) { setVisible(false); return; }
    } else {
      if (sessionStorage.getItem('cinevito-install-dismissed-session')) { setVisible(false); return; }
    }
    setVisible(true);
  }, [user?.id]);
  function dismiss() {
    if (platform === 'desktop') localStorage.setItem('cinevito-install-dismissed-desktop', String(Date.now()));
    else sessionStorage.setItem('cinevito-install-dismissed-session', '1');
    setVisible(false);
  }
  async function install() {
    if (!deferredEvent) return;
    deferredEvent.prompt();
    try { await deferredEvent.userChoice; } catch { }
    setDeferredEvent(null);
    setVisible(false);
  }
  return { visible, platform, alreadyInstalled, canInstallDirectly: Boolean(deferredEvent), install, dismiss };
}

type InstallStep = { icon: typeof Share2; title: string; description: string };
function stepsForPlatform(platform: PlataformaInstalacao): InstallStep[] {
  if (platform === 'ios') {
    return [
      { icon: Share2, title: 'Toque em Compartilhar', description: 'Na barra do Safari, toque no ícone de compartilhar.' },
      { icon: Plus, title: 'Toque em "Adicionar à Tela de Início"', description: 'Role a lista de opções e toque nela.' },
      { icon: Smartphone, title: 'Toque em "Adicionar"', description: 'Confirme para adicionar o app.' },
    ];
  }
  return [
    { icon: MoreVertical, title: 'Toque no menu do navegador', description: 'Ícone de três pontinhos (⋮).' },
    { icon: Plus, title: 'Toque em "Instalar app"', description: 'Adicione à tela inicial.' },
  ];
}

function ehChromeAndroid(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  if (!/android/.test(ua)) return false;
  return /chrome\//.test(ua) && !/edg\//.test(ua) && !/opr\//.test(ua) && !/samsungbrowser\//.test(ua) && !/firefox\//.test(ua) && !/; wv\)/.test(ua);
}
function abrirNoChrome() {
  const semProtocolo = window.location.href.replace(/^https?:\/\//, '');
  window.location.href = `intent://${semProtocolo}#Intent;scheme=https;package=com.android.chrome;end`;
}

function InstallInstructionsModal({ platform, onClose }: { platform: PlataformaInstalacao; onClose: () => void }) {
  const steps = stepsForPlatform(platform);
  const mostrarBotaoChrome = platform === 'android' && !ehChromeAndroid();
  return (
    <div role="dialog" aria-modal="true" aria-label="Como instalar o CineVito" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,9,14,.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f141c', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '22px 20px 26px', boxShadow: '0 -8px 40px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clapperboard size={20} /><strong style={{ fontSize: '1.05rem' }}>Como instalar o CineVito</strong></div>
          <button onClick={onClose} className="icon-button focus-tv" aria-label="Fechar instruções"><X size={18} /></button>
        </div>
        <p className="muted" style={{ fontSize: '.83rem', marginTop: 6, marginBottom: mostrarBotaoChrome ? 12 : 20 }}>
          {platform === 'ios' ? 'Leva só alguns segundos.' : 'Seu navegador não suporta instalação direta, mas você pode salvar na tela inicial com estes passos rápidos:'}
        </p>
        {mostrarBotaoChrome && (
          <div className="notice notice-cyan" style={{ marginBottom: 20 }}><Info size={16} /><span>Você não está no Chrome. <button onClick={abrirNoChrome} style={{ background: 'none', border: 'none', textDecoration: 'underline', color: '#00c8ff', cursor: 'pointer', padding: 0, font: 'inherit' }}>Toque aqui pra abrir no Chrome</button>.</span></div>
        )}
        <div style={{ display: 'grid', gap: 16 }}>
          {steps.map((step, index) => (
            <div key={step.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(145deg, #ff8228, #2ec4b6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#0b0e14' }}><step.icon size={19} /></div>
              <div><strong style={{ fontSize: '.92rem', display: 'block' }}>{index + 1}. {step.title}</strong><span className="muted" style={{ fontSize: '.82rem', lineHeight: 1.5 }}>{step.description}</span></div>
            </div>
          ))}
        </div>
        <button className="primary-button button-wide focus-tv" style={{ marginTop: 24 }} onClick={onClose}>Entendi</button>
      </div>
    </div>
  );
}

function InstallBanner({ user }: { user: SessionUser | null }) {
  const { visible, platform, canInstallDirectly, install, dismiss } = useInstallPrompt(user);
  const [showInstructions, setShowInstructions] = useState(false);
  if (!visible) return null;
  return (
    <>
      <div style={{ width: '100%', background: '#0d121a', borderBottom: '1px solid rgba(0,200,255,.18)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', overflow: 'hidden' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(145deg, #ff8228, #2ec4b6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Download size={14} color="#0b0e14" /></div>
        <span style={{ flex: 1, minWidth: 0, fontSize: '.82rem', fontWeight: 500, color: '#dbe2ea', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Instale o CineVito na sua tela inicial</span>
        <button className="secondary-button focus-tv" style={{ padding: '6px 14px', fontSize: '.78rem', flexShrink: 0 }} onClick={canInstallDirectly ? install : () => setShowInstructions(true)}>{canInstallDirectly ? 'Instalar agora' : 'Como instalar'}</button>
        <button onClick={dismiss} aria-label="Fechar aviso de instalação" className="icon-button focus-tv" style={{ flexShrink: 0 }}><X size={16} /></button>
      </div>
      {showInstructions && <InstallInstructionsModal platform={platform} onClose={() => setShowInstructions(false)} />}
    </>
  );
}

function Brand() {
  const user = useAuth();
  return <Link href={user ? '/catalogo' : '/'} className="brand-mark focus-tv" data-testid="link-brand"><Clapperboard size={22} strokeWidth={1.8} /><span>CineVito</span></Link>;
}

const navigation = [
  { href: '/catalogo', label: 'Catálogo', icon: Film },
  { href: '/aovivo', label: 'Ao Vivo', icon: Radio },
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
    fetchProfile().then((profile) => { if (!cancelled) setIsAdmin(Boolean((profile as { is_admin?: boolean } | null)?.is_admin)); }).catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [user]);
  useEffect(() => {
    if (!user && location !== '/' && location !== '/index.html') setLocation('/');
  }, [user, location]);
  const isHome = location === '/' || location === '/index.html';
  const active = (href: string) => location === href || location === `${href}.html` || (href === '/catalogo' && location.startsWith('/player'));
  async function logout() { clearSession(); setLocation('/'); }
  if (isHome) return <>{children}</>;
  return (
    <div className="app-frame">
      <InstallBanner user={user} />
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
  useEffect(() => { if (user) setLocation('/catalogo'); }, [user]);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ nome: '', email: '', password: '', nascimento: '', codigo: '', lembrar: false });
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) { setMode('signup'); setForm((current) => ({ ...current, codigo: ref.toUpperCase() })); }
  }, []);
  function update(field: keyof typeof form, value: string | boolean) { setForm((current) => ({ ...current, [field]: value })); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice('');
    if (!form.email || !form.password || (mode === 'signup' && !form.nome)) { setError('Preencha os campos obrigatórios para continuar.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') {
        if (hasRuntimeConfig) await signIn(form.email, form.password);
        else { localStorage.setItem('cinevito-demo-user', form.email); window.dispatchEvent(new Event('cinevito-auth-change')); }
        setLocation('/catalogo');
      } else {
        if (hasRuntimeConfig) {
          const result = await signUp(form.nome, form.email, form.password, form.nascimento, form.codigo);
          if (!result.access_token) { setNotice('Conta criada. Verifique seu e-mail para confirmar o acesso.'); setMode('login'); } else setLocation('/catalogo');
        } else { localStorage.setItem('cinevito-demo-user', form.email); window.dispatchEvent(new Event('cinevito-auth-change')); setLocation('/catalogo'); }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível concluir. Tente novamente.');
    } finally { setBusy(false); }
  }
  return (
    <div className="home-shell">
      <div className="auth-layout reveal">
        <section className="auth-aside">
          <Brand />
          <div className="auth-aside-copy"><div className="eyebrow">Cinema brasileiro, do seu jeito</div><h1>Seu próximo<br /><span>filme.</span></h1><p>Um catálogo para assistir no celular, no computador ou na sala. Sem pressa, com curadoria e controle sobre a sua sessão.</p></div>
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
  const tvGradient = { '--poster': 'linear-gradient(145deg, #1e293b, #0f172a 80%)' } as CSSProperties;
  const fallbackGradient = { '--poster': 'linear-gradient(145deg, #0d596c, #172532 50%, #e58d49)' } as CSSProperties;
  const posterStyle = video.url_capa && !video.ao_vivo ? undefined : (video.ao_vivo ? tvGradient : fallbackGradient);
  const artStyle = video.url_capa ? { backgroundImage: `url(${video.url_capa})`, backgroundSize: video.ao_vivo ? '75%' : 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : undefined;
  return <article className="video-card reveal" data-testid={`card-video-${video.id}`}><div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={posterStyle}><div className="poster-art" style={artStyle}><span className="poster-meta">{video.ao_vivo ? 'AO VIVO' : (video.ano || 'CINEVITO')}</span><strong className="poster-word">{video.titulo}</strong></div>{video.premium && <span className="premium-badge">Premium</span>}<button className={`poster-favorite focus-tv ${favorite ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); onFavorite(); }} aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} data-testid={`button-favorite-${video.id}`}><Heart size={15} fill={favorite ? 'currentColor' : 'none'} /></button></div><div className="video-info"><div><h3 className="video-title" data-testid={`text-video-title-${video.id}`}>{video.titulo}</h3><p className="video-subtitle">{subtitle || video.genero || video.categoria || 'Catálogo CineVito'}</p></div><Play size={14} color="#00c8ff" /></div></article>;
}

function RankedPoster({ video, rank, favorite, onFavorite, onOpen }: { video: Video; rank: number; favorite: boolean; onFavorite: () => void; onOpen: () => void }) {
  return <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
    <span style={{ fontSize: '3.4rem', fontWeight: 900, color: 'transparent', WebkitTextStroke: '2px #00c8ff', lineHeight: 1, marginRight: -16, marginBottom: -4, zIndex: 1, userSelect: 'none' }}>{rank}</span>
    <div style={{ position: 'relative', zIndex: 2, flex: 1 }}><Poster video={video} favorite={favorite} onFavorite={onFavorite} onOpen={onOpen} /></div>
  </div>;
}

function SerieCard({ serie, onOpen }: { serie: Serie; onOpen: () => void }) {
  const style = serie.capa_url ? undefined : ({ '--poster': 'linear-gradient(145deg, #4a1942, #172532 50%, #e58d49)' } as CSSProperties);
  return <article className="video-card reveal"><div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={style}><div className="poster-art" style={serie.capa_url ? { backgroundImage: `url(${serie.capa_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><span className="poster-meta">SÉRIE</span><strong className="poster-word">{serie.titulo}</strong></div></div><div className="video-info"><div><h3 className="video-title">{serie.titulo}</h3><p className="video-subtitle">{serie.genero || 'Série · Temporadas'}</p></div><Play size={14} color="#00c8ff" /></div></article>;
}

function HeroBanner({ videos, onOpen }: { videos: Video[]; onOpen: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (videos.length < 2) return;
    const id = window.setInterval(() => setIndex((current) => (current + 1) % videos.length), 6000);
    return () => window.clearInterval(id);
  }, [videos.length]);
  if (!videos.length) return null;
  const video = videos[index % videos.length];
  return <section className="shelf" style={{ marginTop: 22 }}>
    <div role="button" tabIndex={0} onClick={() => onOpen(video.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(video.id)} className="focus-tv" style={{ aspectRatio: '16/7', borderRadius: 14, overflow: 'hidden', position: 'relative', cursor: 'pointer', background: video.url_capa ? undefined : 'linear-gradient(145deg, #0d596c, #172532 50%, #e58d49)' }}>
      {video.url_capa && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${video.url_capa})`, backgroundSize: video.ao_vivo ? 'contain' : 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', opacity: video.ao_vivo ? 0.8 : 1 }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,.8), rgba(0,0,0,.05) 65%)' }} />
      <div style={{ position: 'absolute', left: 20, bottom: 20, right: 20 }}>
        <div className="eyebrow" style={{ color: '#00c8ff' }}>Em destaque</div>
        <h2 style={{ fontSize: '1.6rem', margin: '6px 0' }}>{video.titulo}</h2>
        <p className="muted" style={{ maxWidth: 520, fontSize: '.86rem' }}>{video.descricao}</p>
        <button className="primary-button focus-tv" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); onOpen(video.id); }}><Play size={15} />Assistir agora</button>
      </div>
      {videos.length > 1 && <div style={{ position: 'absolute', right: 16, top: 16, display: 'flex', gap: 6 }}>{videos.map((_, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === index ? '#fff' : 'rgba(255,255,255,.35)' }} />)}</div>}
    </div>
  </section>;
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

function ContinueCard({ item, onOpen, onRemove }: { item: ContinuarAssistindoItem; onOpen: () => void; onRemove: () => void }) {
  const video = item.videos;
  if (!video) return null;
  const subtitle = item.series ? `${item.series.titulo}${item.numero_episodio ? ` · Ep. ${item.numero_episodio}` : ''}` : undefined;
  const style = video.url_capa ? undefined : ({ '--poster': 'linear-gradient(145deg, #0d596c, #172532 50%, #e58d49)' } as CSSProperties);
  return <article className="video-card reveal" style={{ position: 'relative' }}>
    <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ position: 'absolute', top: 6, right: 6, zIndex: 10, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', padding: 4, cursor: 'pointer', color: '#fff' }} title="Remover do histórico" aria-label="Remover">
      <X size={14} />
    </button>
    <div className="poster focus-tv" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()} style={style}>
      <div className="poster-art" style={video.url_capa ? { backgroundImage: `url(${video.url_capa})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <span className="poster-meta">CONTINUAR</span><strong className="poster-word">{item.series?.titulo || video.titulo}</strong>
      </div>
    </div>
    <div className="video-info"><div><h3 className="video-title">{item.series?.titulo || video.titulo}</h3><p className="video-subtitle">{subtitle || 'Continuar assistindo'}</p></div><Play size={14} color="#00c8ff" /></div>
  </article>;
}

// ============================================================================
// TV AO VIVO - ATUALIZADA COM O ISOLAMENTO DE CANAIS E LAYOUT CUSTOMIZADO
// ============================================================================
function LiveTVPage() {
  const [, setLocation] = useLocation();
  const user = useAuth();
  const access = useCatalogAccess(user);
  const { videos, loading, error } = useVideos();
  const layout = useCatalogLayoutPublico();
  
  const [genre, setGenre] = useState('Todos');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem('cinevito-favorites') || '[]'));

  const liveChannels = useMemo(() => videos.filter(v => v.ao_vivo), [videos]);
  const liveLayouts = useMemo(() => layout.filter(l => l.tipo === ('ao_vivo_fileira' as any) && l.visivel), [layout]);

  const videosInCustomLayouts = useMemo(() => {
    const ids = new Set<string>();
    liveLayouts.forEach(l => {
      if (l.config?.video_ids) l.config.video_ids.forEach(id => ids.add(id));
    });
    return ids;
  }, [liveLayouts]);

  const categories = useMemo(() => {
    const list = new Set(liveChannels.map(v => v.categoria || 'Canais').filter(Boolean));
    return ['Todos', ...Array.from(list)];
  }, [liveChannels]);

  const filtered = useMemo(() => liveChannels.filter((video) => {
    const text = `${video.titulo} ${video.descricao || ''} ${video.genero || ''}`.toLowerCase();
    const selectedCategory = normalizeCatalogLabel(genre);
    const videoCategory = normalizeCatalogLabel(video.categoria || 'Canais');
    const matchesSearch = !query || text.includes(query.toLowerCase());
    return matchesSearch && (genre === 'Todos' || videoCategory === selectedCategory);
  }), [liveChannels, query, genre]);

  const autoCategories = useMemo(() => {
    const groups: Record<string, Video[]> = {};
    liveChannels.forEach(v => {
      if (videosInCustomLayouts.has(v.id)) return; 
      const cat = v.categoria || 'Outros Canais';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(v);
    });
    return groups;
  }, [liveChannels, videosInCustomLayouts]);

  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
  }
  function openVideo(id: string) { setLocation(access ? `/player/${id}` : '/assinatura'); }

  return <div className="content-wrap page-main">
    <PageHeader eyebrow="Programação 24h" title="TV Ao Vivo" description="Canais de esportes, notícias e entretenimento rodando sem parar." />
    {!user && <div className="notice notice-orange"><CircleAlert size={17} color="#ff8228" /><span><strong>Você está navegando como visitante.</strong> Entre para salvar canais favoritos.</span><Link href="/" className="quiet-button focus-tv">Entrar</Link></div>}
    {user && access === false && <div className="notice notice-orange"><CircleAlert size={17} color="#ff8228" /><span><strong>Seu acesso gratuito acabou.</strong> Assine um plano para continuar assistindo.</span><Link href="/assinatura" className="quiet-button focus-tv">Ver planos</Link></div>}
    
    <div className="catalog-toolbar"><div className="search-wrap"><Search size={16} /><input className="input focus-tv" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar canal..." aria-label="Buscar canal" /></div></div>
    
    {categories.length > 1 && <div className="chip-row horizontal-scroll" aria-label="Filtrar por categoria">
      {categories.map((item) => <button key={item} className={`chip focus-tv ${genre === item ? 'active' : ''}`} onClick={() => setGenre(item)}>{item}</button>)}
    </div>}
    
    {loading && <div className="video-grid" style={{ marginTop: 22 }}>{Array.from({ length: 5 }).map((_, index) => <div className="skeleton" style={{ aspectRatio: '2/3' }} key={index} />)}</div>}
    {error && <div className="notice notice-orange" role="alert" style={{ marginTop: 22 }}><CircleAlert size={17} color="#ff8275" /><span>{error}</span><button className="quiet-button focus-tv" onClick={() => window.location.reload()}><RefreshCw size={15} />Tentar de novo</button></div>}
    
    {!loading && !error && <div style={{ marginTop: 22 }}>
      {query || genre !== 'Todos' ? (
        <section className="shelf">
          <div className="shelf-heading"><h2 className="section-title">{query ? 'Resultados' : genre}</h2><div className="section-rule" /><span>{filtered.length.toString().padStart(2, '0')} canais</span></div>
          {filtered.length ? <div className="video-grid">{filtered.map((video) => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} subtitle="Transmissão ao vivo" />)}</div> : <div className="empty-state"><Radio size={25} /><h3>Nenhum canal encontrado</h3></div>}
        </section>
      ) : (
        <>
          {liveLayouts.map(item => {
            const rowVideos = resolveVideosByIds(liveChannels, item.config?.video_ids);
            if (!rowVideos.length) return null;
            return (
              <section className="shelf" key={item.id} style={{ marginBottom: 36 }}>
                <div className="shelf-heading"><h2 className="section-title">{item.titulo || 'Canais em Destaque'}</h2><div className="section-rule" /></div>
                <div className="video-grid horizontal-scroll">
                  {rowVideos.map(video => <div key={video.id} style={{ width: 160 }}><Poster video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} subtitle="Transmissão ao vivo" /></div>)}
                </div>
              </section>
            );
          })}
          {Object.entries(autoCategories).sort((a, b) => a[0].localeCompare(b[0])).map(([catName, vids]) => (
            <section className="shelf" key={catName} style={{ marginBottom: 36 }}>
              <div className="shelf-heading"><h2 className="section-title">{catName}</h2><div className="section-rule" /></div>
              <div className="video-grid horizontal-scroll">
                {vids.map(video => <div key={video.id} style={{ width: 160 }}><Poster video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} subtitle="Transmissão ao vivo" /></div>)}
              </div>
            </section>
          ))}
          {!liveLayouts.length && Object.keys(autoCategories).length === 0 && <div className="empty-state"><Radio size={25} /><h3>Nenhum canal cadastrado</h3></div>}
        </>
      )}
    </div>}
  </div>;
}

// ============================================================================
// CATÁLOGO PRINCIPAL (Padrão Nível Premium)
// ============================================================================
function CatalogPage() {
  const [, setLocation] = useLocation();
  const user = useAuth();
  const access = useCatalogAccess(user);
  const { videos, loading, error } = useVideos();
  const colecoes = useColecoesDoCatalogo();
  const series = useSeriesDoCatalogo();
  const layout = useCatalogLayoutPublico();
  const episodioVideoIds = useEpisodioVideoIds();
  const { items: continuarAssistindo, recarregar: recarregarContinuar } = useContinuarAssistindo(user);
  
  const [shelf, setShelf] = useState('Início');
  const [genre, setGenre] = useState('Por Gênero');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem('cinevito-favorites') || '[]'));

  const catalogVideos = useMemo(() => videos.filter(v => !v.ao_vivo && !episodioVideoIds.has(v.id)), [videos, episodioVideoIds]);

  const movieGenres = useMemo(() => {
    const list = new Set<string>();
    catalogVideos.forEach(v => { 
      if (v.genero) v.genero.split(',').forEach(g => list.add(g.trim())); 
      if (v.categoria) list.add(v.categoria.trim());
    });
    return Array.from(list).sort();
  }, [catalogVideos]);

  const seriesGenres = useMemo(() => {
    const list = new Set<string>();
    series.forEach(s => { 
      if (s.genero) s.genero.split(',').forEach(g => list.add(g.trim()));
    });
    return Array.from(list).sort();
  }, [series]);

  const currentGenres = shelf === 'Séries' ? seriesGenres : movieGenres;
  const genreChips = ['Por Gênero', 'Todos', ...currentGenres];
  
  const filteredVideos = useMemo(() => catalogVideos.filter((video) => {
    const text = `${video.titulo} ${video.descricao || ''} ${video.genero || ''} ${video.categoria || ''}`.toLowerCase();
    const matchesSearch = !query || text.includes(query.toLowerCase());
    if (query) return matchesSearch;
    if (genre === 'Por Gênero' || genre === 'Todos') return true;
    return (video.genero && normalizeCatalogLabel(video.genero).includes(normalizeCatalogLabel(genre))) || 
           (video.categoria && normalizeCatalogLabel(video.categoria).includes(normalizeCatalogLabel(genre)));
  }), [catalogVideos, query, genre]);

  const filteredSeries = useMemo(() => series.filter((serie) => {
    const text = `${serie.titulo} ${serie.descricao || ''} ${serie.genero || ''}`.toLowerCase();
    const matchesSearch = !query || text.includes(query.toLowerCase());
    if (query) return matchesSearch;
    if (genre === 'Por Gênero' || genre === 'Todos') return true;
    return serie.genero && normalizeCatalogLabel(serie.genero).includes(normalizeCatalogLabel(genre));
  }), [series, query, genre]);
  
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
  }
  function openVideo(id: string) { setLocation(access ? `/player/${id}` : '/assinatura'); }
  
  async function handleRemoveContinuar(id: string) {
    await removeContinuarAssistindo(id);
    recarregarContinuar();
  }

  function renderHeroSection(item: LayoutItem, key: string) {
    const heroVideos = resolveVideosByIds(videos, item.config?.video_ids);
    if (!heroVideos.length) return null;
    return <HeroBanner key={key} videos={heroVideos} onOpen={openVideo} />;
  }
  
  function renderCarrosselSection(item: LayoutItem, key: string) {
    const secaoVideos = resolveVideosByIds(videos, item.config?.video_ids);
    if (!secaoVideos.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{item.titulo || 'Carrossel'}</h2><div className="section-rule" /></div>
      <div className="video-grid horizontal-scroll">
        {secaoVideos.map((video) => <div key={video.id} style={{ width: 160 }}><Poster video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} /></div>)}
      </div>
    </section>;
  }

  function renderTop10Section(item: LayoutItem, key: string) {
    const secaoVideos = resolveVideosByIds(videos, item.config?.video_ids).slice(0, 10);
    if (!secaoVideos.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{item.titulo || 'Top 10'}</h2><div className="section-rule" /></div>
      <div className="video-grid horizontal-scroll" style={{ paddingLeft: 16 }}>
        {secaoVideos.map((video, index) => <div key={video.id} style={{ width: 160 }}><RankedPoster video={video} rank={index + 1} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} /></div>)}
      </div>
    </section>;
  }

  function renderElencoSection(item: LayoutItem, key: string) {
    const nomeAlvo = normalizeCatalogLabel(item.config?.nome);
    if (!nomeAlvo) return null;
    const secaoVideos = videos.filter((video) => normalizeCatalogLabel(video.elenco).includes(nomeAlvo));
    if (!secaoVideos.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{item.titulo || `Coleção ${item.config?.nome}`}</h2><div className="section-rule" /></div>
      <div className="video-grid horizontal-scroll">
        {secaoVideos.map((video) => <div key={video.id} style={{ width: 160 }}><Poster video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} /></div>)}
      </div>
    </section>;
  }

  function renderCategoriaSection(item: LayoutItem, key: string) {
    const valorAlvo = normalizeCatalogLabel(item.config?.valor);
    if (!valorAlvo) return null;
    const secaoVideos = videos.filter((video) => !episodioVideoIds.has(video.id) && (normalizeCatalogLabel(video.categoria).includes(valorAlvo) || normalizeCatalogLabel(video.genero).includes(valorAlvo)));
    if (!secaoVideos.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{item.titulo || item.config?.valor}</h2><div className="section-rule" /></div>
      <div className="video-grid horizontal-scroll">
        {secaoVideos.map((video) => <div key={video.id} style={{ width: 160 }}><Poster video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} /></div>)}
      </div>
    </section>;
  }

  function renderColecaoSection(colecaoId: string, key: string) {
    const found = colecoes.find((c) => c.colecao.id === colecaoId);
    if (!found || !found.videos.length) return null;
    return <section className="shelf" key={key} style={{ marginTop: 22 }}>
      <div className="shelf-heading"><h2 className="section-title">{found.colecao.titulo}</h2><div className="section-rule" /></div>
      <div className="video-grid horizontal-scroll">
        {found.videos.map((video) => <div key={video.id} style={{ width: 160 }}><Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} /></div>)}
      </div>
    </section>;
  }

  function renderSearchResults() {
    return (
      <>
        {filteredVideos.length > 0 && (
          <section className="shelf" style={{ marginTop: 22 }}>
            <div className="shelf-heading"><h2 className="section-title">Filmes encontrados</h2><div className="section-rule" /></div>
            <div className="video-grid">{filteredVideos.map(video => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />)}</div>
          </section>
        )}
        {filteredSeries.length > 0 && (
          <section className="shelf" style={{ marginTop: 22 }}>
            <div className="shelf-heading"><h2 className="section-title">Séries encontradas</h2><div className="section-rule" /></div>
            <div className="video-grid">{filteredSeries.map(serie => <SerieCard key={serie.id} serie={serie} onOpen={() => setLocation(`/serie/${serie.id}`)} />)}</div>
          </section>
        )}
        {filteredVideos.length === 0 && filteredSeries.length === 0 && (
          <div className="empty-state"><Search size={25} /><h3>Nenhum resultado encontrado</h3><button className="quiet-button focus-tv" onClick={() => setQuery('')}>Limpar busca</button></div>
        )}
      </>
    );
  }

  function renderFilmes() {
    if (genre === 'Todos' || (genre !== 'Por Gênero' && genre !== 'Todos')) {
      return (
        <section className="shelf" style={{ marginTop: 22 }}>
          <div className="shelf-heading"><h2 className="section-title">{genre === 'Todos' ? 'Todos os Filmes' : genre}</h2><div className="section-rule" /><span>{filteredVideos.length.toString().padStart(2, '0')} títulos</span></div>
          {filteredVideos.length ? <div className="video-grid">{filteredVideos.map(video => <Poster key={video.id} video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />)}</div> : <div className="empty-state"><Film size={25} /><h3>Nenhum filme nesta categoria</h3></div>}
        </section>
      );
    }

    const grouped: Record<string, Video[]> = {};
    filteredVideos.forEach(v => {
      const gList = v.genero ? v.genero.split(',').map(s=>s.trim()) : (v.categoria ? [v.categoria.trim()] : ['Sem Gênero']);
      gList.forEach(g => {
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(v);
      });
    });

    return (
      <>
        {Object.entries(grouped).sort((a,b) => a[0].localeCompare(b[0])).map(([gName, vids]) => (
          <section className="shelf" key={gName} style={{ marginTop: 22 }}>
            <div className="shelf-heading">
              <h2 className="section-title">{gName}</h2>
              <div className="section-rule" />
              {vids.length > 6 && <button className="quiet-button focus-tv" onClick={() => setGenre(gName)}>Ver todos</button>}
            </div>
            <div className="video-grid horizontal-scroll">
              {vids.slice(0, 15).map(video => (
                <div key={video.id} style={{ width: 160 }}>
                  <Poster video={video} favorite={favorites.includes(video.id)} onFavorite={() => toggleFavorite(video.id)} onOpen={() => openVideo(video.id)} />
                </div>
              ))}
            </div>
          </section>
        ))}
        {Object.keys(grouped).length === 0 && <div className="empty-state"><Film size={25} /><h3>Nenhum filme cadastrado</h3></div>}
      </>
    );
  }

  function renderSeries() {
    if (genre === 'Todos' || (genre !== 'Por Gênero' && genre !== 'Todos')) {
      return (
        <section className="shelf" style={{ marginTop: 22 }}>
          <div className="shelf-heading"><h2 className="section-title">{genre === 'Todos' ? 'Todas as Séries' : genre}</h2><div className="section-rule" /><span>{filteredSeries.length.toString().padStart(2, '0')} títulos</span></div>
          {filteredSeries.length ? <div className="video-grid">{filteredSeries.map(serie => <SerieCard key={serie.id} serie={serie} onOpen={() => setLocation(`/serie/${serie.id}`)} />)}</div> : <div className="empty-state"><Film size={25} /><h3>Nenhuma série nesta categoria</h3></div>}
        </section>
      );
    }

    const grouped: Record<string, Serie[]> = {};
    filteredSeries.forEach(s => {
      const gList = s.genero ? s.genero.split(',').map(str=>str.trim()) : ['Sem Gênero'];
      gList.forEach(g => {
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(s);
      });
    });

    return (
      <>
        {Object.entries(grouped).sort((a,b) => a[0].localeCompare(b[0])).map(([gName, sList]) => (
          <section className="shelf" key={gName} style={{ marginTop: 22 }}>
            <div className="shelf-heading">
              <h2 className="section-title">{gName}</h2>
              <div className="section-rule" />
              {sList.length > 6 && <button className="quiet-button focus-tv" onClick={() => setGenre(gName)}>Ver todas</button>}
            </div>
            <div className="video-grid horizontal-scroll">
              {sList.slice(0, 15).map(serie => (
                <div key={serie.id} style={{ width: 160 }}>
                  <SerieCard serie={serie} onOpen={() => setLocation(`/serie/${serie.id}`)} />
                </div>
              ))}
            </div>
          </section>
        ))}
        {Object.keys(grouped).length === 0 && <div className="empty-state"><Film size={25} /><h3>Nenhuma série cadastrada</h3></div>}
      </>
    );
  }

  return <div className="content-wrap page-main">
    <PageHeader eyebrow="A sua sala de cinema" title={`Olá, ${titleCaseName(user)}.`} description="Escolha algo para assistir. O catálogo se adapta à sua tela, do celular à Smart TV." action={<Link href="/assinatura" className="primary-button focus-tv" data-testid="link-subscription"><Sparkles size={16} />Ver planos</Link>} />
    {!hasRuntimeConfig && <div className="notice notice-cyan" data-testid="status-runtime-demo"><Info size={17} color="#00c8ff" /><span><strong>Modo de demonstração.</strong> O ambiente ainda não está conectado ao Supabase; os dados desta sessão ficam apenas neste aparelho.</span></div>}
    {!user && <div className="notice notice-orange" data-testid="status-catalog-auth"><CircleAlert size={17} color="#ff8228" /><span><strong>Você está navegando como visitante.</strong> Entre para salvar favoritos e continuar assistindo em outros dispositivos.</span><Link href="/" className="quiet-button focus-tv" data-testid="link-catalog-login">Entrar</Link></div>}
    {user && access === false && <div className="notice notice-orange" data-testid="status-catalog-locked"><CircleAlert size={17} color="#ff8228" /><span><strong>Seu acesso gratuito acabou.</strong> Assine um plano para continuar assistindo ao catálogo completo.</span><Link href="/assinatura" className="quiet-button focus-tv">Ver planos</Link></div>}
    
    <div className="catalog-toolbar"><div className="search-wrap"><Search size={16} /><input className="input focus-tv" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no catálogo" aria-label="Buscar no catálogo" data-testid="input-search-catalog" /></div><Link href="/colecao" className="secondary-button focus-tv" data-testid="link-open-collection"><Heart size={15} />Minha coleção</Link></div>
    
    {/* MENU SUPERIOR PREMIUM: Início, Filmes, Séries */}
    <div className="chip-row horizontal-scroll" role="tablist">
      {MAIN_TABS.map((item) => <button key={item} className={`chip focus-tv ${shelf === item ? 'active' : ''}`} onClick={() => { setShelf(item); setGenre('Por Gênero'); setQuery(''); }} role="tab" aria-selected={shelf === item}>{item}</button>)}
    </div>
    
    {/* BARRA DE GÊNEROS */}
    {!query && shelf !== 'Início' && (
      <div className="chip-row horizontal-scroll" aria-label="Filtrar por gênero">
        {genreChips.map((item) => <button key={item} className={`chip focus-tv ${genre === item ? 'active' : ''}`} onClick={() => setGenre(item)}>{item}</button>)}
      </div>
    )}
    
    {loading && <div className="video-grid" data-testid="status-catalog-loading">{Array.from({ length: 5 }).map((_, index) => <div className="skeleton" style={{ aspectRatio: '2/3' }} key={index} />)}</div>}
    {error && <div className="notice notice-orange" role="alert" data-testid="status-catalog-error"><CircleAlert size={17} color="#ff8275" /><span>{error}</span><button className="quiet-button focus-tv" onClick={() => window.location.reload()} data-testid="button-retry-catalog"><RefreshCw size={15} />Tentar de novo</button></div>}
    
    {!loading && !error && (
      <>
        {query ? (
          renderSearchResults()
        ) : shelf === 'Filmes' ? (
          renderFilmes()
        ) : shelf === 'Séries' ? (
          renderSeries()
        ) : (
          /* ABA INÍCIO (Layout CMS e Continuar Assistindo) */
          <>
            {continuarAssistindo.length > 0 && <section className="shelf" style={{ marginTop: 22 }}>
              <div className="shelf-heading"><h2 className="section-title">Continuar assistindo</h2><div className="section-rule" /></div>
              <div className="video-grid horizontal-scroll">
                {continuarAssistindo.filter((item) => item.videos).map((item) => <div key={item.id} style={{ width: 160 }}><ContinueCard item={item} onOpen={() => openVideo(item.video_id)} onRemove={() => handleRemoveContinuar(item.id)} /></div>)}
              </div>
            </section>}
            
            {layout.length > 0 ? (
              layout.map((item) => {
                if (item.tipo === ('ao_vivo_fileira' as any)) return null;
                if (item.tipo === 'series') return <div key={item.id}>{renderSeries()}</div>; 
                if (item.tipo === 'colecao' && item.colecao_id) return renderColecaoSection(item.colecao_id, item.id);
                if (item.tipo === 'catalogo_geral') return <div key={item.id}>{renderFilmes()}</div>;
                if (item.tipo === 'hero') return renderHeroSection(item, item.id);
                if (item.tipo === 'carrossel') return renderCarrosselSection(item, item.id);
                if (item.tipo === 'top10') return renderTop10Section(item, item.id);
                if (item.tipo === 'elenco') return renderElencoSection(item, item.id);
                if (item.tipo === 'categoria') return renderCategoriaSection(item, item.id);
                return null;
              })
            ) : (
              // Se o admin não criou layout nenhum
              <>
                {colecoes.map((c) => renderColecaoSection(c.colecao.id, c.colecao.id))}
              </>
            )}
          </>
        )}
      </>
    )}
  </div>;
}

function VideoPlayer({ embed, title }: { embed: { type: string, src: string }, title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hlsReady, setHlsReady] = useState(!!(window as any).Hls);

  useEffect(() => {
    if ((window as any).Hls) { setHlsReady(true); return; }
    const scriptId = 'hls-js-library';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
    const onScriptLoad = () => setHlsReady(true);
    script.addEventListener('load', onScriptLoad);
    return () => script.removeEventListener('load', onScriptLoad);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || embed.type !== 'file' || !embed.src) return;

    let hls: any = null;
    const isM3U8 = embed.src.toLowerCase().includes('.m3u8');

    if (!isM3U8) { video.src = embed.src; video.play().catch(() => {}); return; }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = embed.src;
      video.play().catch(() => console.log('Autoplay retido pelo iOS.'));
    } 
    else if (hlsReady && (window as any).Hls) {
      const Hls = (window as any).Hls;
      if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hls.loadSource(embed.src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
        hls.on(Hls.Events.ERROR, (event: any, data: any) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else hls.destroy();
          }
        });
      }
    }
    return () => { if (hls) hls.destroy(); video.removeAttribute('src'); video.load(); };
  }, [embed.src, embed.type, hlsReady]);

  if (embed.type === 'embed') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* ESCUDO TOPO: Bloqueia links de direcionamento e título */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60px', zIndex: 10 }} title="Cabeçalho protegido" />
        
        {/* ESCUDO INFERIOR: Bloqueia o Musem, Share e Embed. Deixa os 3 botões livres (Engrenagem, PiP e Tela Cheia). */}
        <div style={{ position: 'absolute', bottom: 0, right: '135px', width: '140px', height: '50px', zIndex: 10 }} title="Controles protegidos" />
        
        <iframe src={embed.src} title={title} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} data-testid="video-player" />
      </div>
    );
  }

  if (embed.type === 'file') {
    return <video ref={videoRef} controls autoPlay muted playsInline poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-testid="video-player" style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />;
  }

  return <div className="player-idle"><Play size={38} /><strong>Pronto para assistir</strong><span>Este título ainda não tem um link de vídeo cadastrado.</span></div>;
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
  }, [access, setLocation]);

  const video = findVideo(videos, params.id || new URLSearchParams(window.location.search).get('id') || '');
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('cinevito-favorites') || '[]').includes(video?.id));
  const [episodioInfo, setEpisodioInfo] = useState<{ episodio: Episodio; serieId: string; proximo?: Episodio } | null>(null);
  const [episodiosDaTemporada, setEpisodiosDaTemporada] = useState<Episodio[]>([]);

  useEffect(() => {
    if (!video || access !== true) return;
    let cancelled = false;
    
    // GATILHO INDEPENDENTE: Salva a View e o Histórico de filmes na mesma hora
    registrarVisualizacao(video.id).catch(() => {});
    if (user && !video.ao_vivo) {
      salvarProgresso({ video_id: video.id }).catch(() => {});
    }

    (async () => {
      try {
        const info = await fetchEpisodioInfo(video.id);
        if (cancelled) return;
        if (info) {
          setEpisodioInfo(info);
          const lista = await fetchEpisodios(info.episodio.temporada_id);
          if (!cancelled) setEpisodiosDaTemporada(lista);
          // Se for série, atualiza o histórico para incluir os dados extras da temporada
          if (user) {
            salvarProgresso({ video_id: video.id, serie_id: info.serieId, temporada_id: info.episodio.temporada_id, numero_episodio: info.episodio.numero }).catch(() => {});
          }
        } else {
          setEpisodioInfo(null);
          setEpisodiosDaTemporada([]);
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [video?.id, access, user?.id]);

  function toggle() {
    if (!video) return;
    const current: string[] = JSON.parse(localStorage.getItem('cinevito-favorites') || '[]');
    const next = current.includes(video.id) ? current.filter((id) => id !== video.id) : [...current, video.id];
    localStorage.setItem('cinevito-favorites', JSON.stringify(next));
    setSaved(!saved);
  }

  const embed = getEmbedInfo(video?.url_video);

  if (loading || access === null || access === false) return <div className="content-wrap page-main"><div className="skeleton" style={{ aspectRatio: '16/9' }} /></div>;
  if (!video) return <div className="content-wrap page-main"><div className="empty-state"><CircleAlert size={26} /><h3>Vídeo não encontrado</h3><p>Esse título não está mais disponível no catálogo.</p><Link href="/catalogo" className="primary-button focus-tv">Voltar ao catálogo</Link></div></div>;
  
  // SOLUÇÃO DO TAMANHO DA TELA AO VIVO: Controla a altura do player.
  // Se for ao vivo, o playerStage.height continua o mesmo padrão dos filmes em vez de forçar 100vh.
  return <div className="content-wrap page-main">
    <button className="quiet-button focus-tv" onClick={() => setLocation('/catalogo')} data-testid="button-back-catalog"><ArrowLeft size={16} />Voltar ao catálogo</button>
    <div className="player-stage" style={{ marginTop: 17 }}>
      <div className="player-box">
        <VideoPlayer embed={embed} title={video.titulo} />
      </div>
      <div className="player-details">
        <div>
          <div className="eyebrow">{video.genero || video.categoria || 'CineVito'} {video.ano ? ` / ${video.ano}` : ''}{episodioInfo ? ` · Ep. ${episodioInfo.episodio.numero}` : ''}</div>
          <h1 className="section-title" style={{ marginTop: 7 }} data-testid="text-player-title">{video.titulo}</h1>
          <p>{video.descricao || 'Este título faz parte do catálogo CineVito.'}</p>
        </div>
        <div className="player-actions">
          <button className={`secondary-button focus-tv ${saved ? 'active' : ''}`} onClick={toggle} data-testid="button-player-favorite"><Heart size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Na coleção' : 'Salvar'}</button>
          {episodioInfo?.proximo && <button className="primary-button focus-tv" onClick={() => setLocation(`/player/${episodioInfo.proximo!.video_id}`)}>Próximo episódio<ChevronRight size={16} /></button>}
        </div>
      </div>
      {episodiosDaTemporada.length > 1 && <div style={{ marginTop: 20 }}>
        <h3 className="section-title" style={{ fontSize: '1rem' }}>Episódios desta temporada</h3>
        <div className="admin-list" style={{ marginTop: 10 }}>{episodiosDaTemporada.map((ep) => <div key={ep.id} role="button" tabIndex={0} onClick={() => setLocation(`/player/${ep.video_id}`)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLocation(`/player/${ep.video_id}`)} className="result-row" style={{ cursor: 'pointer', border: ep.video_id === video.id ? '1px solid var(--accent-teal, #2ec4b6)' : undefined }}>
          <span><strong>Ep. {ep.numero}</strong> — {ep.titulo || ep.videos?.titulo}</span>
          {ep.video_id === video.id ? <span className="muted" style={{ fontSize: '.78rem' }}>Assistindo</span> : <Play size={15} color="#00c8ff" />}
        </div>)}</div>
      </div>}
    </div>
  </div>;
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
  function openEpisodio(videoId: string) { setLocation(access ? `/player/${videoId}` : '/assinatura'); }
  if (!data) return <div className="content-wrap page-main"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!data.serie) return <div className="content-wrap page-main"><div className="empty-state"><CircleAlert size={26} /><h3>Série não encontrada</h3><Link href="/catalogo" className="primary-button focus-tv" style={{ marginTop: 12 }}>Voltar ao catálogo</Link></div></div>;
  const atual = data.temporadas[activeTemporada];
  return <div className="content-wrap page-main">
    <button className="quiet-button focus-tv" onClick={() => setLocation('/catalogo')}><ArrowLeft size={16} />Voltar ao catálogo</button>
    <PageHeader eyebrow="Série" title={data.serie.titulo} description={data.serie.descricao || undefined} />
    {data.temporadas.length > 0 && <div className="chip-row horizontal-scroll" role="tablist">{data.temporadas.map((item, index) => <button key={item.temporada.id} className={'chip focus-tv ' + (activeTemporada === index ? 'active' : '')} onClick={() => setActiveTemporada(index)} role="tab" aria-selected={activeTemporada === index}>{item.temporada.titulo || `Temporada ${item.temporada.numero}`}</button>)}</div>}
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
  function openVideo(id: string) { setLocation(access ? `/player/${id}` : '/assinatura'); }
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
  const installState = useInstallPrompt(user);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
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
  return <div className="content-wrap page-main">
    <PageHeader eyebrow="Sua conta" title="Perfil" description="Gerencie seus dados, sua assinatura e o acesso do CineVito." />
    <div className="two-col">
      <section className="panel panel-pad">
        <div className="profile-hero"><div className="profile-avatar">{initials(user)}</div><div><h1>{name}</h1><p data-testid="text-profile-email">{profile?.email || user?.email || 'Sessão local'}</p></div></div>
        <div className="status-card" data-testid="status-profile-subscription">
          <h3>Acesso ao CineVito</h3>
          {subscription ? <><p><strong>{subscription.plano || 'Plano'}</strong> · {status}</p><p className="muted" style={{ fontSize: '.8rem' }}>{origem}</p>{subscription.data_expiracao && <p className="muted" style={{ fontSize: '.8rem' }}>Válido até {new Date(subscription.data_expiracao).toLocaleDateString('pt-BR')}</p>}</> : <p>{user ? 'Você ainda não tem nenhuma assinatura registrada.' : 'Entre para consultar sua assinatura.'}</p>}
          <Link href="/assinatura" className="primary-button focus-tv" style={{ width: 'fit-content', marginTop: 7 }} data-testid="link-profile-subscription">Ver assinatura</Link>
        </div>
        <div className="status-card" style={{ marginTop: 14 }}>
          <h3>Envie seus vídeos</h3>
          <p className="muted" style={{ fontSize: '.8rem' }}>Quer enviar um filme ou curta para o CineVito? Faça sua submissão por aqui.</p>
          <Link href="/upload" className="primary-button focus-tv" style={{ width: 'fit-content', marginTop: 7, display: 'inline-flex', textDecoration: 'none', alignItems: 'center', justifyContent: 'center' }}>Enviar novo vídeo</Link>
        </div>
        {installState.platform !== 'tv' && !installState.alreadyInstalled && <div className="status-card" style={{ marginTop: 14 }}>
          <h3>Instalar o app</h3>
          <p className="muted" style={{ fontSize: '.8rem' }}>Adicione o CineVito à tela do seu aparelho pra abrir direto, como um app.</p>
          <button className="primary-button focus-tv" style={{ width: 'fit-content', marginTop: 7 }} onClick={installState.canInstallDirectly ? installState.install : () => setShowInstallInstructions(true)}>
            <Download size={15} />{installState.canInstallDirectly ? 'Instalar CineVito' : 'Como instalar'}
          </button>
        </div>}
        {showInstallInstructions && <InstallInstructionsModal platform={installState.platform} onClose={() => setShowInstallInstructions(false)} />}
      </section>
      <section className="panel panel-pad">
        <h2 className="panel-title">Seu código de indicação</h2>
        {profile?.codigo_indicacao ? <><p className="muted" style={{ fontSize: '.8rem', lineHeight: 1.5 }}>Compartilhe o link. A indicação só é confirmada depois que a pessoa fizer um pagamento.</p><div className="code-box"><code data-testid="text-referral-code">{profile.codigo_indicacao}</code><button className="icon-button focus-tv" onClick={copyReferral} aria-label="Copiar link de indicação" data-testid="button-copy-referral">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><p className="muted" style={{ fontSize: '.72rem', marginBottom: 0 }}>{copied ? 'Link copiado.' : 'Seu código continua válido.'}</p></> : <div className="notice notice-cyan"><Info size={16} /><span>Seu código aparece aqui depois do primeiro pagamento aprovado.</span></div>}
      </section>
    </div>
  </div>;
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
    if (brickRef.current) { try { brickRef.current.unmount(); } catch { } brickRef.current = null; }
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
          initialization: { amount: Number(selectedPlan.preco) || 0, payer: { email: user.email || '' } },
          customization: { paymentMethods: { creditCard: 'all', debitCard: 'all', bankTransfer: 'all' } },
          callbacks: {
            onReady: () => { if (!cancelled) setCheckoutStatus('ready'); },
            onError: () => { if (!cancelled) { setCheckoutStatus('error'); setCheckoutMessage('Não foi possível carregar o checkout.'); } },
            onSubmit: ({ formData }: { formData: unknown }) => new Promise<void>((resolve, reject) => {
              setCheckoutStatus('submitting'); setCheckoutMessage('');
              processPayment({ usuario_id: user.id, plano_id: selectedPlan.id, formData, cupom: cupom.trim() || null })
                .then((result) => {
                  if (result.status === 'approved') { setCheckoutStatus('approved'); setCheckoutMessage('Pagamento aprovado! Sua assinatura já está ativa.'); }
                  else if (result.status === 'pending') { setCheckoutStatus('pending'); setPix({ copiaCola: result.pix_copia_cola, qrBase64: result.pix_qr_base64 }); setCheckoutMessage('Pagamento em análise.'); }
                  else { setCheckoutStatus('rejected'); setCheckoutMessage(result.motivo || 'Pagamento recusado.'); }
                  resolve();
                })
                .catch((error) => { setCheckoutStatus('error'); setCheckoutMessage(error instanceof Error ? error.message : 'Não foi possível processar o pagamento.'); reject(error); });
            }),
          },
        });
        if (cancelled) { brick.unmount(); return; }
        brickRef.current = brick;
      } catch (error) {
        if (!cancelled) { setCheckoutStatus('error'); setCheckoutMessage(error instanceof Error ? error.message : 'Não foi possível carregar o checkout.'); }
      }
    })();

    return () => { cancelled = true; if (brickRef.current) { try { brickRef.current.unmount(); } catch { } brickRef.current = null; } };
  }, [selectedPlan?.id, user?.id]);

  return <div className="content-wrap page-main"><PageHeader eyebrow="Escolha o seu acesso" title="Assine o CineVito" description="Assista ao catálogo completo em seus dispositivos." /><div className="two-col"><section className="panel panel-pad"><h2 className="panel-title">Planos disponíveis</h2>{loading ? <div className="plan-list">{[1, 2].map((n) => <div className="skeleton" style={{ height: 94 }} key={n} />)}</div> : plans.length ? <><div className="chip-row horizontal-scroll" role="tablist">{categories.map((item) => <button key={item} className={'chip focus-tv ' + (category === item ? 'active' : '')} onClick={() => { setCategory(item); setSelected(''); }} role="tab" aria-selected={category === item}>{item}</button>)}</div><div className="plan-list">{visiblePlans.map((plan) => <div className={'plan-card ' + (selected === plan.id ? 'selected' : '')} key={plan.id} onClick={() => setSelected(plan.id)}><div><h3>{plan.nome}</h3><p>{plan.descricao || ((plan.dispositivos || 1) + ' dispositivo(s) · ' + duration(plan))}</p></div><div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}><strong className="plan-price">{typeof plan.preco === 'number' ? 'R$ ' + plan.preco.toFixed(2).replace('.', ',') : 'Consultar'}</strong><button className="primary-button focus-tv" onClick={(event) => { event.stopPropagation(); setSelected(plan.id); }} data-testid={'button-select-plan-' + plan.id}>{selected === plan.id ? 'Selecionado' : 'Escolher'}</button></div></div>)}</div></> : <div className="empty-state"><Settings size={24} /><h3>Planos em configuração</h3><p>Quando os planos estiverem publicados, eles aparecerão aqui.</p></div>}</section><aside className="panel panel-pad"><div className="eyebrow">Pagamento seguro</div><h2 className="panel-title" style={{ marginTop: 9 }}>Checkout protegido</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.65 }}>Pagamento seguro direto pelo CineVito.</p>
    {!user && <div className="notice notice-orange" style={{ marginTop: 16 }}><Info size={16} color="#ff8228" /><span>Entre na sua conta para continuar.</span><Link href="/" className="quiet-button focus-tv">Entrar</Link></div>}
    {user && !selectedPlan && <div className="notice notice-orange" style={{ marginTop: 16 }}><Info size={16} color="#ff8228" /><span>Selecione um plano para continuar.</span></div>}
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
    setState('loading'); setErrorMessage('');
    try {
      if (hasRuntimeConfig) await submitSuggestion({ titulo: form.titulo.trim(), genero: form.genero.trim() || undefined, ano_lancamento: form.ano ? Number(form.ano) : undefined });
      else localStorage.setItem('cinevito-last-suggestion', JSON.stringify(form));
      setState('success'); setForm({ titulo: '', genero: '', ano: '' });
    } catch (error) {
      setState('error'); setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar agora.');
    }
  }
  return <div className="content-wrap page-main"><PageHeader eyebrow="Ajude a curadoria" title="Sugira um filme" description="Conte para a gente qual título deveria entrar no CineVito." /><div className="two-col"><form className="panel panel-pad" onSubmit={submit}><h2 className="panel-title">Sua sugestão</h2><div className="field"><label htmlFor="suggestion-title">Nome do filme/vídeo</label><input id="suggestion-title" className="input focus-tv" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Digite o nome do título" /></div><div className="field"><label htmlFor="suggestion-genero">Gênero (opcional)</label><input id="suggestion-genero" className="input focus-tv" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })} placeholder="Ex.: Ação, Comédia..." /></div><div className="field"><label htmlFor="suggestion-ano">Ano de lançamento (opcional)</label><input id="suggestion-ano" type="number" className="input focus-tv" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} placeholder="Ex.: 2023" /></div>{state === 'success' && <p className="form-success">Sugestão enviada com sucesso!</p>}{state === 'error' && <p className="form-error">{errorMessage}</p>}<button className="primary-button focus-tv" type="submit" disabled={state === 'loading'}><Send size={16} />{state === 'loading' ? 'Enviando...' : 'Enviar sugestão'}</button></form><aside className="panel panel-pad"><div className="eyebrow">Como funciona</div><h2 className="panel-title" style={{ marginTop: 9 }}>Curadoria viva</h2><p className="muted" style={{ fontSize: '.82rem', lineHeight: 1.65 }}>As sugestões ajudam a orientar os próximos títulos do catálogo.</p><Link href="/faq" className="secondary-button focus-tv" style={{ marginTop: 10 }}>Ir para perguntas frequentes <ArrowLeft size={15} className="rotate-180" /></Link></aside></div></div>;
}

function FaqPage() {
  const faqs = [['Como sugiro um filme?', 'Use a página Sugira um filme.'], ['Como funciona o programa de indicação?', 'Seu código é fixo e aparece no perfil.'], ['Posso assistir em uma Smart TV?', 'Sim, o catálogo funciona no navegador da TV.'], ['Como funciona o teste grátis?', 'Consulte a área de assinatura.'], ['Como redefino minha senha?', 'Use o link Esqueci minha senha na tela de entrada.']];
  return <div className="content-wrap page-main"><PageHeader eyebrow="CineVito ajuda" title="Perguntas frequentes" description="Respostas rápidas para aproveitar melhor o seu acesso." /><div className="faq-list">{faqs.map(([question, answer], index) => <details className="faq-item" key={question} open={index === 0}><summary>{question}<ChevronDown size={17} /></summary><div className="faq-answer">{answer}</div></details>)}</div></div>;
}

function AdminPage() {
  const user = useAuth(); const [profile, setProfile] = useState<{ is_admin?: boolean; admin_master?: boolean } | null>(null); const [tab, setTab] = useState('videos'); const [loading, setLoading] = useState(Boolean(user && hasRuntimeConfig)); const [message, setMessage] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planoForm, setPlanoForm] = useState({ nome: '', categoria: '', descricao: '', preco: '', dispositivos: '1', duracaoQtd: '1', duracaoUnidade: 'meses' as 'dias' | 'meses' });
  const [editingPlanoId, setEditingPlanoId] = useState<string | null>(null);
  const [savingPlano, setSavingPlano] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoGenero, setNovoGenero] = useState('');
  const [videoForm, setVideoForm] = useState({ url_video: '', titulo: '', descricao: '', categoria_id: '', genero: '', url_capa: '', licenca: '', ano: '', elenco: '', ao_vivo: false });
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
  const [series, setSeries] = useState<Serie[]>([]);
  const [novaSerieTitulo, setNovaSerieTitulo] = useState('');
  const [novaSerieDescricao, setNovaSerieDescricao] = useState('');
  const [novaSerieCategoriaId, setNovaSerieCategoriaId] = useState('');
  const [novaSerieGenero, setNovaSerieGenero] = useState('');
  const [novaSerieCapa, setNovaSerieCapa] = useState('');
  const [criandoSerie, setCriandoSerie] = useState(false);
  const [selectedSerie, setSelectedSerie] = useState<Serie | null>(null);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [novaTemporadaNumero, setNovaTemporadaNumero] = useState('1');
  const [novaTemporadaTitulo, setNovaTemporadaTitulo] = useState('');
  const [selectedTemporada, setSelectedTemporada] = useState<Temporada | null>(null);
  const [episodios, setEpisodios] = useState<Episodio[]>([]);
  const [novoEpisodioVideoId, setNovoEpisodioVideoId] = useState('');
  const [novoEpisodioLink, setNovoEpisodioLink] = useState('');
  const [novoEpisodioNumero, setNovoEpisodioNumero] = useState('1');
  const [novoEpisodioTitulo, setNovoEpisodioTitulo] = useState('');
  const [novoEpisodioDescricao, setNovoEpisodioDescricao] = useState('');
  const [layoutItems, setLayoutItems] = useState<LayoutItem[]>([]);
  const [dragLayoutIndex, setDragLayoutIndex] = useState<number | null>(null);
  const [novaSecaoTipo, setNovaSecaoTipo] = useState<LayoutItem['tipo']>('carrossel');
  const [novaSecaoTitulo, setNovaSecaoTitulo] = useState('');
  const [novaSecaoNome, setNovaSecaoNome] = useState('');
  const [novaSecaoValor, setNovaSecaoValor] = useState('');
  const [criandoSecao, setCriandoSecao] = useState(false);
  const [selectedLayoutSection, setSelectedLayoutSection] = useState<LayoutItem | null>(null);
  const [secaoVideoIds, setSecaoVideoIds] = useState<string[]>([]);
  const [dragSecaoVideoIndex, setDragSecaoVideoIndex] = useState<number | null>(null);
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [novoCupomCodigo, setNovoCupomCodigo] = useState('');
  const [novoCupomDesconto, setNovoCupomDesconto] = useState('10');
  const [novoCupomValidade, setNovoCupomValidade] = useState('');
  const [criandoCupom, setCriandoCupom] = useState(false);
  const [equipe, setEquipe] = useState<Equipe[]>([]);
  const [novoEquipeEmail, setNovoEquipeEmail] = useState('');
  const [clients, setClients] = useState<Cliente[]>([]);
  const [grantTarget, setGrantTarget] = useState<Cliente | null>(null);
  const [grantForm, setGrantForm] = useState<{ quantidade: number; unidade: 'dias' | 'meses'; motivo: string }>({ quantidade: 30, unidade: 'dias', motivo: '' });
  const [grantBusy, setGrantBusy] = useState(false);
  const [revokeBusyId, setRevokeBusyId] = useState<string | null>(null);
  
  useEffect(() => { if (!user || !hasRuntimeConfig) return; fetchProfile().then((value) => setProfile(value as { is_admin?: boolean; admin_master?: boolean })).catch(() => setProfile(null)).finally(() => setLoading(false)); }, [user]);

  async function loadVideos() { try { setVideos(await fetchAdminVideos()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar vídeos.'); } }
  async function loadCategoriasEGeneros() {
    try { const [cats, gens] = await Promise.all([fetchCategorias(), fetchGenerosList()]); setCategorias(cats); setGeneros(gens); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar categorias.'); }
  }
  useEffect(() => { if (!profile?.is_admin) return; loadVideos(); loadCategoriasEGeneros(); }, [profile?.is_admin]);

  async function handleCreateCategoria() {
    if (!novaCategoria.trim()) return;
    try { await adminCreateCategoria(novaCategoria.trim()); setNovaCategoria(''); await loadCategoriasEGeneros(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar.'); }
  }
  async function handleCreateGenero() {
    if (!novoGenero.trim()) return;
    try { await adminCreateGenero(novoGenero.trim()); setNovoGenero(''); await loadCategoriasEGeneros(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar.'); }
  }

  function resetVideoForm() {
    setVideoForm({ url_video: '', titulo: '', descricao: '', categoria_id: '', genero: '', url_capa: '', licenca: '', ano: '', elenco: '', ao_vivo: false });
    setEditingVideoId(null);
  }
  function editVideo(video: Video) {
    setEditingVideoId(video.id);
    setVideoForm({
      url_video: video.url_video || '', titulo: video.titulo || '', descricao: video.descricao || '',
      categoria_id: video.categoria_id || '', genero: video.genero || '', url_capa: video.url_capa || '',
      licenca: video.licenca || '', ano: video.ano ? String(video.ano) : '', elenco: video.elenco || '', ao_vivo: Boolean(video.ao_vivo),
    });
  }
  async function saveVideo() {
    setMessage('');
    if (!videoForm.url_video.trim() || !videoForm.titulo.trim()) { setMessage('Preencha ao menos o link do vídeo e o título.'); return; }
    setSavingVideo(true);
    const payload: Partial<Video> = {
      url_video: extractVideoUrl(videoForm.url_video), titulo: videoForm.titulo.trim(), descricao: videoForm.descricao.trim() || null,
      categoria_id: videoForm.categoria_id || null, genero: videoForm.genero || null, url_capa: videoForm.url_capa.trim() || null,
      licenca: videoForm.licenca.trim() || null, ano: videoForm.ano ? Number(videoForm.ano) : null, elenco: videoForm.elenco.trim() || null,
      ao_vivo: videoForm.ao_vivo, fonte: 'Cadastrado manualmente',
    };
    try {
      if (editingVideoId) await adminUpdateVideo(editingVideoId, payload); else await adminCreateVideo(payload);
      resetVideoForm(); await loadVideos();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao salvar vídeo.'); } finally { setSavingVideo(false); }
  }
  async function deleteVideo(id: string) {
    if (!window.confirm('Apagar este vídeo do catálogo?')) return;
    setDeletingVideoId(id);
    try { await adminDeleteVideo(id); await loadVideos(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); } finally { setDeletingVideoId(null); }
  }

  async function loadColecoes() { try { setColecoes(await fetchColecoes()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar coleções.'); } }
  async function createColecao() {
    if (!novaColecaoTitulo.trim()) { setMessage('Dê um título para a coleção.'); return; }
    setCriandoColecao(true);
    try { await adminCreateColecao({ titulo: novaColecaoTitulo.trim(), descricao: novaColecaoDescricao.trim() || undefined }); setNovaColecaoTitulo(''); setNovaColecaoDescricao(''); await loadColecoes(); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar.'); } finally { setCriandoColecao(false); }
  }
  async function deleteColecaoHandler(id: string) {
    if (!window.confirm('Apagar esta coleção?')) return;
    try { await adminDeleteColecao(id); if (selectedColecao?.id === id) { setSelectedColecao(null); setColecaoVideos([]); } await loadColecoes(); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); }
  }
  async function selectColecao(colecao: Colecao) {
    setSelectedColecao(colecao);
    try { setColecaoVideos(await fetchColecaoVideos(colecao.id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar vídeos da coleção.'); }
  }
  async function addVideoToColecaoHandler(videoId: string) {
    if (!selectedColecao || !videoId) return;
    try { await adminAddVideoToColecao(selectedColecao.id, videoId); setColecaoVideos(await fetchColecaoVideos(selectedColecao.id)); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao adicionar vídeo.'); }
  }
  async function removeVideoFromColecaoHandler(videoId: string) {
    if (!selectedColecao) return;
    try { await adminRemoveVideoFromColecao(selectedColecao.id, videoId); setColecaoVideos((current) => current.filter((item) => item.video_id !== videoId)); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao remover.'); }
  }
  function handleDragStart(index: number) { setDragIndex(index); }
  function handleDragOver(event: DragEvent) { event.preventDefault(); }
  async function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !selectedColecao) { setDragIndex(null); return; }
    const reordered = [...colecaoVideos]; const [moved] = reordered.splice(dragIndex, 1); reordered.splice(targetIndex, 0, moved);
    setColecaoVideos(reordered); setDragIndex(null);
    try { await adminReorderColecaoVideos(selectedColecao.id, reordered.map((item) => item.video_id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao reordenar.'); }
  }

  async function loadSeries() { try { setSeries(await fetchSeries()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar séries.'); } }
  async function createSerie() {
    if (!novaSerieTitulo.trim()) { setMessage('Dê um título para a série.'); return; }
    setCriandoSerie(true);
    try {
      await adminCreateSerie({ titulo: novaSerieTitulo.trim(), descricao: novaSerieDescricao.trim() || undefined, categoria_id: novaSerieCategoriaId || undefined, genero: novaSerieGenero || undefined, capa_url: novaSerieCapa.trim() || undefined });
      setNovaSerieTitulo(''); setNovaSerieDescricao(''); setNovaSerieCategoriaId(''); setNovaSerieGenero(''); setNovaSerieCapa(''); await loadSeries();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar série.'); } finally { setCriandoSerie(false); }
  }
  async function deleteSerieHandler(id: string) {
    if (!window.confirm('Apagar esta série inteira?')) return;
    try { await adminDeleteSerie(id); if (selectedSerie?.id === id) { setSelectedSerie(null); setTemporadas([]); setSelectedTemporada(null); setEpisodios([]); } await loadSeries(); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); }
  }
  async function selectSerie(serie: Serie) {
    setSelectedSerie(serie); setSelectedTemporada(null); setEpisodios([]);
    try { setTemporadas(await fetchTemporadas(serie.id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar temporadas.'); }
  }
  async function createTemporada() {
    if (!selectedSerie) return;
    const numero = Number(novaTemporadaNumero) || 1;
    try { await adminCreateTemporada(selectedSerie.id, numero, novaTemporadaTitulo.trim() || undefined); setNovaTemporadaNumero(String(numero + 1)); setNovaTemporadaTitulo(''); setTemporadas(await fetchTemporadas(selectedSerie.id)); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar temporada.'); }
  }
  async function deleteTemporadaHandler(id: string) {
    if (!selectedSerie) return;
    if (!window.confirm('Apagar esta temporada?')) return;
    try { await adminDeleteTemporada(id); if (selectedTemporada?.id === id) { setSelectedTemporada(null); setEpisodios([]); } setTemporadas(await fetchTemporadas(selectedSerie.id)); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); }
  }
  async function selectTemporada(temporada: Temporada) {
    setSelectedTemporada(temporada);
    try { setEpisodios(await fetchEpisodios(temporada.id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar episódios.'); }
  }
  async function addEpisodio() {
    if (!selectedTemporada) return;
    setMessage('');
    const numero = Number(novoEpisodioNumero) || 1;
    try {
      let videoId = novoEpisodioVideoId;
      if (!videoId) {
        if (!novoEpisodioLink.trim() || !novoEpisodioTitulo.trim()) { setMessage('Cole o link do episódio e dê um título.'); return; }
        const novoVideo = await adminCreateVideo({ url_video: extractVideoUrl(novoEpisodioLink), titulo: novoEpisodioTitulo.trim(), descricao: novoEpisodioDescricao.trim() || null, categoria_id: selectedSerie?.categoria_id || null, genero: selectedSerie?.genero || null, fonte: 'Episódio de série' });
        videoId = novoVideo.id; await loadVideos();
      }
      await adminAddEpisodio(selectedTemporada.id, videoId, numero, novoEpisodioTitulo.trim() || undefined);
      setNovoEpisodioVideoId(''); setNovoEpisodioLink(''); setNovoEpisodioTitulo(''); setNovoEpisodioDescricao(''); setNovoEpisodioNumero(String(numero + 1)); setEpisodios(await fetchEpisodios(selectedTemporada.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao adicionar episódio.'); }
  }
  async function removeEpisodioHandler(id: string) {
    if (!selectedTemporada) return;
    try { await adminRemoveEpisodio(id); setEpisodios(await fetchEpisodios(selectedTemporada.id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao remover.'); }
  }

  async function loadLayout() { try { setLayoutItems(await fetchCatalogoLayout()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar layout.'); } }
  
  function labelForLayoutItem(item: LayoutItem) {
    if (item.tipo === ('ao_vivo_fileira' as any)) return item.titulo || 'Fileira TV Ao Vivo';
    if (item.tipo === 'series') return 'Séries';
    if (item.tipo === 'catalogo_geral') return 'Catálogo geral';
    if (item.tipo === 'colecao') return item.colecoes?.titulo || 'Coleção';
    if (item.tipo === 'hero') return item.titulo || 'Banner de destaque (Hero)';
    if (item.tipo === 'carrossel') return item.titulo || 'Carrossel';
    if (item.tipo === 'top10') return item.titulo || 'Top 10';
    if (item.tipo === 'elenco') return item.titulo || `Elenco: ${item.config?.nome || '?'}`;
    if (item.tipo === 'categoria') return item.titulo || `Categoria: ${item.config?.valor || '?'}`;
    if (item.tipo === 'ao_vivo') return item.titulo || 'Ao vivo';
    return 'Seção';
  }
  
  function podeGerenciarVideosDaSecao(tipo: LayoutItem['tipo']) { return tipo === 'hero' || tipo === 'carrossel' || tipo === 'top10' || tipo === ('ao_vivo_fileira' as any); }
  function podeApagarSecao(tipo: LayoutItem['tipo']) { return tipo !== 'series' && tipo !== 'catalogo_geral' && tipo !== 'colecao'; }
  function handleLayoutDragStart(index: number) { setDragLayoutIndex(index); }
  function handleLayoutDragOver(event: DragEvent) { event.preventDefault(); }
  async function handleLayoutDrop(targetIndex: number) {
    if (dragLayoutIndex === null || dragLayoutIndex === targetIndex) { setDragLayoutIndex(null); return; }
    const reordered = [...layoutItems]; const [moved] = reordered.splice(dragLayoutIndex, 1); reordered.splice(targetIndex, 0, moved);
    setLayoutItems(reordered); setDragLayoutIndex(null);
    try { await adminReorderLayout(reordered.map((item) => item.id)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao reordenar layout.'); }
  }
  function moveLayoutSection(index: number, direcao: -1 | 1) {
    const alvo = index + direcao; if (alvo < 0 || alvo >= layoutItems.length) return;
    const reordered = [...layoutItems]; const [moved] = reordered.splice(index, 1); reordered.splice(alvo, 0, moved);
    setLayoutItems(reordered); adminReorderLayout(reordered.map((item) => item.id)).catch((error) => setMessage(error instanceof Error ? error.message : 'Erro ao reordenar layout.'));
  }
  async function toggleLayoutVisibleHandler(item: LayoutItem) {
    try { await adminToggleLayoutVisible(item.id, !item.visivel); await loadLayout(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao atualizar.'); }
  }
  async function createLayoutSection() {
    setMessage('');
    if (novaSecaoTipo === 'elenco' && !novaSecaoNome.trim()) { setMessage('Digite o nome do ator/diretor.'); return; }
    if (novaSecaoTipo === 'categoria' && !novaSecaoValor.trim()) { setMessage('Digite a categoria.'); return; }
    setCriandoSecao(true);
    try {
      const config: LayoutSectionConfig = {};
      if (novaSecaoTipo === 'elenco') config.nome = novaSecaoNome.trim();
      if (novaSecaoTipo === 'categoria') config.valor = novaSecaoValor.trim();
      if (novaSecaoTipo === 'hero' || novaSecaoTipo === 'carrossel' || novaSecaoTipo === 'top10' || novaSecaoTipo === ('ao_vivo_fileira' as any)) config.video_ids = [];
      await adminCreateLayoutSection({ tipo: novaSecaoTipo, titulo: novaSecaoTitulo.trim() || undefined, config });
      setNovaSecaoTitulo(''); setNovaSecaoNome(''); setNovaSecaoValor(''); setNovaSecaoTipo('carrossel'); await loadLayout();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar seção.'); } finally { setCriandoSecao(false); }
  }
  function selectLayoutSectionForVideos(item: LayoutItem) { setSelectedLayoutSection(item); setSecaoVideoIds(item.config?.video_ids || []); }
  async function persistSecaoVideoIds(newList: string[]) {
    if (!selectedLayoutSection) return;
    setSecaoVideoIds(newList);
    try {
      const novoConfig = { ...selectedLayoutSection.config, video_ids: newList };
      await adminUpdateLayoutSection(selectedLayoutSection.id, { config: novoConfig });
      setSelectedLayoutSection({ ...selectedLayoutSection, config: novoConfig }); await loadLayout();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao salvar vídeos.'); }
  }
  function addVideoToSecao(videoId: string) { if (!videoId || secaoVideoIds.includes(videoId)) return; persistSecaoVideoIds([...secaoVideoIds, videoId]); }
  function removeVideoFromSecao(videoId: string) { persistSecaoVideoIds(secaoVideoIds.filter((id) => id !== videoId)); }
  function handleSecaoVideoDragStart(index: number) { setDragSecaoVideoIndex(index); }
  function handleSecaoVideoDragOver(event: DragEvent) { event.preventDefault(); }
  function handleSecaoVideoDrop(targetIndex: number) {
    if (dragSecaoVideoIndex === null || dragSecaoVideoIndex === targetIndex) { setDragSecaoVideoIndex(null); return; }
    const reordered = [...secaoVideoIds]; const [moved] = reordered.splice(dragSecaoVideoIndex, 1); reordered.splice(targetIndex, 0, moved);
    setDragSecaoVideoIndex(null); persistSecaoVideoIds(reordered);
  }
  async function deleteLayoutSectionHandler(item: LayoutItem) {
    if (!window.confirm('Apagar esta seção?')) return;
    try { await adminDeleteLayoutSection(item.id); if (selectedLayoutSection?.id === item.id) { setSelectedLayoutSection(null); setSecaoVideoIds([]); } await loadLayout(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); }
  }

  async function loadCupons() { try { setCupons(await fetchAdminCupons()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar cupons.'); } }
  async function createCupom() {
    setMessage('');
    if (!novoCupomCodigo.trim()) { setMessage('Digite o código.'); return; }
    const desconto = Number(novoCupomDesconto);
    if (!desconto || desconto < 1 || desconto > 100) { setMessage('Desconto inválido.'); return; }
    setCriandoCupom(true);
    try { await adminCreateCupom({ codigo: novoCupomCodigo, percentual_desconto: desconto, valido_ate: novoCupomValidade || null }); setNovoCupomCodigo(''); setNovoCupomDesconto('10'); setNovoCupomValidade(''); await loadCupons(); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao criar cupom.'); } finally { setCriandoCupom(false); }
  }
  async function toggleCupomHandler(cupom: Cupom) { try { await adminToggleCupom(cupom.codigo, !cupom.ativo); await loadCupons(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao atualizar cupom.'); } }
  async function deleteCupomHandler(codigo: string) { if (!window.confirm('Apagar cupom?')) return; try { await adminDeleteCupom(codigo); await loadCupons(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); } }

  async function loadEquipe() { try { setEquipe(await fetchEquipe()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar equipe.'); } }
  async function addToEquipeHandler() {
    if (!novoEquipeEmail.trim()) return;
    try { await adminAddToEquipe(novoEquipeEmail); setNovoEquipeEmail(''); await loadEquipe(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao adicionar à equipe.'); }
  }
  async function promoverMasterHandler(id: string) { if (!window.confirm('Tornar admin master?')) return; try { await adminPromoverMaster(id); await loadEquipe(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao promover.'); } }
  async function rebaixarMasterHandler(id: string) { if (!window.confirm('Tirar acesso de master?')) return; try { await adminRebaixarMaster(id); await loadEquipe(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao rebaixar.'); } }
  async function removerDaEquipeHandler(id: string) { if (!window.confirm('Remover acesso?')) return; try { await adminRemoverDaEquipe(id); await loadEquipe(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao remover.'); } }

  async function loadPlans() { try { setPlans(await fetchAdminPlans()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar planos.'); } }
  function resetPlanoForm() { setPlanoForm({ nome: '', categoria: '', descricao: '', preco: '', dispositivos: '1', duracaoQtd: '1', duracaoUnidade: 'meses' }); setEditingPlanoId(null); }
  function editPlano(plan: Plan) { setEditingPlanoId(plan.id); setPlanoForm({ nome: plan.nome || '', categoria: plan.categoria || '', descricao: plan.descricao || '', preco: plan.preco != null ? String(plan.preco) : '', dispositivos: String(plan.dispositivos || 1), duracaoQtd: String(plan.duracao_dias || plan.duracao_meses || 1), duracaoUnidade: plan.duracao_dias ? 'dias' : 'meses' }); }
  async function savePlano() {
    setMessage('');
    const preco = Number(planoForm.preco);
    if (!planoForm.nome.trim() || !preco || preco <= 0) { setMessage('Preencha nome e preço válido.'); return; }
    setSavingPlano(true);
    const qtd = Number(planoForm.duracaoQtd) || 1;
    const payload: Partial<Plan> = { nome: planoForm.nome.trim(), categoria: planoForm.categoria.trim() || planoForm.nome.trim(), descricao: planoForm.descricao.trim() || null, preco, dispositivos: Number(planoForm.dispositivos) || 1, duracao_meses: planoForm.duracaoUnidade === 'meses' ? qtd : 0, duracao_dias: planoForm.duracaoUnidade === 'dias' ? qtd : null };
    try {
      if (editingPlanoId) await adminUpdatePlano(editingPlanoId, payload);
      else { const proximaOrdem = plans.length ? Math.max(...plans.map((p) => p.ordem || 0)) + 1 : 1; await adminCreatePlano({ ...payload, ordem: proximaOrdem, ativo: true }); }
      resetPlanoForm(); await loadPlans();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao salvar plano.'); } finally { setSavingPlano(false); }
  }
  async function deletePlanoHandler(id: string) { if (!window.confirm('Apagar plano?')) return; try { await adminDeletePlano(id); await loadPlans(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao apagar.'); } }
  
  async function loadClients() { try { setClients(await fetchAdminClients()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao carregar clientes.'); } }
  function openGrant(client: Cliente) { setGrantTarget(client); setGrantForm({ quantidade: 30, unidade: 'dias', motivo: '' }); }
  function closeGrant() { setGrantTarget(null); }
  async function confirmGrant() {
    if (!grantTarget) return;
    setGrantBusy(true);
    try { await grantAccess({ usuario_id: grantTarget.id, quantidade: grantForm.quantidade, unidade: grantForm.unidade, motivo: grantForm.motivo }); setMessage('Acesso concedido com sucesso.'); closeGrant(); await loadClients(); } 
    catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao conceder acesso.'); } finally { setGrantBusy(false); }
  }
  async function handleRevoke(client: Cliente) {
    const nome = client.nome || client.email || 'cliente';
    if (!window.confirm(`Cancelar acesso de ${nome}?`)) return;
    setRevokeBusyId(client.id);
    try { await revokeAccess(client.id); setMessage(`Acesso cancelado para ${nome}.`); await loadClients(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao cancelar.'); } finally { setRevokeBusyId(null); }
  }
  async function togglePlan(plan: Plan) { try { await updatePlanActive(plan.id, !plan.ativo); await loadPlans(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao atualizar plano.'); } }

  if (!user) return <LockedPage title="Área administrativa" description="Entre com uma conta autorizada." />;
  if (!hasRuntimeConfig) return <div className="content-wrap page-main"><PageHeader eyebrow="Administração" title="Área protegida" description="Configure o Supabase." /></div>;
  if (loading) return <div className="content-wrap page-main"><PageHeader eyebrow="Administração" title="Verificando acesso" description="Aguarde..." /></div>;
  if (!profile?.is_admin) return <LockedPage title="Acesso restrito" description="Área exclusiva para administradores." />;

  const tabs = profile.admin_master ? ['videos', 'colecoes', 'series', 'layout', 'cupons', 'clientes', 'planos', 'equipe'] : ['videos', 'colecoes', 'series', 'layout'];
  const tabLabels: Record<string, string> = { videos: 'Vídeos', colecoes: 'Coleções', series: 'Séries', layout: 'Layout', cupons: 'Cupons', clientes: 'Clientes', planos: 'Planos', equipe: 'Equipe' };

  function onSelectTab(item: string) {
    setTab(item);
    if (item === 'videos') { loadVideos(); loadCategoriasEGeneros(); }
    if (item === 'colecoes') { loadColecoes(); loadVideos(); }
    if (item === 'series') { loadSeries(); loadVideos(); loadCategoriasEGeneros(); }
    if (item === 'layout') { loadLayout(); loadVideos(); }
    if (item === 'cupons') loadCupons();
    if (item === 'planos') loadPlans();
    if (item === 'clientes') loadClients();
    if (item === 'equipe') loadEquipe();
  }

  return <div className="content-wrap page-main">
    <PageHeader eyebrow="Painel protegido" title="Administração" description={profile.admin_master ? 'Controle completo do CineVito.' : 'Acesso ao catálogo.'} action={<Link href="/admin/uploads" className="primary-button focus-tv" style={{ textDecoration: 'none' }}><Film size={16} />Moderação de Uploads</Link>} />
    <div className="admin-tabs" role="tablist">{tabs.map((item) => <button key={item} className={'admin-tab focus-tv ' + (tab === item ? 'active' : '')} onClick={() => onSelectTab(item)} role="tab" aria-selected={tab === item}>{tabLabels[item]}</button>)}</div>
    {message && <div className="notice notice-orange" role="status">{message}</div>}

    {tab === 'videos' && <section className="panel panel-pad"><div className="eyebrow">Catálogo manual</div><h2 className="panel-title" style={{ marginTop: 8 }}>{editingVideoId ? 'Editar vídeo' : 'Adicionar vídeo'}</h2>
      <div className="field"><label htmlFor="v-url">Link do vídeo ou código &lt;iframe&gt;</label><textarea id="v-url" className="input focus-tv" rows={3} value={videoForm.url_video} onChange={(e) => setVideoForm({ ...videoForm, url_video: e.target.value })} placeholder="https://..." /></div>
      <div className="field"><label htmlFor="v-titulo">Título</label><input id="v-titulo" className="input focus-tv" value={videoForm.titulo} onChange={(e) => setVideoForm({ ...videoForm, titulo: e.target.value })} placeholder="Nome do filme/vídeo" /></div>
      <div className="field"><label htmlFor="v-descricao">Sinopse</label><input id="v-descricao" className="input focus-tv" value={videoForm.descricao} onChange={(e) => setVideoForm({ ...videoForm, descricao: e.target.value })} placeholder="Sinopse" /></div>
      <div className="field"><label htmlFor="v-categoria">Categoria</label><select id="v-categoria" className="input focus-tv" value={videoForm.categoria_id} onChange={(e) => setVideoForm({ ...videoForm, categoria_id: e.target.value })}><option value="">Selecione...</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select><div style={{ display: 'flex', gap: 8, marginTop: 6 }}><input className="input focus-tv" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Nova categoria..." /><button type="button" className="secondary-button focus-tv" onClick={handleCreateCategoria}>Criar</button></div></div>
      <div className="field"><label htmlFor="v-genero">Gênero</label><select id="v-genero" className="input focus-tv" value={videoForm.genero} onChange={(e) => setVideoForm({ ...videoForm, genero: e.target.value })}><option value="">Selecione...</option>{generos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}</select><div style={{ display: 'flex', gap: 8, marginTop: 6 }}><input className="input focus-tv" value={novoGenero} onChange={(e) => setNovoGenero(e.target.value)} placeholder="Novo gênero..." /><button type="button" className="secondary-button focus-tv" onClick={handleCreateGenero}>Criar</button></div></div>
      <div className="field"><label htmlFor="v-elenco">Elenco (separe os nomes por vírgula)</label><input id="v-elenco" className="input focus-tv" value={videoForm.elenco} onChange={(e) => setVideoForm({ ...videoForm, elenco: e.target.value })} placeholder="Ex.: Gal Gadot, Fernanda Torres" /></div>
      <label className="check-row"><input type="checkbox" checked={videoForm.ao_vivo} onChange={(e) => setVideoForm({ ...videoForm, ao_vivo: e.target.checked })} />Transmissão ao vivo / esportes (aparece na seção "Ao vivo")</label>
      <div className="field"><label htmlFor="v-capa">URL da capa (opcional)</label><input id="v-capa" className="input focus-tv" value={videoForm.url_capa} onChange={(e) => setVideoForm({ ...videoForm, url_capa: e.target.value })} placeholder="https://..." /></div>
      <div className="field"><label htmlFor="v-licenca">Licença</label><input id="v-licenca" className="input focus-tv" value={videoForm.licenca} onChange={(e) => setVideoForm({ ...videoForm, licenca: e.target.value })} placeholder="Ex.: Domínio Público" /></div>
      <div className="field"><label htmlFor="v-ano">Ano</label><input id="v-ano" type="number" className="input focus-tv" value={videoForm.ano} onChange={(e) => setVideoForm({ ...videoForm, ano: e.target.value })} placeholder="Ex.: 1968" /></div>
      <button className="primary-button focus-tv" onClick={saveVideo} disabled={savingVideo}>{savingVideo ? 'Salvando...' : editingVideoId ? 'Salvar alterações' : 'Adicionar ao catálogo'}</button>
      {editingVideoId && <button className="quiet-button focus-tv" style={{ marginLeft: 10 }} onClick={resetVideoForm}>Cancelar</button>}
      <h3 style={{ marginTop: 26 }}>Vídeos cadastrados</h3>
      <div className="admin-list" style={{ marginTop: 10 }}>{videos.length ? videos.map((video) => <div className="result-row" key={video.id}><span><strong>{video.titulo}</strong></span><span style={{ display: 'flex', gap: 8 }}><button className="quiet-button focus-tv" onClick={() => editVideo(video)}>Editar</button><button className="quiet-button focus-tv" onClick={() => deleteVideo(video.id)}>Apagar</button></span></div>) : <p className="muted">Nenhum vídeo cadastrado.</p>}</div>
    </section>}

    {tab === 'colecoes' && <section className="panel panel-pad">
      <div className="eyebrow">Organização</div><h2 className="panel-title" style={{ marginTop: 8 }}>Coleções</h2>
      <div className="field"><label>Nova coleção</label><input className="input focus-tv" value={novaColecaoTitulo} onChange={(e) => setNovaColecaoTitulo(e.target.value)} placeholder="Ex.: Ação Explosiva" /></div>
      <div className="field"><label>Descrição (opcional)</label><input className="input focus-tv" value={novaColecaoDescricao} onChange={(e) => setNovaColecaoDescricao(e.target.value)} placeholder="Descrição da coleção" /></div>
      <button className="primary-button focus-tv" onClick={createColecao} disabled={criandoColecao}>{criandoColecao ? 'Criando...' : 'Criar coleção'}</button>
      <div className="chip-row no-scrollbar" style={{ display: 'flex', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 8, marginTop: 20 }}>{colecoes.map((c) => <button key={c.id} className={'chip focus-tv ' + (selectedColecao?.id === c.id ? 'active' : '')} style={{ flexShrink: 0 }} onClick={() => selectColecao(c)}>{c.titulo}</button>)}</div>
      {selectedColecao && <div className="admin-list" style={{ marginTop: 16 }}>
        <h3 className="section-title">{selectedColecao.titulo}</h3>
        <p className="muted" style={{ marginBottom: 12 }}>Arraste para reordenar.</p>
        {colecaoVideos.map((cv, index) => <div key={cv.video_id} draggable onDragStart={() => handleDragStart(index)} onDragOver={handleDragOver} onDrop={() => handleDrop(index)} className="result-row" style={{ cursor: 'grab' }}>
          <span><strong>{cv.videos?.titulo}</strong></span><button className="quiet-button focus-tv" onClick={() => removeVideoFromColecaoHandler(cv.video_id)}>Remover</button>
        </div>)}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input focus-tv" onChange={(e) => addVideoToColecaoHandler(e.target.value)} value=""><option value="">Adicionar vídeo...</option>{videos.filter((v) => !colecaoVideos.some((cv) => cv.video_id === v.id)).map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}</select>
          <button className="quiet-button focus-tv" onClick={() => deleteColecaoHandler(selectedColecao.id)} style={{ color: '#ff8275' }}>Apagar Coleção</button>
        </div>
      </div>}
    </section>}

    {tab === 'series' && <section className="panel panel-pad">
      <div className="eyebrow">Organização</div><h2 className="panel-title" style={{ marginTop: 8 }}>Séries e Temporadas</h2>
      <div className="field"><label>Título da Série</label><input className="input focus-tv" value={novaSerieTitulo} onChange={(e) => setNovaSerieTitulo(e.target.value)} placeholder="Ex.: Breaking Bad" /></div>
      <div className="field"><label>Sinopse</label><input className="input focus-tv" value={novaSerieDescricao} onChange={(e) => setNovaSerieDescricao(e.target.value)} placeholder="Sinopse da série" /></div>
      <div className="field"><label>Categoria</label><select className="input focus-tv" value={novaSerieCategoriaId} onChange={(e) => setNovaSerieCategoriaId(e.target.value)}><option value="">Selecione...</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
      <div className="field"><label>Gênero</label><select className="input focus-tv" value={novaSerieGenero} onChange={(e) => setNovaSerieGenero(e.target.value)}><option value="">Selecione...</option>{generos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}</select></div>
      <div className="field"><label>URL da Capa</label><input className="input focus-tv" value={novaSerieCapa} onChange={(e) => setNovaSerieCapa(e.target.value)} placeholder="https://..." /></div>
      <button className="primary-button focus-tv" onClick={createSerie} disabled={criandoSerie}>{criandoSerie ? 'Criando...' : 'Criar Série'}</button>
      <div className="chip-row no-scrollbar" style={{ display: 'flex', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 8, marginTop: 20 }}>{series.map((s) => <button key={s.id} className={'chip focus-tv ' + (selectedSerie?.id === s.id ? 'active' : '')} style={{ flexShrink: 0 }} onClick={() => selectSerie(s)}>{s.titulo}</button>)}</div>
      {selectedSerie && <div className="admin-list" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="section-title">{selectedSerie.titulo}</h3><button className="quiet-button focus-tv" onClick={() => deleteSerieHandler(selectedSerie.id)} style={{ color: '#ff8275' }}>Apagar Série</button>
        </div>
        <div className="field" style={{ marginTop: 12 }}><label>Nova Temporada (Número)</label><input type="number" className="input focus-tv" value={novaTemporadaNumero} onChange={(e) => setNovaTemporadaNumero(e.target.value)} /></div>
        <div className="field"><label>Título da Temporada (Opcional)</label><input className="input focus-tv" value={novaTemporadaTitulo} onChange={(e) => setNovaTemporadaTitulo(e.target.value)} placeholder="Ex.: 1ª Temporada" /></div>
        <button className="secondary-button focus-tv" onClick={createTemporada}>Adicionar Temporada</button>
        <div className="chip-row no-scrollbar" style={{ display: 'flex', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 8, marginTop: 20 }}>{temporadas.map((t) => <button key={t.id} className={'chip focus-tv ' + (selectedTemporada?.id === t.id ? 'active' : '')} style={{ flexShrink: 0 }} onClick={() => selectTemporada(t)}>{t.titulo || `Temporada ${t.numero}`}</button>)}</div>
        {selectedTemporada && <div style={{ marginTop: 16, padding: 12, border: '1px solid rgba(255,255,255,.05)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>Episódios</strong><button className="quiet-button focus-tv" onClick={() => deleteTemporadaHandler(selectedTemporada.id)} style={{ color: '#ff8275' }}><Trash2 size={15} /></button>
          </div>
          {episodios.map((ep) => <div key={ep.id} className="result-row"><span>Ep. {ep.numero} — {ep.titulo || ep.videos?.titulo}</span><button className="quiet-button focus-tv" onClick={() => removeEpisodioHandler(ep.id)}>Remover</button></div>)}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="field"><label>Número do Ep.</label><input type="number" className="input focus-tv" value={novoEpisodioNumero} onChange={(e) => setNovoEpisodioNumero(e.target.value)} /></div>
            <div className="field"><label>Vincular vídeo existente...</label><select className="input focus-tv" value={novoEpisodioVideoId} onChange={(e) => { setNovoEpisodioVideoId(e.target.value); setNovoEpisodioLink(''); setNovoEpisodioTitulo(''); }}><option value="">Selecione ou adicione link abaixo...</option>{videos.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}</select></div>
            {!novoEpisodioVideoId && <><div className="field"><label>...ou colar Link do Episódio</label><input className="input focus-tv" value={novoEpisodioLink} onChange={(e) => setNovoEpisodioLink(e.target.value)} placeholder="https://..." /></div><div className="field"><label>Título do Episódio</label><input className="input focus-tv" value={novoEpisodioTitulo} onChange={(e) => setNovoEpisodioTitulo(e.target.value)} placeholder="Ex.: Piloto" /></div><div className="field"><label>Sinopse do Episódio</label><input className="input focus-tv" value={novoEpisodioDescricao} onChange={(e) => setNovoEpisodioDescricao(e.target.value)} placeholder="Resumo..." /></div></>}
            <button className="secondary-button focus-tv" onClick={addEpisodio}>Adicionar Episódio</button>
          </div>
        </div>}
      </div>}
    </section>}

    {tab === 'layout' && <section className="panel panel-pad">
      <div className="eyebrow">Aparência</div><h2 className="panel-title" style={{ marginTop: 8 }}>Construtor de Catálogo</h2>
      <p className="muted" style={{ marginBottom: 16 }}>A ordem destas seções define como os usuários veem as fileiras.</p>
      <div className="field"><label>Nova Seção</label><select className="input focus-tv" value={novaSecaoTipo} onChange={(e) => setNovaSecaoTipo(e.target.value as LayoutItem['tipo'])}>{LAYOUT_SECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      <div className="field"><label>Título da Seção (Opcional)</label><input className="input focus-tv" value={novaSecaoTitulo} onChange={(e) => setNovaSecaoTitulo(e.target.value)} placeholder="Ex.: Lançamentos da Semana" /></div>
      {novaSecaoTipo === 'elenco' && <div className="field"><label>Nome do Ator/Diretor</label><input className="input focus-tv" value={novaSecaoNome} onChange={(e) => setNovaSecaoNome(e.target.value)} placeholder="Ex.: Wagner Moura" /></div>}
      {novaSecaoTipo === 'categoria' && <div className="field"><label>Nome da Categoria/Gênero</label><input className="input focus-tv" value={novaSecaoValor} onChange={(e) => setNovaSecaoValor(e.target.value)} placeholder="Ex.: Comédia" /></div>}
      <button className="primary-button focus-tv" onClick={createLayoutSection} disabled={criandoSecao}>{criandoSecao ? 'Criando...' : 'Adicionar Seção'}</button>
      <div className="admin-list" style={{ marginTop: 24 }}>
        {layoutItems.map((item, index) => <div key={item.id} className="result-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div draggable onDragStart={() => handleLayoutDragStart(index)} onDragOver={handleLayoutDragOver} onDrop={() => handleLayoutDrop(index)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'grab', flex: 1 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ opacity: item.visivel ? 1 : 0.4 }}>{item.titulo || labelForLayoutItem(item)}</strong>
                <span className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.tipo}</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button className="icon-button focus-tv" onClick={() => moveLayoutSection(index, -1)} disabled={index === 0} aria-label="Mover para cima"><ChevronDown size={16} className="rotate-180" /></button>
              <button className="icon-button focus-tv" onClick={() => moveLayoutSection(index, 1)} disabled={index === layoutItems.length - 1} aria-label="Mover para baixo"><ChevronDown size={16} /></button>
              <button className="quiet-button focus-tv" onClick={() => toggleLayoutVisibleHandler(item)}>{item.visivel ? 'Ocultar' : 'Mostrar'}</button>
              {podeGerenciarVideosDaSecao(item.tipo) && <button className="quiet-button focus-tv" onClick={() => selectLayoutSectionForVideos(item)}>Vídeos</button>}
              {podeApagarSecao(item.tipo) && <button className="quiet-button focus-tv" onClick={() => deleteLayoutSectionHandler(item)} style={{ color: '#ff8275' }}><Trash2 size={16} /></button>}
            </div>
          </div>
          {selectedLayoutSection?.id === item.id && <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 12, marginTop: 4 }}>
            <p className="muted" style={{ fontSize: '.8rem', marginBottom: 8 }}>Arraste para reordenar os vídeos desta seção.</p>
            {secaoVideoIds.map((vid, vIndex) => {
              const v = findVideo(videos, vid);
              return v ? <div key={vid} draggable onDragStart={() => handleSecaoVideoDragStart(vIndex)} onDragOver={handleSecaoVideoDragOver} onDrop={() => handleSecaoVideoDrop(vIndex)} className="result-row" style={{ cursor: 'grab', padding: '6px 10px', minHeight: 32 }}><span>{v.titulo}</span><button className="icon-button focus-tv" onClick={() => removeVideoFromSecao(vid)}><X size={14} /></button></div> : null;
            })}
            <select className="input focus-tv" style={{ marginTop: 8 }} onChange={(e) => { addVideoToSecao(e.target.value); e.target.value = ''; }} value=""><option value="">Adicionar vídeo...</option>{videos.filter(v => !secaoVideoIds.includes(v.id)).map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}</select>
          </div>}
        </div>)}
      </div>
    </section>}

    {tab === 'cupons' && <section className="panel panel-pad">
      <div className="eyebrow">Financeiro</div><h2 className="panel-title" style={{ marginTop: 8 }}>Cupons de Desconto</h2>
      <div className="field"><label>Código do Cupom</label><input className="input focus-tv" value={novoCupomCodigo} onChange={(e) => setNovoCupomCodigo(e.target.value.toUpperCase())} placeholder="Ex.: BEMVINDO10" /></div>
      <div className="field"><label>Desconto (%)</label><input type="number" className="input focus-tv" value={novoCupomDesconto} onChange={(e) => setNovoCupomDesconto(e.target.value)} min="1" max="100" /></div>
      <div className="field"><label>Válido até (opcional)</label><input type="date" className="input focus-tv" value={novoCupomValidade} onChange={(e) => setNovoCupomValidade(e.target.value)} /></div>
      <button className="primary-button focus-tv" onClick={createCupom} disabled={criandoCupom}>{criandoCupom ? 'Criando...' : 'Criar Cupom'}</button>
      <div className="admin-list" style={{ marginTop: 24 }}>{cupons.map((cupom) => <div className="result-row" key={cupom.codigo}><span><strong>{cupom.codigo}</strong> — {cupom.percentual_desconto}% <span className="muted">({cupom.ativo ? 'Ativo' : 'Inativo'})</span></span><span style={{ display: 'flex', gap: 8 }}><button className="quiet-button focus-tv" onClick={() => toggleCupomHandler(cupom)}>{cupom.ativo ? 'Desativar' : 'Ativar'}</button><button className="quiet-button focus-tv" onClick={() => deleteCupomHandler(cupom.codigo)}>Apagar</button></span></div>)}</div>
    </section>}

    {tab === 'clientes' && <section className="panel panel-pad">
      <div className="eyebrow">Gestão</div><h2 className="panel-title" style={{ marginTop: 8 }}>Clientes e Acessos</h2>
      <div className="admin-list" style={{ marginTop: 16 }}>{clients.map((c) => {
        const sub = (c as any).assinatura?.[0] || (c as any).assinaturas?.[0] || (c as any).assinatura;
        const status = !sub ? 'Sem acesso' : sub.status === 'ativa' ? 'Ativo' : sub.status === 'trial' ? 'Trial' : sub.status === 'pendente' ? 'Pendente' : 'Inativo';
        return <div className="result-row" key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>{c.nome || 'Usuário'}</strong> <span className="muted">({c.email})</span></span>
            <span className="muted" style={{ fontSize: '.8rem' }}>{status}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="quiet-button focus-tv" onClick={() => openGrant(c)}>Conceder Acesso</button>
            {sub && <button className="quiet-button focus-tv" onClick={() => handleRevoke(c)} disabled={revokeBusyId === c.id} style={{ color: '#ff8275' }}>Cancelar Acesso</button>}
          </div>
          {grantTarget?.id === c.id && <div style={{ background: 'rgba(0,200,255,.05)', padding: 12, borderRadius: 8, marginTop: 8 }}>
            <div className="field"><label>Quantidade de tempo</label><input type="number" className="input focus-tv" value={grantForm.quantidade} onChange={(e) => setGrantForm({ ...grantForm, quantidade: Number(e.target.value) })} /></div>
            <div className="field"><label>Unidade</label><select className="input focus-tv" value={grantForm.unidade} onChange={(e) => setGrantForm({ ...grantForm, unidade: e.target.value as 'dias' | 'meses' })}><option value="dias">Dias</option><option value="meses">Meses</option></select></div>
            <div className="field"><label>Motivo/Nota (aparece para o cliente)</label><input className="input focus-tv" value={grantForm.motivo} onChange={(e) => setGrantForm({ ...grantForm, motivo: e.target.value })} placeholder="Ex.: Cortesia de suporte" /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="primary-button focus-tv" onClick={confirmGrant} disabled={grantBusy}>Confirmar</button><button className="quiet-button focus-tv" onClick={closeGrant}>Cancelar</button></div>
          </div>}
        </div>;
      })}</div>
    </section>}

    {tab === 'planos' && <section className="panel panel-pad">
      <div className="eyebrow">Financeiro</div><h2 className="panel-title" style={{ marginTop: 8 }}>Planos de Assinatura</h2>
      <div className="field"><label>Nome do Plano</label><input className="input focus-tv" value={planoForm.nome} onChange={(e) => setPlanoForm({ ...planoForm, nome: e.target.value })} placeholder="Ex.: Plano Família" /></div>
      <div className="field"><label>Categoria (agrupa botões)</label><input className="input focus-tv" value={planoForm.categoria} onChange={(e) => setPlanoForm({ ...planoForm, categoria: e.target.value })} placeholder="Ex.: Mensal" /></div>
      <div className="field"><label>Descrição curta</label><input className="input focus-tv" value={planoForm.descricao} onChange={(e) => setPlanoForm({ ...planoForm, descricao: e.target.value })} placeholder="Ex.: 4 telas simultâneas" /></div>
      <div className="field"><label>Preço (R$)</label><input type="number" step="0.01" className="input focus-tv" value={planoForm.preco} onChange={(e) => setPlanoForm({ ...planoForm, preco: e.target.value })} placeholder="Ex.: 29.90" /></div>
      <div className="field"><label>Dispositivos</label><input type="number" className="input focus-tv" value={planoForm.dispositivos} onChange={(e) => setPlanoForm({ ...planoForm, dispositivos: e.target.value })} /></div>
      <div className="field"><label>Duração do Acesso</label><div style={{ display: 'flex', gap: 8 }}><input type="number" className="input focus-tv" value={planoForm.duracaoQtd} onChange={(e) => setPlanoForm({ ...planoForm, duracaoQtd: e.target.value })} style={{ width: 80 }} /><select className="input focus-tv" value={planoForm.duracaoUnidade} onChange={(e) => setPlanoForm({ ...planoForm, duracaoUnidade: e.target.value as 'dias' | 'meses' })}><option value="dias">Dias</option><option value="meses">Meses</option></select></div></div>
      <button className="primary-button focus-tv" onClick={savePlano} disabled={savingPlano}>{savingPlano ? 'Salvando...' : editingPlanoId ? 'Salvar Plano' : 'Criar Plano'}</button>
      {editingPlanoId && <button className="quiet-button focus-tv" style={{ marginLeft: 10 }} onClick={resetPlanoForm}>Cancelar</button>}
      <div className="admin-list" style={{ marginTop: 24 }}>{plans.map((p) => <div className="result-row" key={p.id}><span><strong>{p.nome}</strong> — R$ {p.preco} <span className="muted">({p.ativo ? 'Ativo' : 'Inativo'})</span></span><span style={{ display: 'flex', gap: 8 }}><button className="quiet-button focus-tv" onClick={() => togglePlan(p)}>{p.ativo ? 'Ocultar' : 'Mostrar'}</button><button className="quiet-button focus-tv" onClick={() => editPlano(p)}>Editar</button><button className="quiet-button focus-tv" onClick={() => deletePlanoHandler(p.id)} style={{ color: '#ff8275' }}>Apagar</button></span></div>)}</div>
    </section>}

    {tab === 'equipe' && <section className="panel panel-pad">
      <div className="eyebrow">Acesso Restrito</div><h2 className="panel-title" style={{ marginTop: 8 }}>Equipe Administrativa</h2>
      <div className="field"><label>Adicionar Administrador (E-mail)</label><div style={{ display: 'flex', gap: 8 }}><input type="email" className="input focus-tv" value={novoEquipeEmail} onChange={(e) => setNovoEquipeEmail(e.target.value)} placeholder="email@exemplo.com" /><button className="secondary-button focus-tv" onClick={addToEquipeHandler}>Adicionar</button></div></div>
      <div className="admin-list" style={{ marginTop: 24 }}>{equipe.map((eq) => <div className="result-row" key={eq.id}><span><strong>{eq.email}</strong> {eq.admin_master && <span className="premium-badge" style={{ marginLeft: 8, fontSize: '.65rem' }}>MASTER</span>}</span><span style={{ display: 'flex', gap: 8 }}>{eq.admin_master ? <button className="quiet-button focus-tv" onClick={() => rebaixarMasterHandler(eq.id)}>Remover Master</button> : <button className="quiet-button focus-tv" onClick={() => promoverMasterHandler(eq.id)}>Tornar Master</button>}<button className="quiet-button focus-tv" onClick={() => removerDaEquipeHandler(eq.id)} style={{ color: '#ff8275' }}>Remover Acesso</button></span></div>)}</div>
    </section>}
  </div>;
}

function LockedPage({ title, description }: { title: string; description: string }) {
  return <div className="content-wrap page-main"><div className="empty-state"><KeyRound size={28} /><h3>{title}</h3><p>{description}</p><Link href="/" className="primary-button focus-tv" style={{ marginTop: 12 }}>Ir para entrada</Link></div></div>;
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
  return <div className="home-shell"><div className="auth-layout" style={{ maxWidth: 620 }}><section className="auth-panel" style={{ borderLeft: 0 }}><Brand /><h2 style={{ marginTop: 42 }}>Redefinir senha</h2><p>Informe o e-mail da conta.</p>{sent ? <div className="notice notice-cyan"><Check size={17} /><span>Instruções enviadas.</span></div> : <form onSubmit={submit}><div className="field"><label htmlFor="reset-email">E-mail</label><input id="reset-email" type="email" required className="input focus-tv" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></div><button className="primary-button button-wide focus-tv" type="submit" disabled={busy}>{busy ? 'Enviando...' : 'Enviar instruções'}</button></form>}<Link href="/" className="quiet-button button-wide focus-tv" style={{ marginTop: 10 }}><ArrowLeft size={15} />Voltar</Link></section></div></div>;
}

function NotFoundPage() {
  return <div className="content-wrap page-main"><div className="empty-state"><CircleAlert size={28} /><h3>Página não encontrada</h3><p>Endereço inválido.</p><Link href="/catalogo" className="primary-button focus-tv" style={{ marginTop: 12 }}>Voltar ao catálogo</Link></div></div>;
}

function Router() {
  return <Switch>
    <Route path="/" component={AuthPage} /><Route path="/index.html" component={AuthPage} />
    <Route path="/catalogo" component={CatalogPage} /><Route path="/catalogo.html" component={CatalogPage} />
    <Route path="/aovivo" component={LiveTVPage} /><Route path="/aovivo.html" component={LiveTVPage} />
    <Route path="/player/:id" component={PlayerPage} /><Route path="/player.html" component={PlayerPage} />
    <Route path="/serie/:id" component={SeriePage} />
    <Route path="/perfil" component={ProfilePage} /><Route path="/perfil.html" component={ProfilePage} />
    <Route path="/assinatura" component={SubscriptionPage} /><Route path="/assinatura.html" component={SubscriptionPage} />
    <Route path="/colecao" component={CollectionPage} /><Route path="/colecao.html" component={CollectionPage} />
    <Route path="/sugestao" component={SuggestionPage} /><Route path="/sugestao.html" component={SuggestionPage} />
    <Route path="/faq" component={FaqPage} /><Route path="/faq.html" component={FaqPage} />
    <Route path="/admin" component={AdminPage} /><Route path="/admin.html" component={AdminPage} />
    
    <Route path="/upload"><UserUploadPage user={getStoredUser()} /></Route>
    <Route path="/admin/uploads" component={AdminUploadsPage} />

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
