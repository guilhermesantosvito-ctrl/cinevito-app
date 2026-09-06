import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SOURCE = "https://www.pobreflixtv.city/";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function clean(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\\s+/g, " ").trim(); }
function absolute(value: string) { try { return new URL(value.replace(/&amp;/g, "&"), SOURCE).toString(); } catch { return null; } }
async function fetchText(url: string) { const response = await fetch(url, { headers: { "User-Agent": "CineVito catalog sync" } }); if (!response.ok) throw new Error("Fonte respondeu HTTP " + response.status); return await response.text(); }
function parseCards(html: string) {
  const items: Array<{ title: string; url: string; poster: string | null; year: number | null; type: string }> = [];
  const seen = new Set<string>();
  const pattern = /<a\\b[^>]+href=["']([^"']+\\/(?:filmes|series)\\/online\\/[^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = absolute(match[1]); if (!url || seen.has(url)) continue;
    const inner = match[2];
    const titleMatch = inner.match(/<(?:strong|h[1-6])[^>]*>([\\s\\S]*?)<\\/(?:strong|h[1-6])>/i);
    const imageMatch = inner.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
    const title = clean(titleMatch?.[1] || inner).replace(/^Assistir\\s+/i, "").replace(/\\b(19|20)\\d{2}\\b/g, "").trim();
    if (!title || title.length < 2) continue;
    const yearMatch = inner.match(/\\b((?:19|20)\\d{2})\\b/); seen.add(url);
    items.push({ title, url, poster: imageMatch ? absolute(imageMatch[1]) : null, year: yearMatch ? Number(yearMatch[1]) : null, type: url.includes("/series/") ? "Séries" : "Filmes" });
  }
  return items;
}
async function parseDetails(item: { title: string; url: string; poster: string | null; year: number | null; type: string }) {
  try {
    const html = await fetchText(item.url);
    const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const title = clean(html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)?.[1] || item.title).replace(/^Assistir\\s+/i, "").replace(/\\s+Online.*$/i, "").trim();
    return { ...item, title: title || item.title, poster: image ? absolute(image) : item.poster, description: description ? clean(description) : null };
  } catch { return { ...item, description: null }; }
}
async function authUser(req: Request) { const token = req.headers.get("Authorization")?.replace(/^Bearer\\s+/i, ""); if (!token) return null; const { data } = await supabase.auth.getUser(token); return data.user || null; }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (!await authUser(req)) return json({ error: "Faça login para sincronizar o catálogo." }, 401);
  try {
    const body = await req.json().catch(() => ({})); const query = typeof body?.query === "string" ? body.query.trim() : "";
    const pages = [SOURCE, SOURCE + "page/2/", SOURCE + "page/3/"]; let cards = (await Promise.all(pages.map((page) => fetchText(page).catch(() => "")))).flatMap(parseCards);
    if (query) {
      const terms = query.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").split(/\\s+/).filter(Boolean);
      const sitemap = await fetchText(SOURCE + "sitemap.php").catch(() => "");
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\\/loc>/gi)].map((match) => absolute(match[1])).filter((url): url is string => Boolean(url));
      const matching = urls.filter((url) => { const normalized = url.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); return terms.every((term) => normalized.includes(term)); });
      const extra = matching.slice(0, 20).map((url) => ({ title: query, url, poster: null, year: null, type: url.includes("/series/") ? "Séries" : "Filmes" })); cards = cards.concat(extra);
      cards = cards.filter((item) => terms.every((term) => item.title.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").includes(term)) || terms.every((term) => item.url.toLocaleLowerCase().includes(term)));
    }
    const unique = [...new Map(cards.map((item) => [item.url, item])).values()].slice(0, query ? 20 : 80); const detailed = await Promise.all(unique.map(parseDetails));
    const { data: existingCategories } = await supabase.from("categorias").select("id,nome,slug,ordem"); const categories = existingCategories || [];
    for (const [index, name] of ["Filmes", "Séries"].entries()) { if (!categories.some((category) => category.slug === name.toLowerCase())) { const { data } = await supabase.from("categorias").insert({ nome: name, slug: name.toLowerCase(), ordem: 10 + index }).select("id,nome,slug,ordem").single(); if (data) categories.push(data); } }
    const categoryByName = new Map(categories.map((category) => [category.nome, category.id])); const urls = detailed.map((item) => item.url); const { data: existingVideos } = urls.length ? await supabase.from("videos").select("id,url_video").in("url_video", urls) : { data: [] }; const existingByUrl = new Map((existingVideos || []).map((video) => [video.url_video, video.id]));
    let added = 0; let updated = 0;
    for (const item of detailed) { const payload = { titulo: item.title, descricao: item.description, categoria_id: categoryByName.get(item.type) || null, url_video: item.url, url_capa: item.poster, fonte: "PobreFlixTV", licenca: "Fonte externa indicada pelo administrador", ano: item.year, premium: false, genero: item.type }; const existingId = existingByUrl.get(item.url); if (existingId) { await supabase.from("videos").update(payload).eq("id", existingId); updated++; } else { const { error } = await supabase.from("videos").insert(payload); if (!error) added++; } }
    return json({ source: SOURCE, query, found: detailed.length, added, updated, titles: detailed.map((item) => item.title) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Falha ao sincronizar o catálogo." }, 500); }
});