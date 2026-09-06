# CineVito React — GitHub e Netlify

## GitHub

Envie todo o conteúdo desta pasta para a raiz do repositório. A estrutura deve conter `package.json`, `index.html`, `vite.config.ts`, `src/` e `public/`.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`

Configure estas variáveis no Netlify, sem usar a chave service_role:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

A chave anon é a chave pública do frontend. Nunca coloque a service_role no GitHub ou no Netlify.
