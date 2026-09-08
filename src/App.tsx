import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
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
  clearSession, fetchAdminPlans, fetchAdminVideos, fetchPlans, fetchProfile, fetchVideos, getAccessToken, getStoredUser, hasRuntimeConfig,
  invokeCatalogSync, invokeVerifier, requestPasswordReset, signIn, signUp, submitSuggestion, updatePlanActive, type Plan, type SessionUser, type Video,
} from '@/lib/cinevito-client';
import '@/index.css';
const queryClient = new QueryClient();
const fallbackVideos: Video[] = [
  { id: 'meio-acre-da-natureza', titulo: 'Meio Acre da Natureza', genero: 'Natureza', categoria: 'Natureza & Relaxamento', premium: false },
  { id: 'a-noite-dos-mortos-vivos', titulo: 'A Noite dos Mortos Vivos', genero: 'Terror', categoria: 'Filmes Clássicos', premium: false },
  { id: 'nada-como-uma-mulher', titulo: 'Nada Como uma Mulher', genero: 'Comédia', categoria: 'Filmes Clássicos', premium: false },
  { id: 'o-planeta-em-transformacao', titulo: 'O Planeta em Transformação', genero: 'Documentário', categoria: 'Documentários', ano: 2021, premium: false },
  { id: 'memorias-de-um-rio', titulo: 'Memórias de um Rio', genero: 'Documentário', categoria: 'Documentários', ano: 2022, premium: false },
  { id: 'a-ultima-sessao', titulo: 'A Última Sessão', genero: 'Drama', categoria: 'Curtas-Metragens', ano: 2023, premium: false },
  { id: 'entre-dois-mundos', titulo: 'Entre Dois Mundos', genero: 'Aventura', categoria: 'Curtas-Metragens', ano: 2024, premium: false },
];
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
            <div className="field"><label htmlFor="auth-email">E-mail</label><input id="auth-email" type="email" className="input focus-tv" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="voce@exemplo.com" autoComplete="email"
