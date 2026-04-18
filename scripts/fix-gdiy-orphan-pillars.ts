import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
(async () => {
  const valid = [
    'BUSINESS','FRENCH_TECH','AI_DATA','LEVEE_FONDS','INVESTISSEMENT','LICORNES',
    'CRYPTO_NFT','ECO_ENV','SPORT','ART','MEDIA_INFLUENCEURS','SANTE',
    'SCIENCES_SOCIALES','RESILIENCE','MOBILITE','GASTRONOMIE','MODE','SAAS','EARLY_STAGE',
  ];
  const res = await sql`
    UPDATE episodes SET pillar='BUSINESS'
    WHERE tenant_id='gdiy' AND pillar <> ALL(${valid})
    RETURNING episode_number, pillar
  ` as any[];
  console.log(`fixed ${res.length} orphan episodes to BUSINESS`);
})();
