import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  // Distribution of guest_from_title prefixes (to identify noise)
  const noisy: any = await sql`
    SELECT guest_from_title, episode_type, count(*)::int AS c
    FROM episodes
    WHERE tenant_id='gdiy' AND guest_from_title IS NOT NULL
    GROUP BY guest_from_title, episode_type
    ORDER BY c DESC
    LIMIT 30`;
  console.log('Top guest_from_title values (by count):');
  for (const r of noisy) console.log(`  [${r.episode_type || 'null'}] x${r.c}  ${r.guest_from_title}`);

  const prefixes: any = await sql`
    SELECT substring(guest_from_title from 1 for 1) AS first_char, count(*)::int AS c
    FROM episodes
    WHERE tenant_id='gdiy' AND guest_from_title IS NOT NULL AND (episode_type='full' OR episode_type IS NULL)
    GROUP BY first_char
    ORDER BY c DESC`;
  console.log('\nFirst-char distribution (full episodes):');
  for (const r of prefixes) console.log(`  '${r.first_char}': ${r.c}`);

  // Sample ONE episode with article_content to understand bio extraction
  const ex: any = await sql`
    SELECT episode_number, guest_from_title, substring(article_content from 1 for 800) AS head
    FROM episodes
    WHERE tenant_id='gdiy' AND article_content IS NOT NULL AND length(article_content) > 500
      AND guest_from_title IS NOT NULL AND (episode_type='full' OR episode_type IS NULL)
    LIMIT 2`;
  console.log('\nArticle samples:');
  for (const r of ex) {
    console.log(`\n#${r.episode_number} — ${r.guest_from_title}`);
    console.log(r.head);
  }
})().catch(e => { console.error(e); process.exit(1); });
