import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const DRY = process.argv.includes('--dry');

// Piliers manuels (en cohérence avec les pillars déjà présents dans episodes).
// On mappe le slug canonique -> nom lisible + couleur + icon.
const SEEDS: Record<string, Array<{pillar:string; name:string; color:string; icon:string; description:string}>> = {
  lepanier: [
    { pillar: 'FOOD_TECH', name: 'FoodTech & innovation alimentaire', color: '#F97316', icon: 'utensils', description: 'Startups qui réinventent l\'alimentation' },
    { pillar: 'DISTRIBUTION', name: 'Distribution & retail', color: '#2563EB', icon: 'store', description: 'Circuits, hypermarchés, épiceries' },
    { pillar: 'RESTAURATION', name: 'Restauration', color: '#DC2626', icon: 'chef-hat', description: 'Restaurants, cheffes et cuisiniers' },
    { pillar: 'ECOMMERCE', name: 'E-commerce alimentaire', color: '#0891B2', icon: 'shopping-cart', description: 'Vente en ligne, logistique, livraison' },
    { pillar: 'DTC_BRAND', name: 'Marques DNVB', color: '#9333EA', icon: 'tag', description: 'Digital native brands food' },
    { pillar: 'AGRICULTURE', name: 'Agriculture & production', color: '#16A34A', icon: 'leaf', description: 'Exploitations, producteurs, filière' },
    { pillar: 'MARQUE_GRANDE_CONSO', name: 'Grandes marques', color: '#EA580C', icon: 'building-2', description: 'Industriels, FMCG' },
    { pillar: 'FINANCEMENT', name: 'Financement & levées', color: '#BE185D', icon: 'banknote', description: 'VC, M&A, stratégies capital' },
    { pillar: 'IMPACT', name: 'Impact & durabilité', color: '#059669', icon: 'sprout', description: 'RSE, bio, circuit court' },
    { pillar: 'MEDIA_COMMUNICATION', name: 'Média & communication', color: '#7C3AED', icon: 'megaphone', description: 'Marketing, storytelling, influence' },
  ],
  passionpatrimoine: [
    { pillar: 'IMMOBILIER', name: 'Immobilier', color: '#2563EB', icon: 'building', description: 'Investissement locatif, SCPI, foncier' },
    { pillar: 'BOURSE', name: 'Bourse & marchés', color: '#16A34A', icon: 'trending-up', description: 'Actions, ETF, trading' },
    { pillar: 'FISCALITE', name: 'Fiscalité', color: '#0891B2', icon: 'receipt', description: 'Optimisation fiscale, niches' },
    { pillar: 'ASSURANCE_VIE', name: 'Assurance-vie & épargne', color: '#9333EA', icon: 'piggy-bank', description: 'AV, PEA, produits longs' },
    { pillar: 'TRANSMISSION', name: 'Transmission & succession', color: '#BE185D', icon: 'users', description: 'Donation, héritage, démembrement' },
    { pillar: 'RETRAITE', name: 'Retraite & prévoyance', color: '#EA580C', icon: 'shield', description: 'PER, prévoyance, longévité' },
    { pillar: 'CRYPTO', name: 'Crypto & actifs numériques', color: '#F59E0B', icon: 'bitcoin', description: 'Bitcoin, DeFi, Web3' },
    { pillar: 'ENTREPRISE', name: 'Entreprise & dirigeants', color: '#DC2626', icon: 'briefcase', description: 'Cession, rémunération, holding' },
    { pillar: 'ALTERNATIFS', name: 'Investissements alternatifs', color: '#7C3AED', icon: 'gem', description: 'Private equity, forêts, art' },
    { pillar: 'MINDSET_FINANCE', name: 'Mindset & éducation financière', color: '#059669', icon: 'brain', description: 'Psychologie, freedom, stratégie' },
  ],
  combiencagagne: [
    { pillar: 'TECH_DIGITAL', name: 'Tech & digital', color: '#2563EB', icon: 'laptop', description: 'Dev, product, data' },
    { pillar: 'SANTE', name: 'Santé & médical', color: '#DC2626', icon: 'stethoscope', description: 'Médecin, infirmier, pharmacien' },
    { pillar: 'ARTISANAT', name: 'Artisanat & métiers manuels', color: '#EA580C', icon: 'hammer', description: 'Boulanger, menuisier, plombier' },
    { pillar: 'FINANCE_BUSINESS', name: 'Finance & business', color: '#16A34A', icon: 'banknote', description: 'Trader, entrepreneur, consultant' },
    { pillar: 'JURIDIQUE', name: 'Juridique & public', color: '#9333EA', icon: 'scale', description: 'Avocat, notaire, fonctionnaire' },
    { pillar: 'CREATIF', name: 'Créatif & média', color: '#BE185D', icon: 'palette', description: 'Artiste, journaliste, designer' },
    { pillar: 'SERVICES', name: 'Services & commerce', color: '#0891B2', icon: 'store', description: 'Commerçant, hôtelier, service' },
    { pillar: 'EDUCATION', name: 'Éducation & recherche', color: '#059669', icon: 'graduation-cap', description: 'Prof, chercheur, formateur' },
    { pillar: 'SPORT_LOISIR', name: 'Sport & loisirs', color: '#F59E0B', icon: 'dumbbell', description: 'Coach, sportif pro, animation' },
    { pillar: 'INDUSTRIE_AGRI', name: 'Industrie & agriculture', color: '#7C3AED', icon: 'factory', description: 'Ingénieur, ouvrier, agriculteur' },
  ],
};

(async () => {
  // On vérifie d'abord quels pillars existent dans episodes mais pas dans taxonomy
  for (const tenant of Object.keys(SEEDS)) {
    const seeds = SEEDS[tenant];
    const existing = await sql`SELECT pillar FROM taxonomy WHERE tenant_id = ${tenant}` as any[];
    console.log(`\n=== ${tenant} ===`);
    console.log(`  existing taxonomy rows: ${existing.length}`);
    console.log(`  to seed: ${seeds.length}`);
    if (DRY) continue;

    for (const s of seeds) {
      await sql`
        INSERT INTO taxonomy (tenant_id, pillar, name, color, icon)
        VALUES (${tenant}, ${s.pillar}, ${s.name}, ${s.color}, ${s.icon})
        ON CONFLICT (tenant_id, pillar) DO UPDATE SET
          name = EXCLUDED.name,
          color = EXCLUDED.color,
          icon = EXCLUDED.icon
      `;
    }
    console.log(`  upserted ${seeds.length} pillars`);
  }

  // Audit final : pillars orphelins (présents dans episodes mais pas dans taxonomy)
  console.log('\n=== orphans (episodes.pillar sans taxonomy) ===');
  const orphans = await sql`
    SELECT e.tenant_id, e.pillar, count(*)::int as n
    FROM episodes e
    WHERE e.pillar IS NOT NULL AND e.pillar != ''
      AND NOT EXISTS (SELECT 1 FROM taxonomy t WHERE t.tenant_id = e.tenant_id AND t.pillar = e.pillar)
    GROUP BY e.tenant_id, e.pillar
    ORDER BY e.tenant_id, n DESC
  ` as any[];
  for (const o of orphans) console.log(`  ${o.tenant_id} / ${o.pillar} = ${o.n} eps`);
})();
