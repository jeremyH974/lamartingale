/**
 * Collecte les anomalies détectées pendant le pipeline deep-scraping.
 * Sortie : docs/feedback-orso-media.md
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

function firstString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if (typeof v['#cdata'] === 'string') return v['#cdata'].trim() || null;
    if (typeof v['#text'] === 'string') return v['#text'].trim() || null;
  }
  return null;
}
const extractNum = (t: string): number | null => {
  const m = t.match(/^#?\s*(\d+)\s*[-–]/);
  return m ? parseInt(m[1], 10) : null;
};

async function main() {
  // 1. Gaps dans la numérotation
  const nums = (await sql`
    SELECT episode_number FROM episodes WHERE episode_number IS NOT NULL ORDER BY episode_number
  `) as { episode_number: number }[];
  const present = new Set(nums.map((r) => r.episode_number));
  const min = Math.min(...present);
  const max = Math.max(...present);
  const gaps: number[] = [];
  for (let n = min; n <= max; n++) if (!present.has(n)) gaps.push(n);

  // 2. Épisodes sans article (no article_content or <200c)
  const noArticle = (await sql`
    SELECT episode_number, title, slug
    FROM episodes
    WHERE episode_number IS NOT NULL
      AND (article_content IS NULL OR length(article_content) < 200)
    ORDER BY episode_number DESC
  `) as any[];

  // 3. Épisodes sans RSS match (no duration or no rss_description)
  const noRss = (await sql`
    SELECT episode_number, title
    FROM episodes
    WHERE episode_number IS NOT NULL
      AND (duration_seconds IS NULL OR rss_description IS NULL)
    ORDER BY episode_number DESC
  `) as any[];

  // 4. Épisodes sans chapitres (H2 manquants sur la page)
  const noChap = (await sql`
    SELECT episode_number, title, length(article_content) AS article_len
    FROM episodes
    WHERE episode_number IS NOT NULL
      AND article_content IS NOT NULL
      AND length(article_content) >= 200
      AND jsonb_array_length(chapters) = 0
    ORDER BY episode_number DESC
  `) as any[];

  // 5. Doublons de slug (plusieurs numéros pour la même URL)
  const dupSlug = (await sql`
    SELECT slug, array_agg(episode_number ORDER BY episode_number) AS numbers, COUNT(*)::int AS n
    FROM episodes
    WHERE slug IS NOT NULL
    GROUP BY slug
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `) as any[];

  // 6. Scan RSS pour items orphelins (pas dans BDD) — seulement items numérotés
  const rssFeeds = [
    'https://feed.audiomeans.fr/feed/la-martingale-010afa69a4c1.xml',
    'https://feed.audiomeans.fr/feed/allo-la-martingale-5d56dcf7.xml',
  ];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', cdataPropName: '#cdata' });
  const rssItems: { number: number | null; title: string; feed: string }[] = [];
  for (const url of rssFeeds) {
    try {
      const xml = await (await fetch(url)).text();
      const data = parser.parse(xml);
      const items = data?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : [items];
      const feedName = url.includes('allo') ? 'Allô La Martingale' : 'La Martingale';
      for (const it of arr) {
        const title = firstString(it.title) || '';
        const n = extractNum(title);
        rssItems.push({ number: n, title, feed: feedName });
      }
    } catch (e) {
      console.error('feed fetch failed:', url, e);
    }
  }
  const orphanRss = rssItems
    .filter((it) => it.number != null && !present.has(it.number!))
    .filter((it, i, arr) => arr.findIndex((x) => x.number === it.number) === i); // unique by number

  const unnumberedRss = rssItems.filter((it) => it.number == null).length;

  // 7. Stats LinkedIn
  const lkd = (await sql`
    SELECT
      (SELECT COUNT(DISTINCT url)::int FROM episode_links WHERE link_type = 'linkedin') AS links_linkedin_unique,
      (SELECT COUNT(*)::int FROM guests) AS guests_total,
      (SELECT COUNT(*)::int FROM guests WHERE linkedin_url IS NOT NULL) AS guests_with_linkedin,
      (SELECT COUNT(DISTINCT guest)::int FROM episodes WHERE guest IS NOT NULL) AS unique_guest_names_in_episodes
  `) as any[];

  // ------------------------------------------------------------------
  // Compose markdown
  // ------------------------------------------------------------------
  const nowIso = new Date().toISOString().slice(0, 10);
  const md: string[] = [];
  md.push(`# Feedback qualité de données — La Martingale / Orso Media`);
  md.push('');
  md.push(`_Rapport automatique du pipeline data — ${nowIso}_`);
  md.push('');
  md.push(`Auteur : projet indépendant La Martingale (Jeremy), à l'attention de Matthieu Stefani.`);
  md.push('');
  md.push(`Ce rapport liste les incohérences détectées en croisant trois sources :`);
  md.push(`- **Site** lamartingale.io (articles par épisode)`);
  md.push(`- **RSS Audiomeans** (principal + Allô La Martingale)`);
  md.push(`- **Base de données** internes (${present.size} épisodes, range #${min}-#${max})`);
  md.push('');
  md.push(`Pas urgent mais utile pour la propreté de l'archive et pour faciliter tout projet data tiers.`);
  md.push('');

  md.push(`## 1. Trous dans la numérotation des épisodes`);
  md.push('');
  if (gaps.length) {
    md.push(`Sur la plage [#${min}..#${max}], ${gaps.length} numéro(s) n'ont jamais été attribués :`);
    md.push('');
    md.push(`- ${gaps.map((g) => `#${g}`).join(', ')}`);
    md.push('');
    md.push(`> Action suggérée : soit publier les épisodes manquants, soit re-numéroter l'archive pour qu'elle soit continue. Des trous compliquent la navigation ("épisode précédent / suivant").`);
  } else {
    md.push(`Aucun trou. La numérotation est continue sur [#${min}..#${max}].`);
  }
  md.push('');

  md.push(`## 2. Épisodes sans article sur le site`);
  md.push('');
  if (noArticle.length) {
    md.push(`${noArticle.length} épisode(s) n'ont pas de page article trouvable sur lamartingale.io (ou article vide).`);
    md.push('');
    md.push('| # | Titre | Slug BDD |');
    md.push('|---|---|---|');
    for (const e of noArticle) md.push(`| #${e.episode_number} | ${e.title} | ${e.slug ?? '—'} |`);
    md.push('');
    md.push(`> Impact : ces épisodes sont dans le podcast (flux RSS) mais invisibles en SEO et dans tout moteur de recherche qui indexerait le site. Un visiteur qui cherche "${noArticle[0]?.title}" ne retrouve pas l'épisode.`);
  } else {
    md.push(`Tous les épisodes ont un article sur le site.`);
  }
  md.push('');

  md.push(`## 3. Épisodes absents du flux RSS Audiomeans`);
  md.push('');
  if (noRss.length) {
    md.push(`${noRss.length} épisode(s) sont sur le site mais non matchables dans le RSS principal :`);
    md.push('');
    md.push('| # | Titre |');
    md.push('|---|---|');
    for (const e of noRss) md.push(`| #${e.episode_number} | ${e.title} |`);
    md.push('');
    md.push(`> Impact : les apps de podcast (Spotify, Apple, etc.) qui consomment le RSS ne voient pas ces épisodes sous leur numéro. Probable désynchronisation entre le titre du RSS et le titre du site.`);
  } else {
    md.push(`Tous les épisodes sont matchables dans le RSS.`);
  }
  md.push('');

  md.push(`## 4. Épisodes sans chapitrage (H2) dans l'article`);
  md.push('');
  if (noChap.length) {
    md.push(`${noChap.length} article(s) n'ont aucun sous-titre H2 (navigation difficile pour un lecteur).`);
    md.push('');
    md.push('| # | Titre | Taille article (c) |');
    md.push('|---|---|---|');
    for (const e of noChap.slice(0, 30)) md.push(`| #${e.episode_number} | ${e.title} | ${e.article_len} |`);
    if (noChap.length > 30) md.push(`| ... | +${noChap.length - 30} autres | |`);
    md.push('');
    md.push(`> Action suggérée : ajouter 3-5 sous-titres H2 aux anciens articles. Cela améliore SEO, lisibilité, et aide les agents IA (RAG) à répondre avec précision.`);
  }
  md.push('');

  md.push(`## 5. Doublons d'URL (plusieurs épisodes pointent sur la même page)`);
  md.push('');
  if (dupSlug.length) {
    md.push(`${dupSlug.length} slug(s) partagé(s) par plusieurs numéros d'épisode :`);
    md.push('');
    md.push('| Slug | Épisodes | # concernés |');
    md.push('|---|---|---|');
    for (const d of dupSlug) md.push(`| \`${d.slug}\` | ${d.n} | ${d.numbers.map((n: number) => `#${n}`).join(', ')} |`);
    md.push('');
    md.push(`> Impact : deux épisodes distincts du flux RSS pointent sur **le même article**. Probable ré-émission renumérotée (#264 = re-diffusion de #262 par exemple), ou erreur de slug dans le CMS. Un visiteur qui clique sur #264 dans son app podcast arrive sur l'article de #262.`);
  } else {
    md.push(`Aucun slug dupliqué.`);
  }
  md.push('');

  md.push(`## 6. RSS items orphelins (numéro présent dans RSS mais pas en archive)`);
  md.push('');
  if (orphanRss.length) {
    md.push(`${orphanRss.length} item(s) du RSS ont un numéro mais aucun épisode correspondant n'a pu être trouvé sur le site :`);
    md.push('');
    md.push('| # | Titre RSS | Flux |');
    md.push('|---|---|---|');
    for (const it of orphanRss.slice(0, 30)) md.push(`| #${it.number} | ${it.title.replace(/\|/g, '\\|').slice(0, 80)} | ${it.feed} |`);
    if (orphanRss.length > 30) md.push(`| ... | +${orphanRss.length - 30} autres | |`);
  } else {
    md.push(`Pas d'orphelin numéroté.`);
  }
  md.push('');
  md.push(`RSS items **non numérotés** : ${unnumberedRss} (probablement des bandes-annonces, bonus, ou Allô La Martingale hors numérotation principale).`);
  md.push('');

  md.push(`## 7. Bios invités — fragment à consolider`);
  md.push('');
  md.push(`La table \`guests\` recense ${lkd[0].guests_total} personnes formellement, dont ${lkd[0].guests_with_linkedin} avec un LinkedIn identifié.`);
  md.push(`En revanche, la colonne \`episodes.guest\` contient **${lkd[0].unique_guest_names_in_episodes} noms uniques** (chaque épisode a un invité).`);
  md.push('');
  md.push(`> Écart de ~${lkd[0].unique_guest_names_in_episodes - lkd[0].guests_total} noms : beaucoup d'invités ne sont pas consolidés dans la table \`guests\`. Pour un projet data, il serait utile d'uniformiser : même si un invité n'apparaît qu'une fois, sa bio + LinkedIn + entreprise ont leur place dans un annuaire central.`);
  md.push('');

  md.push(`---`);
  md.push('');
  md.push(`## Résumé chiffré`);
  md.push('');
  md.push('| Dimension | Métrique |');
  md.push('|---|---|');
  md.push(`| Épisodes en archive | ${present.size} (range #${min}-#${max}) |`);
  md.push(`| Trous de numérotation | ${gaps.length} (${gaps.map((g) => `#${g}`).join(', ') || '—'}) |`);
  md.push(`| Articles manquants | ${noArticle.length} |`);
  md.push(`| Non-match RSS | ${noRss.length} |`);
  md.push(`| Sans chapitrage H2 | ${noChap.length} |`);
  md.push(`| Slugs dupliqués | ${dupSlug.length} |`);
  md.push(`| RSS orphelins | ${orphanRss.length} |`);
  md.push(`| Liens LinkedIn uniques extraits | ${lkd[0].links_linkedin_unique} |`);
  md.push('');

  const outPath = path.join(process.cwd(), 'docs', 'feedback-orso-media.md');
  fs.writeFileSync(outPath, md.join('\n'), 'utf-8');
  console.log(`\n✅ Rapport écrit : ${outPath}`);
  console.log(`  gaps=${gaps.length}  noArticle=${noArticle.length}  noRss=${noRss.length}  noChap=${noChap.length}  dupSlug=${dupSlug.length}  orphanRss=${orphanRss.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
