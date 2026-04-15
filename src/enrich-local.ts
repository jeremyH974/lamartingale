import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Enrichissement LOCAL (sans API) - Genere tags, difficulty, quiz basiques
// a partir des donnees existantes (index + taxonomie)
// ============================================================================

interface IndexEpisode {
  id: number;
  guest: string;
  title: string;
  pillar: string;
  difficulty: string;
}

interface EnrichedEpisode extends IndexEpisode {
  tags: string[];
  difficulty_full: string;
  pillar_name: string;
  sub_themes: string[];
  quiz: QuizQuestion[];
  learning_paths: string[];
  search_text: string; // pour recherche full-text
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

// --- Tag extraction from title ---
const TAG_KEYWORDS: Record<string, string[]> = {
  immobilier: ['immobilier', 'immo', 'locatif', 'louer', 'acheter', 'residence', 'scpi', 'renovation', 'credit', 'pret', 'hotellerie', 'coliving', 'airbnb', 'marchand de biens', 'parkings', 'cave', 'logement', 'viager', 'leasing'],
  bourse: ['bourse', 'etf', 'actions', 'marches', 'trading', 'cac', 'small cap', 'dividende', 'produit structure', 'options', 'gestion passive', 'gestion active', 'value', 'momentum'],
  crypto: ['bitcoin', 'crypto', 'blockchain', 'nft', 'web3', 'defi', 'stablecoin', 'airdrop', 'memecoin', 'wallet', 'ledger', 'mining'],
  fiscalite: ['impot', 'fiscal', 'defiscalisation', 'girardin', 'per', 'holding', 'societe civile', 'donation', 'succession', 'cgp', 'notaire', 'assurance vie'],
  epargne: ['epargne', 'budget', 'economie', 'livret', 'placement garanti', 'sans risque', 'dca', 'dollar cost'],
  private_equity: ['private equity', 'startup', 'levee de fonds', 'business angel', 'venture', 'non cote', 'seed', 'vc'],
  alternatif: ['art', 'vin', 'montre', 'voiture', 'collection', 'or', 'foret', 'terre', 'agricole', 'carbone', 'sneaker', 'pokemon', 'luxe', 'sac', 'lego', 'photographie'],
  impact: ['impact', 'esg', 'isr', 'greenwashing', 'durable', 'responsable', 'climat', 'transition energetique', 'defense'],
  mindset: ['riche', 'millionnaire', 'fire', 'retraite', 'augmentation', 'negocier', 'carriere', 'biais', 'cerveau', 'psychologie', 'comportement'],
  patrimoine: ['patrimoine', 'couple', 'enfant', 'famille', 'succession', 'dependance', 'expatriation'],
};

function extractTags(title: string): string[] {
  const lower = title.toLowerCase();
  const tags: string[] = [];

  for (const [category, keywords] of Object.entries(TAG_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        tags.push(kw);
      }
    }
  }

  // Add year tags
  const yearMatch = title.match(/(202\d)/);
  if (yearMatch) tags.push(yearMatch[1]);

  return [...new Set(tags)];
}

// --- Pillar names ---
const PILLAR_NAMES: Record<string, string> = {
  IMMOBILIER: 'Immobilier',
  BOURSE: 'Bourse et marches financiers',
  CRYPTO: 'Crypto et Web3',
  ALTERNATIFS: 'Investissements alternatifs',
  PE_STARTUP: 'Private Equity et Startups',
  PATRIMOINE_FISCALITE: 'Gestion de patrimoine et fiscalite',
  FINANCES_PERSO: 'Finances personnelles et mindset',
  IMPACT_ESG: 'Impact, ESG et transition',
  CROWDFUNDING: 'Crowdfunding et dette privee',
  ENTREPRENEURIAT: 'Entrepreneuriat et side business',
};

const DIFFICULTY_MAP: Record<string, string> = {
  DEB: 'DEBUTANT',
  INT: 'INTERMEDIAIRE',
  AVA: 'AVANCE',
};

// --- Quiz generation from title ---
function generateQuiz(ep: IndexEpisode): QuizQuestion[] {
  const quiz: QuizQuestion[] = [];
  const pillarName = PILLAR_NAMES[ep.pillar] || ep.pillar;

  // Q1: Pillar question
  const wrongPillars = Object.values(PILLAR_NAMES).filter(p => p !== pillarName);
  const shuffled = wrongPillars.sort(() => Math.random() - 0.5).slice(0, 3);
  const correctIndex = Math.floor(Math.random() * 4);
  const options = [...shuffled];
  options.splice(correctIndex, 0, pillarName);

  quiz.push({
    question: `Dans quel pilier thematique se situe l'episode "#${ep.id} - ${ep.title}" ?`,
    options,
    correct_answer: correctIndex,
    explanation: `Cet episode avec ${ep.guest} traite de ${pillarName.toLowerCase()}.`,
  });

  // Q2: Guest question
  if (ep.guest) {
    quiz.push({
      question: `Qui est l'invite(e) de l'episode "#${ep.id}" intitule "${ep.title}" ?`,
      options: [
        ep.guest,
        'Matthieu Stefani',
        'Nicolas Cheron',
        'Mounir Laggoune',
      ].sort(() => Math.random() - 0.5),
      correct_answer: [ep.guest, 'Matthieu Stefani', 'Nicolas Cheron', 'Mounir Laggoune']
        .sort(() => Math.random() - 0.5)
        .indexOf(ep.guest),
      explanation: `L'invite de cet episode est ${ep.guest}.`,
    });

    // Fix: recalculate correct_answer after shuffle
    const q = quiz[quiz.length - 1];
    q.correct_answer = q.options.indexOf(ep.guest);
  }

  return quiz;
}

// --- Sub-theme detection ---
function detectSubThemes(title: string, pillar: string): string[] {
  const lower = title.toLowerCase();
  const themes: string[] = [];

  const subThemeMap: Record<string, [string, string[]][]> = {
    IMMOBILIER: [
      ['Locatif classique', ['locatif', 'louer', 'rentier', 'location']],
      ['SCPI', ['scpi', 'fractionne', 'papier']],
      ['Residence principale', ['residence', 'acheter', 'proprietaire']],
      ['Credit', ['credit', 'pret', 'emprunt', 'taux']],
      ['Renovation', ['renov', 'travaux', 'energetique']],
      ['Niches', ['hotellerie', 'parking', 'cave', 'coliving', 'airbnb', 'etudiant', 'vacances', 'dubai', 'espagne']],
    ],
    BOURSE: [
      ['ETF / Gestion passive', ['etf', 'gestion passive', 'dca']],
      ['Stock picking', ['action', 'trading', 'value', 'momentum', 'options']],
      ['Produits structures', ['produit structure', 'capital garanti']],
      ['Conjoncture', ['crise', 'inflation', 'bear', 'bull', 'marche', 'fitch']],
    ],
    CRYPTO: [
      ['Bitcoin', ['bitcoin', 'btc']],
      ['Altcoins / DeFi', ['defi', 'stablecoin', 'airdrop', 'memecoin', 'altcoin']],
      ['NFT / Web3', ['nft', 'web3']],
      ['Securite', ['wallet', 'ledger', 'securit', 'ftx']],
    ],
  };

  const pillarThemes = subThemeMap[pillar] || [];
  for (const [theme, keywords] of pillarThemes) {
    if (keywords.some(kw => lower.includes(kw))) {
      themes.push(theme);
    }
  }

  return themes;
}

// --- Learning path assignment ---
function assignLearningPaths(ep: IndexEpisode): string[] {
  const pathsData = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'learning-paths.json'), 'utf-8'
  ));

  const assigned: string[] = [];
  for (const lp of pathsData.learning_paths) {
    for (const step of lp.episodes_ordered) {
      if (step.episode_id === ep.id) {
        assigned.push(lp.id);
      }
    }
  }
  return assigned;
}

// ============================================================================
// Main
// ============================================================================
function main() {
  const indexPath = path.join(__dirname, '..', 'data', 'episodes-complete-index.json');
  const outputPath = path.join(__dirname, '..', 'data', 'episodes-ai-enriched.json');
  const quizPath = path.join(__dirname, '..', 'data', 'quiz-bank.json');

  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const episodes: IndexEpisode[] = indexData.episodes;

  console.log(`\n=== ENRICHISSEMENT LOCAL ===`);
  console.log(`Episodes a traiter: ${episodes.length}\n`);

  const enriched: EnrichedEpisode[] = [];
  const allQuiz: any[] = [];

  for (const ep of episodes) {
    const tags = extractTags(ep.title);
    const subThemes = detectSubThemes(ep.title, ep.pillar);
    const quiz = generateQuiz(ep);
    const learningPaths = assignLearningPaths(ep);

    const enrichedEp: EnrichedEpisode = {
      ...ep,
      tags,
      difficulty_full: DIFFICULTY_MAP[ep.difficulty] || ep.difficulty,
      pillar_name: PILLAR_NAMES[ep.pillar] || ep.pillar,
      sub_themes: subThemes,
      quiz,
      learning_paths: learningPaths,
      search_text: `${ep.id} ${ep.title} ${ep.guest} ${tags.join(' ')} ${PILLAR_NAMES[ep.pillar] || ''} ${subThemes.join(' ')}`.toLowerCase(),
    };

    enriched.push(enrichedEp);

    // Add quiz to bank
    for (const q of quiz) {
      allQuiz.push({
        episode_id: ep.id,
        episode_title: ep.title,
        pillar: ep.pillar,
        difficulty: DIFFICULTY_MAP[ep.difficulty] || ep.difficulty,
        ...q,
      });
    }

    console.log(`  #${ep.id}: ${tags.length} tags, ${subThemes.length} sub-themes, ${quiz.length} quiz, ${learningPaths.length} paths`);
  }

  // Stats
  const withTags = enriched.filter(e => e.tags.length > 0).length;
  const withSubThemes = enriched.filter(e => e.sub_themes.length > 0).length;
  const withPaths = enriched.filter(e => e.learning_paths.length > 0).length;

  console.log(`\n=== RESULTS ===`);
  console.log(`Episodes enriched: ${enriched.length}`);
  console.log(`  With tags: ${withTags} (${Math.round(withTags / enriched.length * 100)}%)`);
  console.log(`  With sub-themes: ${withSubThemes} (${Math.round(withSubThemes / enriched.length * 100)}%)`);
  console.log(`  With learning paths: ${withPaths}`);
  console.log(`  Total quiz questions: ${allQuiz.length}`);

  // Save enriched episodes
  fs.writeFileSync(outputPath, JSON.stringify({
    metadata: {
      last_updated: new Date().toISOString(),
      total_enriched: enriched.length,
      method: 'local-rule-based',
      quiz_count: allQuiz.length,
    },
    episodes: enriched,
  }, null, 2));
  console.log(`\nSaved to: ${outputPath}`);

  // Save quiz bank
  fs.writeFileSync(quizPath, JSON.stringify({
    metadata: {
      total_questions: allQuiz.length,
      generated_at: new Date().toISOString(),
      method: 'local-rule-based',
    },
    questions: allQuiz,
  }, null, 2));
  console.log(`Quiz bank: ${allQuiz.length} questions saved to ${quizPath}`);
}

main();
