import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { getConfig } from '../config';

// ============================================================================
// Dashboard analytics — exploite le deep content (articles, chapitres, liens, durée).
// Multi-tenant : filtre tenant_id partout.
// ============================================================================

export async function getDashboard() {
  const sql = neon(process.env.DATABASE_URL!);
  const TENANT = getConfig().database.tenantId;

  const [
    overviewRow,
    pillarHoursRows,
    longestRow, shortestRow,
    linksTypeRows,
    topToolsRows,
    topCompaniesRows,
    guestNetworkRow,
    transversalRows,
    contentDepthRow,
    pillarDistRows,
    timelineRows,
    topGuestsRows,
    mostConnectedRow,
    uniqueDomainsRow,
  ] = await Promise.all([
    sql`SELECT
      COALESCE(SUM(duration_seconds),0)::bigint AS total_seconds,
      count(*) FILTER (WHERE duration_seconds IS NOT NULL)::int AS with_duration,
      count(*)::int AS total_full,
      COALESCE(AVG(duration_seconds)::int,0) AS avg_seconds,
      COALESCE(SUM(length(article_content)),0)::bigint AS total_chars
    FROM episodes
    WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)`,

    sql`SELECT pillar,
      COALESCE(SUM(duration_seconds),0)::bigint AS seconds,
      count(*)::int AS eps,
      COALESCE(AVG(duration_seconds)::int,0) AS avg_s
    FROM episodes
    WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY pillar ORDER BY seconds DESC`,

    sql`SELECT episode_number, title, duration_seconds
    FROM episodes WHERE tenant_id = ${TENANT}
      AND duration_seconds IS NOT NULL
      AND (episode_type='full' OR episode_type IS NULL)
    ORDER BY duration_seconds DESC LIMIT 1`,

    sql`SELECT episode_number, title, duration_seconds
    FROM episodes WHERE tenant_id = ${TENANT}
      AND duration_seconds IS NOT NULL AND duration_seconds > 60
      AND (episode_type='full' OR episode_type IS NULL)
    ORDER BY duration_seconds ASC LIMIT 1`,

    sql`SELECT link_type, count(*)::int AS c FROM episode_links
    WHERE tenant_id = ${TENANT} GROUP BY link_type`,

    sql`SELECT url, label, count(DISTINCT episode_id)::int AS mentions
    FROM episode_links WHERE tenant_id = ${TENANT} AND link_type='tool'
      AND label IS NOT NULL AND length(label) BETWEEN 2 AND 40
      AND label !~* '^(ce |c[''’]est |cliquez|voir |écoutez|découvr|https?://|le podcast)'
      AND label !~* '(podcast génération|la martingale|orso media|cosavostra|deezer|spotify)'
    GROUP BY url, label ORDER BY mentions DESC LIMIT 15`,

    sql`SELECT url, label, count(DISTINCT episode_id)::int AS mentions
    FROM episode_links WHERE tenant_id = ${TENANT} AND link_type='company'
      AND label IS NOT NULL AND length(label) BETWEEN 2 AND 40
      AND label !~* '^(ce |c[''’]est |cliquez|voir |écoutez|découvr|https?://|le podcast)'
      AND label !~* '(podcast génération|la martingale|orso media|cosavostra|deezer|spotify)'
    GROUP BY url, label ORDER BY mentions DESC LIMIT 15`,

    sql`SELECT
      count(DISTINCT guest)::int AS total_unique,
      count(DISTINCT guest) FILTER (WHERE guest IN (SELECT name FROM guests WHERE tenant_id = ${TENANT} AND linkedin_url IS NOT NULL))::int AS with_linkedin,
      (SELECT count(*)::int FROM (
        SELECT guest FROM episodes WHERE tenant_id = ${TENANT}
          AND guest IS NOT NULL AND guest != ''
          AND (episode_type='full' OR episode_type IS NULL)
        GROUP BY guest HAVING count(*) > 1
      ) x) AS recurring
    FROM episodes WHERE tenant_id = ${TENANT}
      AND guest IS NOT NULL AND guest != ''
      AND (episode_type='full' OR episode_type IS NULL)`,

    sql`SELECT guest, count(*)::int AS eps, array_agg(DISTINCT pillar) AS pillars
    FROM episodes WHERE tenant_id = ${TENANT}
      AND guest IS NOT NULL AND guest != ''
      AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY guest
    HAVING count(DISTINCT pillar) >= 3
    ORDER BY count(DISTINCT pillar) DESC, count(*) DESC LIMIT 10`,

    sql`SELECT
      count(*) FILTER (WHERE article_content IS NOT NULL AND length(article_content) > 200)::int AS with_full_article,
      count(*) FILTER (WHERE chapters IS NOT NULL AND jsonb_array_length(chapters) > 0)::int AS with_chapters,
      count(*) FILTER (WHERE key_takeaways IS NOT NULL AND jsonb_array_length(key_takeaways) > 0)::int AS with_takeaways,
      count(*) FILTER (WHERE duration_seconds IS NOT NULL)::int AS with_duration,
      count(*)::int AS total,
      COALESCE(AVG(jsonb_array_length(COALESCE(chapters,'[]'::jsonb)))::numeric(10,2),0) AS avg_chapters,
      COALESCE(AVG(length(COALESCE(article_content,'')))::int,0) AS avg_article_len
    FROM episodes WHERE tenant_id = ${TENANT}
      AND (episode_type='full' OR episode_type IS NULL)`,

    sql`SELECT pillar, count(*)::int AS c FROM episodes
    WHERE tenant_id = ${TENANT} AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY pillar ORDER BY c DESC`,

    sql`SELECT date_trunc('month', date_created)::date AS month, pillar, count(*)::int AS c
    FROM episodes WHERE tenant_id = ${TENANT} AND date_created IS NOT NULL
      AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY month, pillar ORDER BY month`,

    sql`SELECT guest, count(*)::int AS eps
    FROM episodes WHERE tenant_id = ${TENANT}
      AND guest IS NOT NULL AND guest != ''
      AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY guest HAVING count(*) > 1
    ORDER BY eps DESC LIMIT 15`,

    sql`SELECT e.episode_number, e.title, count(*)::int AS refs
    FROM episode_links el
    INNER JOIN episodes e ON e.tenant_id = el.tenant_id AND e.url = el.url
    WHERE el.tenant_id = ${TENANT} AND el.link_type='episode_ref'
    GROUP BY e.episode_number, e.title ORDER BY refs DESC LIMIT 1`,

    sql`SELECT count(DISTINCT regexp_replace(url, '^https?://(www\\.)?([^/]+).*', '\\2'))::int AS c
    FROM episode_links WHERE tenant_id = ${TENANT}`,
  ]) as any[];

  const o = overviewRow[0];
  const cd = contentDepthRow[0];
  const totalSeconds = Number(o.total_seconds);
  const totalFull = Number(o.total_full);
  const totalHours = Math.round(totalSeconds / 3600);
  const avgMinutes = Math.round((Number(o.avg_seconds) || 0) / 60);
  // Approx mots : 5 chars par mot (français)
  const totalWords = Math.round(Number(o.total_chars) / 5);

  const totalLinks = (linksTypeRows as any[]).reduce((s, r: any) => s + Number(r.c), 0);
  const linksByType: Record<string, number> = Object.fromEntries(
    (linksTypeRows as any[]).map((r: any) => [r.link_type, Number(r.c)])
  );
  const crossReferences = linksByType.episode_ref || 0;

  const topGuestsList = (topGuestsRows as any[]).map((r: any) => ({ name: r.guest, episodes: Number(r.eps) }));
  const topGuest = topGuestsList[0] || null;

  // Insights générés dynamiquement
  const insights: { icon: string; text: string }[] = [];
  if (totalHours > 0) {
    const days = Math.round(totalHours / 24 * 10) / 10;
    insights.push({ icon: '📊', text: `Le podcast représente ${totalHours} heures de contenu expert — l'équivalent de ${days} jours d'écoute non-stop.` });
  }
  if (cd.with_full_article && totalFull) {
    const pct = Math.round(cd.with_full_article / totalFull * 100);
    insights.push({ icon: '📝', text: `${pct}% des épisodes ont un article complet (~${Math.round(Number(cd.avg_article_len))} caractères en moyenne).` });
  }
  if (transversalRows.length) {
    insights.push({ icon: '👥', text: `${transversalRows.length} invités sont apparus dans 3+ piliers différents — ce sont les experts transversaux du podcast.` });
  }
  if (topGuest && topGuest.episodes >= 3) {
    insights.push({ icon: '🎤', text: `${topGuest.name} est l'invité le plus fréquent (${topGuest.episodes} épisodes).` });
  }
  const cleanLabel = (r: any) => {
    const raw = (r.label && r.label.length >= 2 && r.label.length <= 40 && !/^https?:/i.test(r.label)) ? r.label : null;
    if (raw) return raw;
    try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return r.url; }
  };
  const topToolLabels = (topToolsRows as any[]).slice(0, 3).map(cleanLabel);
  if (topToolLabels.length) {
    insights.push({ icon: '🛠️', text: `Les outils les plus recommandés par les experts : ${topToolLabels.join(', ')}.` });
  }
  if (crossReferences) {
    insights.push({ icon: '🔗', text: `${crossReferences} références inter-épisodes — le podcast construit un vrai corpus interconnecté.` });
  }
  if (avgMinutes) {
    insights.push({ icon: '⏱️', text: `Durée moyenne d'un épisode : ${avgMinutes} min — un format long-form qui permet d'aller en profondeur.` });
  }

  return {
    overview: {
      total_episodes: totalFull,
      total_hours: totalHours,
      total_words: totalWords,
      avg_episode_minutes: avgMinutes,
      total_guests: Number(guestNetworkRow[0]?.total_unique || 0),
      total_links: totalLinks,
    },
    content_volume: {
      total_hours: totalHours,
      total_words: totalWords,
      avg_episode_minutes: avgMinutes,
      longest_episode: longestRow[0] ? {
        number: longestRow[0].episode_number, title: longestRow[0].title,
        minutes: Math.round(longestRow[0].duration_seconds / 60),
      } : null,
      shortest_episode: shortestRow[0] ? {
        number: shortestRow[0].episode_number, title: shortestRow[0].title,
        minutes: Math.round(shortestRow[0].duration_seconds / 60),
      } : null,
      hours_by_pillar: (pillarHoursRows as any[]).map((r: any) => ({
        pillar: r.pillar,
        hours: Math.round(Number(r.seconds) / 3600),
        episodes: Number(r.eps),
        avg_minutes: Math.round(Number(r.avg_s) / 60),
      })),
    },
    knowledge_graph: {
      total_links: totalLinks,
      unique_domains: Number(uniqueDomainsRow[0]?.c || 0),
      by_type: linksByType,
      cross_references: crossReferences,
      most_referenced_episode: mostConnectedRow[0] ? {
        number: mostConnectedRow[0].episode_number,
        title: mostConnectedRow[0].title,
        refs: Number(mostConnectedRow[0].refs),
      } : null,
      top_tools: (topToolsRows as any[]).map((r: any) => ({
        name: r.label || r.url, url: r.url, mentions: Number(r.mentions),
      })),
      top_companies: (topCompaniesRows as any[]).map((r: any) => ({
        name: r.label || r.url, url: r.url, mentions: Number(r.mentions),
      })),
    },
    guest_network: {
      total_unique: Number(guestNetworkRow[0]?.total_unique || 0),
      with_linkedin: Number(guestNetworkRow[0]?.with_linkedin || 0),
      recurring: Number(guestNetworkRow[0]?.recurring || 0),
      top: topGuestsList,
      transversal: (transversalRows as any[]).map((r: any) => ({
        name: r.guest, episodes: Number(r.eps), pillars: r.pillars,
      })),
    },
    content_depth: {
      with_full_article: { count: Number(cd.with_full_article), pct: totalFull ? Math.round(Number(cd.with_full_article) / totalFull * 100) : 0 },
      with_chapters: { count: Number(cd.with_chapters), pct: totalFull ? Math.round(Number(cd.with_chapters) / totalFull * 100) : 0 },
      with_takeaways: { count: Number(cd.with_takeaways), pct: totalFull ? Math.round(Number(cd.with_takeaways) / totalFull * 100) : 0 },
      with_duration: { count: Number(cd.with_duration), pct: totalFull ? Math.round(Number(cd.with_duration) / totalFull * 100) : 0 },
      avg_chapters_per_episode: Number(cd.avg_chapters),
      avg_article_length_chars: Number(cd.avg_article_len),
    },
    pillar_distribution: (pillarDistRows as any[]).map((r: any) => ({ pillar: r.pillar, count: Number(r.c) })),
    timeline: (timelineRows as any[]).map((r: any) => ({
      month: r.month, pillar: r.pillar, count: Number(r.c),
    })),
    insights,
  };
}

if (require.main === module) {
  getDashboard().then(d => {
    console.log(JSON.stringify(d, null, 2));
  }).catch(console.error);
}
