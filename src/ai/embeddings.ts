import 'dotenv/config';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';

// ============================================================================
// Couche 2.1 — Génération d'embeddings OpenAI text-embedding-3-large
// ============================================================================

const BATCH_SIZE = 50;
const DELAY_MS = 2000;
const MODEL = 'text-embedding-3-large';
const DIMENSIONS = 3072;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('[COUCHE 2][EMBEDDINGS] Starting embedding generation');
  console.log(`  Model: ${MODEL} (${DIMENSIONS} dims)`);
  console.log(`  Batch size: ${BATCH_SIZE}, delay: ${DELAY_MS}ms\n`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  // Get episodes that need embeddings
  const episodes = await sql`
    SELECT e.id, e.episode_number, e.title, e.guest, e.pillar, e.difficulty, e.abstract,
           en.id as enrichment_id, en.tags, en.sub_themes, en.embedding
    FROM episodes e
    LEFT JOIN episodes_enrichment en ON en.episode_id = e.id
    ORDER BY e.episode_number DESC
  `;

  const needsEmbedding = episodes.filter((ep: any) => !ep.embedding);
  const alreadyDone = episodes.length - needsEmbedding.length;

  console.log(`  Total episodes: ${episodes.length}`);
  console.log(`  Already embedded: ${alreadyDone}`);
  console.log(`  Need embedding: ${needsEmbedding.length}\n`);

  if (needsEmbedding.length === 0) {
    console.log('[COUCHE 2][EMBEDDINGS] All episodes already have embeddings. Nothing to do.');
    return;
  }

  let processed = 0;
  let totalTokens = 0;
  const startTime = Date.now();

  for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsEmbedding.length / BATCH_SIZE);

    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} episodes)...`);

    // Build embedding text for each episode
    const texts = batch.map((ep: any) => {
      const parts = [
        ep.title || '',
        ep.guest ? `Invité: ${ep.guest}` : '',
        ep.abstract || '',
        ep.pillar ? `Pilier: ${ep.pillar}` : '',
        ep.difficulty ? `Niveau: ${ep.difficulty}` : '',
        (ep.tags || []).length ? `Tags: ${ep.tags.join(', ')}` : '',
        (ep.sub_themes || []).length ? `Sous-thèmes: ${ep.sub_themes.join(', ')}` : '',
      ].filter(Boolean);
      return parts.join(' | ');
    });

    try {
      const response = await openai.embeddings.create({
        model: MODEL,
        input: texts,
        dimensions: DIMENSIONS,
      });

      totalTokens += response.usage?.total_tokens || 0;

      // Store embeddings
      for (let j = 0; j < batch.length; j++) {
        const ep = batch[j];
        const embedding = response.data[j].embedding;

        if (ep.enrichment_id) {
          // Update existing enrichment row
          await sql`
            UPDATE episodes_enrichment
            SET embedding = ${`[${embedding.join(',')}]`}::vector
            WHERE id = ${ep.enrichment_id}
          `;
        } else {
          // Create enrichment row with embedding
          await sql`
            INSERT INTO episodes_enrichment (episode_id, tags, sub_themes, search_text, embedding)
            VALUES (${ep.id}, '{}', '{}', '', ${`[${embedding.join(',')}]`}::vector)
          `;
        }
        processed++;
      }

      console.log(`    ✓ ${processed}/${needsEmbedding.length} processed (${response.usage?.total_tokens || 0} tokens)`);
    } catch (error: any) {
      console.error(`    ✗ Batch ${batchNum} failed: ${error.message}`);
      if (error.status === 429) {
        console.log('    Rate limited — waiting 10s...');
        await sleep(10000);
        i -= BATCH_SIZE; // Retry
        continue;
      }
    }

    if (i + BATCH_SIZE < needsEmbedding.length) {
      await sleep(DELAY_MS);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const cost = (totalTokens / 1_000_000 * 0.13).toFixed(4); // $0.13 per 1M tokens

  console.log(`\n[COUCHE 2][EMBEDDINGS] === DONE ===`);
  console.log(`  Processed: ${processed}/${needsEmbedding.length}`);
  console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`  Estimated cost: $${cost}`);
  console.log(`  Time: ${elapsed}s`);
}

main().catch(e => { console.error('[COUCHE 2][EMBEDDINGS] FATAL:', e); process.exit(1); });
