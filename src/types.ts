// ============================================================================
// La Martingale - Data Models for Financial Education Project
// ============================================================================

// --- Enums ---

export type EpisodeFormat = 'INTERVIEW' | 'ALLO_LIVE' | 'HORS_SERIE' | 'SPONSOR';

export type Pillar =
  | 'IMMOBILIER'
  | 'BOURSE'
  | 'CRYPTO'
  | 'ALTERNATIFS'
  | 'PE_STARTUP'
  | 'PATRIMOINE_FISCALITE'
  | 'FINANCES_PERSO'
  | 'IMPACT_ESG'
  | 'CROWDFUNDING'
  | 'ENTREPRENEURIAT';

export type Difficulty = 'DEBUTANT' | 'INTERMEDIAIRE' | 'AVANCE';

// --- Core Models ---

export interface Episode {
  id: number;
  title: string;
  guest_name: string;
  guest_company: string;
  format: EpisodeFormat;
  pillar: Pillar;
  sub_theme: string;
  tags: string[];
  difficulty: Difficulty;
  learning_paths: string[];
  url: string;
  publication_date?: string; // DD.MM.YYYY
  key_takeaways?: string[];
  related_episodes?: number[];
  apple_podcast_url?: string;
  spotify_url?: string;
  deezer_url?: string;
  article_content?: string;
  community_rating?: number;
}

export interface Expert {
  id: string;
  name: string;
  company: string;
  specialty: string[];
  episodes: number[];
  hors_series?: string[];
  authority_score: number; // 1-5, based on appearances and relevance
  bio: string;
}

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  estimated_hours: number;
  target_audience: string;
  prerequisites: string[];
  episodes_ordered: LearningPathStep[];
  outcomes: string[];
}

export interface LearningPathStep {
  order: number;
  episode_id: number;
  why: string; // Why this episode is at this position
}

export interface SubTheme {
  id: string;
  name: string;
  episodes: number[];
}

export interface PillarDefinition {
  id: Pillar;
  name: string;
  icon: string;
  color: string;
  episode_count: number;
  sub_themes: SubTheme[];
}

export interface CrossCuttingTheme {
  id: string;
  name: string;
  episodes: number[];
  description: string;
}

export interface Taxonomy {
  pillars: PillarDefinition[];
  cross_cutting_themes: CrossCuttingTheme[];
}

// --- User Profile for Recommendation Engine ---

export interface UserProfile {
  age_range: '18-25' | '25-35' | '35-45' | '45-55' | '55+';
  patrimony_level: 'NONE' | 'STARTER' | 'GROWING' | 'ESTABLISHED' | 'WEALTHY';
  investment_experience: Difficulty;
  interests: Pillar[];
  completed_episodes: number[];
  completed_paths: string[];
  goals: InvestmentGoal[];
}

export type InvestmentGoal =
  | 'BUILD_SAVINGS'        // Constituer une epargne
  | 'BUY_HOME'             // Acheter sa RP
  | 'INVEST_REAL_ESTATE'   // Investir dans l'immobilier locatif
  | 'GROW_PORTFOLIO'       // Faire fructifier un portefeuille
  | 'PREPARE_RETIREMENT'   // Preparer sa retraite
  | 'REDUCE_TAXES'         // Optimiser sa fiscalite
  | 'DIVERSIFY'            // Diversifier ses placements
  | 'FINANCIAL_FREEDOM'    // Atteindre l'independance financiere
  | 'FAMILY_WEALTH'        // Patrimoine familial
  | 'CRYPTO_EXPOSURE'      // S'exposer aux cryptos
  | 'IMPACT_INVESTING';    // Investir responsable

// --- Quiz / Gamification ---

export interface QuizQuestion {
  episode_id: number;
  question: string;
  options: string[];
  correct_answer: number; // index
  explanation: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: BadgeCondition;
}

export type BadgeCondition =
  | { type: 'complete_path'; path_id: string }
  | { type: 'episodes_count'; count: number }
  | { type: 'pillar_mastery'; pillar: Pillar; min_episodes: number }
  | { type: 'streak'; days: number };

// --- Recommendation Engine ---

export interface Recommendation {
  episode: Episode;
  score: number; // 0-100
  reasons: string[];
}

export function getRecommendations(
  profile: UserProfile,
  episodes: Episode[],
  maxResults: number = 10
): Recommendation[] {
  const completed = new Set(profile.completed_episodes || []);
  const recommendations: Recommendation[] = [];

  const diffOrder: Record<string, number> = { DEBUTANT: 0, INTERMEDIAIRE: 1, AVANCE: 2 };
  const userLevel = diffOrder[profile.investment_experience] ?? 1;

  const goalPillarMap: Record<string, Pillar[]> = {
    BUILD_SAVINGS:      ['FINANCES_PERSO', 'PATRIMOINE_FISCALITE'],
    BUY_HOME:           ['IMMOBILIER'],
    INVEST_REAL_ESTATE: ['IMMOBILIER', 'CROWDFUNDING'],
    GROW_PORTFOLIO:     ['BOURSE', 'PE_STARTUP'],
    PREPARE_RETIREMENT: ['PATRIMOINE_FISCALITE', 'FINANCES_PERSO'],
    REDUCE_TAXES:       ['PATRIMOINE_FISCALITE'],
    DIVERSIFY:          ['ALTERNATIFS', 'PE_STARTUP', 'CRYPTO'],
    FINANCIAL_FREEDOM:  ['FINANCES_PERSO', 'IMMOBILIER'],
    FAMILY_WEALTH:      ['PATRIMOINE_FISCALITE'],
    CRYPTO_EXPOSURE:    ['CRYPTO'],
    IMPACT_INVESTING:   ['IMPACT_ESG'],
  };

  for (const ep of episodes) {
    if (completed.has(ep.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    // 1. Pillar match with user interests (+30)
    if (profile.interests.includes(ep.pillar)) {
      score += 30;
      reasons.push(`Correspond a votre interet pour ${ep.pillar.toLowerCase().replace(/_/g, ' ')}`);
    }

    // 2. Difficulty match with experience (+20)
    const epLevel = diffOrder[ep.difficulty] ?? 1;
    if (epLevel === userLevel) {
      score += 20;
      reasons.push('Niveau adapte a votre experience');
    } else if (epLevel === userLevel + 1) {
      score += 10;
      reasons.push('Un cran au-dessus pour progresser');
    } else if (epLevel > userLevel + 1) {
      score -= 10;
    }

    // 3. Goal alignment (+25)
    for (const goal of (profile.goals || [])) {
      const pillars = goalPillarMap[goal] || [];
      if (pillars.includes(ep.pillar)) {
        score += 25;
        reasons.push(`Aligne avec votre objectif : ${goal.toLowerCase().replace(/_/g, ' ')}`);
        break;
      }
    }

    // 4. Not yet completed bonus (+15 already handled by skipping completed)
    // 5. Learning path progression (+10)
    if ((ep.learning_paths || []).length > 0) {
      score += 10;
      reasons.push('Fait partie d\'un parcours pedagogique');
    }

    // 6. Recency bonus (+5 for recent episodes)
    if (ep.id >= 280) {
      score += 5;
      reasons.push('Episode recent');
    }

    if (score > 0) {
      recommendations.push({ episode: ep, score, reasons });
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// --- Knowledge Graph ---

export interface EpisodeRelation {
  source: number; // episode_id
  target: number; // episode_id
  relation_type: 'same_expert' | 'same_theme' | 'referenced' | 'sequel' | 'prerequisite';
}

export interface KnowledgeGraph {
  nodes: Episode[];
  edges: EpisodeRelation[];
}
