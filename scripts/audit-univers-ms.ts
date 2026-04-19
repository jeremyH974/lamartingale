// Audit multi-tenant — compare chaque tenant à la référence LM sur toutes les dimensions.
// Usage: npx tsx scripts/audit-univers-ms.ts > docs/audit-univers-ms.json
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const TENANTS = ['lamartingale', 'gdiy', 'lepanier', 'finscale', 'passionpatrimoine', 'combiencagagne'];

type Row = Record<string, any>;

async function auditTenant(t: string): Promise<Row> {
  const r: Row = { tenant: t };

  const [eps] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(article_content) FILTER (WHERE length(article_content) > 200)::int AS with_article,
      COUNT(rss_description) FILTER (WHERE length(rss_description) > 50)::int AS with_rss_desc,
      COUNT(rss_topic) FILTER (WHERE rss_topic IS NOT NULL AND length(rss_topic) > 5)::int AS with_rss_topic,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(rss_discover, '[]'::jsonb)) > 0)::int AS with_rss_discover,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(rss_references, '[]'::jsonb)) > 0)::int AS with_rss_refs,
      COUNT(*) FILTER (WHERE rss_promo IS NOT NULL)::int AS with_rss_promo,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(rss_chapters_ts, '[]'::jsonb)) > 0)::int AS with_rss_chapters,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(chapters, '[]'::jsonb)) > 0)::int AS with_chapters,
      COUNT(youtube_url) FILTER (WHERE youtube_url IS NOT NULL)::int AS with_youtube,
      COUNT(audio_url) FILTER (WHERE audio_url IS NOT NULL)::int AS with_audio_url,
      COUNT(episode_image_url) FILTER (WHERE episode_image_url IS NOT NULL)::int AS with_episode_image,
      COUNT(guid) FILTER (WHERE guid IS NOT NULL)::int AS with_guid,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(sponsors, '[]'::jsonb)) > 0)::int AS with_sponsors,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(cross_refs, '[]'::jsonb)) > 0)::int AS with_cross_refs,
      COUNT(pillar) FILTER (WHERE pillar IS NOT NULL AND pillar != 'Autre' AND pillar != '')::int AS with_pillar
    FROM episodes WHERE tenant_id = ${t}`;
  r.episodes = eps;

  const [links] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE link_type = 'linkedin')::int AS linkedin,
      COUNT(*) FILTER (WHERE link_type = 'resource')::int AS resource,
      COUNT(*) FILTER (WHERE link_type = 'tool')::int AS tool,
      COUNT(*) FILTER (WHERE link_type = 'episode_ref')::int AS episode_ref,
      COUNT(*) FILTER (WHERE link_type = 'company')::int AS company,
      COUNT(*) FILTER (WHERE link_type = 'cross_podcast_ref')::int AS cross_podcast_ref
    FROM episode_links WHERE tenant_id = ${t}`;
  r.links = links;

  const [g] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(linkedin_url) FILTER (WHERE linkedin_url IS NOT NULL)::int AS with_linkedin,
      COUNT(bio) FILTER (WHERE bio IS NOT NULL AND length(bio) > 50)::int AS with_bio,
      COUNT(company) FILTER (WHERE company IS NOT NULL AND length(company) > 2)::int AS with_company,
      COUNT(*) FILTER (WHERE authority_score IS NOT NULL)::int AS with_authority
    FROM guests WHERE tenant_id = ${t}`;
  r.guests = g;

  const [quiz] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE length(explanation) > 60)::int AS with_explanation,
      COUNT(*) FILTER (WHERE length(question) > 40)::int AS quality_question
    FROM quiz_questions WHERE tenant_id = ${t}`;
  r.quiz = quiz;

  const [enr] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(embedding) FILTER (WHERE embedding IS NOT NULL)::int AS with_embedding,
      COUNT(*) FILTER (WHERE tags IS NOT NULL AND array_length(tags, 1) > 0)::int AS with_tags,
      COUNT(*) FILTER (WHERE sub_themes IS NOT NULL AND array_length(sub_themes, 1) > 0)::int AS with_sub_themes
    FROM episodes_enrichment WHERE tenant_id = ${t}`;
  r.enrichment = enr;

  const [sim] = await sql`SELECT COUNT(*)::int AS total FROM episode_similarities WHERE tenant_id = ${t}`;
  r.similarities = sim;

  const [tax] = await sql`SELECT COUNT(*)::int AS total FROM taxonomy WHERE tenant_id = ${t}`;
  r.taxonomy = tax;

  const [paths] = await sql`SELECT COUNT(*)::int AS total FROM learning_paths WHERE tenant_id = ${t}`;
  r.learning_paths = paths;

  const meta = await sql`
    SELECT title, subtitle, description, author, owner_email, image_url,
           social_links, contact_emails, categories, last_build_date
    FROM podcast_metadata WHERE tenant_id = ${t}`;
  r.podcast_metadata = meta[0] ?? null;

  const [media] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(thumbnail_350) FILTER (WHERE thumbnail_350 IS NOT NULL)::int AS with_thumbnail
    FROM episodes_media WHERE tenant_id = ${t}`;
  r.media = media;

  const [ge] = await sql`SELECT COUNT(*)::int AS total FROM guest_episodes WHERE tenant_id = ${t}`;
  r.guest_episodes = ge;

  return r;
}

async function auditCross() {
  const [cpg] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE total_podcasts >= 2)::int AS cross_podcast,
      COUNT(linkedin_url) FILTER (WHERE linkedin_url IS NOT NULL)::int AS with_linkedin,
      COUNT(bio) FILTER (WHERE bio IS NOT NULL)::int AS with_bio,
      COUNT(*) FILTER (WHERE is_host = true)::int AS hosts
    FROM cross_podcast_guests`;

  const tenantBreakdown = await sql`
    SELECT jsonb_array_elements(tenant_appearances)->>'tenant_id' AS tenant, COUNT(*)::int AS n
    FROM cross_podcast_guests GROUP BY 1 ORDER BY 2 DESC`;

  return { cross_podcast_guests: cpg, tenantBreakdown };
}

(async () => {
  const results = await Promise.all(TENANTS.map(auditTenant));
  const cross = await auditCross();
  console.log(JSON.stringify({ tenants: results, cross }, null, 2));
})();
