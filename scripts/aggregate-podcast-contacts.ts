/**
 * Agrège social_links + contact_emails au niveau podcast (table podcast_metadata).
 *
 * Heuristique : une URL/email qui apparaît dans ≥ THRESHOLD épisodes est
 * considéré comme "podcast-level" (recurring). Les URLs n'apparaissant que
 * dans 1-2 épisodes sont des socials d'invités ou d'entreprises, à ignorer.
 *
 * Source : rss_content_encoded ou rss_description de chaque épisode.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { extractContact } from '../src/rss/extractors.ts';

const sql = neon(process.env.DATABASE_URL!);
const THRESHOLD = 5; // URL doit apparaître dans ≥ 5 eps pour être retenue

(async () => {
  for (const tenant of ['lamartingale', 'gdiy']) {
    const rows = (await sql`
      SELECT COALESCE(rss_content_encoded, rss_description) as desc
      FROM episodes WHERE tenant_id=${tenant}
    `) as { desc: string | null }[];

    const urlCount = new Map<string, { platform: string; url: string; c: number }>();
    const emailCount = new Map<string, number>();

    // Rejette les liens "contenus individuels" (posts, videos) qui polluent
    // l'agrégat : on veut les comptes officiels (instagram.com/<name>,
    // youtube.com/@channel), pas les posts spécifiques.
    const isContentLink = (url: string) =>
      /\/(p|reel|tv|stories)\//i.test(url) ||      // Instagram content
      /\/(watch|shorts|playlist)\?/i.test(url) ||  // YouTube content
      /\/status\//i.test(url);                     // Twitter/X content

    for (const r of rows) {
      if (!r.desc) continue;
      const { emails, socials } = extractContact(r.desc);
      for (const s of socials) {
        if (isContentLink(s.url)) continue;
        const key = s.url.toLowerCase().replace(/\/+$/, '');
        const prev = urlCount.get(key);
        if (prev) prev.c += 1;
        else urlCount.set(key, { platform: s.platform, url: s.url, c: 1 });
      }
      for (const e of emails) {
        const key = e.toLowerCase();
        emailCount.set(key, (emailCount.get(key) ?? 0) + 1);
      }
    }

    const recurringSocials = [...urlCount.values()]
      .filter((x) => x.c >= THRESHOLD)
      .sort((a, b) => b.c - a.c)
      .map((x) => ({ platform: x.platform, url: x.url }));

    const recurringEmails = [...emailCount.entries()]
      .filter(([, c]) => c >= THRESHOLD)
      .sort((a, b) => b[1] - a[1])
      .map(([e]) => e);

    await sql`
      UPDATE podcast_metadata
      SET social_links=${JSON.stringify(recurringSocials)}::jsonb,
          contact_emails=${recurringEmails},
          updated_at=NOW()
      WHERE tenant_id=${tenant}
    `;

    console.log(
      `[${tenant}] ${recurringSocials.length} socials / ${recurringEmails.length} emails (threshold=${THRESHOLD})`,
    );
    if (recurringSocials.length)
      console.log(`  socials: ${recurringSocials.map((s) => `${s.platform}:${s.url}`).join(', ')}`);
    if (recurringEmails.length) console.log(`  emails: ${recurringEmails.join(', ')}`);
  }
})();
