import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

// ============================================================================
// Couche 3.3 — Quiz adaptatif (IRT simplifié)
// ============================================================================

export interface QuizProfile {
  scores: Record<string, number>;    // pillar → score 0-100
  counts: Record<string, number>;    // pillar → nb questions répondues
  theta: Record<string, number>;     // pillar → niveau estimé (-3 to 3)
  history: number[];                 // question IDs déjà vues
}

export interface AdaptiveQuestion {
  id: number;
  episode_id: number | null;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  difficulty: string;
  pillar: string;
  strategy: 'exploration' | 'exploitation';
  target_pillar: string;
}

export interface AnswerResult {
  correct: boolean;
  updated_profile: QuizProfile;
  recommended_episode: {
    episode_number: number;
    title: string;
    pillar: string;
    similarity: number;
  } | null;
  explanation: string;
}

const DIFFICULTY_THETA: Record<string, number> = {
  DEBUTANT: -1,
  INTERMEDIAIRE: 0,
  AVANCE: 1,
};

const ALL_PILLARS = [
  'IMMOBILIER', 'BOURSE', 'CRYPTO', 'ALTERNATIFS', 'PE_STARTUP',
  'PATRIMOINE_FISCALITE', 'FINANCES_PERSO', 'IMPACT_ESG', 'CROWDFUNDING', 'ENTREPRENEURIAT',
];

export function initProfile(): QuizProfile {
  return {
    scores: Object.fromEntries(ALL_PILLARS.map(p => [p, 50])),
    counts: Object.fromEntries(ALL_PILLARS.map(p => [p, 0])),
    theta: Object.fromEntries(ALL_PILLARS.map(p => [p, 0])),
    history: [],
  };
}

export async function getNextQuestion(profile: QuizProfile): Promise<AdaptiveQuestion | null> {
  const sql = neon(process.env.DATABASE_URL!);

  // Strategy: explore pillars with fewest questions, or exploit uncertain ones
  let strategy: 'exploration' | 'exploitation';
  let targetPillar: string;

  const minCount = Math.min(...ALL_PILLARS.map(p => profile.counts[p] || 0));
  const underExplored = ALL_PILLARS.filter(p => (profile.counts[p] || 0) === minCount);

  if (underExplored.length > 3 || minCount < 2) {
    // Exploration: pick least-explored pillar
    strategy = 'exploration';
    targetPillar = underExplored[Math.floor(Math.random() * underExplored.length)];
  } else {
    // Exploitation: pick pillar with most uncertain theta (closest to 0)
    strategy = 'exploitation';
    const sorted = ALL_PILLARS
      .filter(p => (profile.counts[p] || 0) >= 2)
      .sort((a, b) => Math.abs(profile.theta[a] || 0) - Math.abs(profile.theta[b] || 0));
    targetPillar = sorted[0] || underExplored[0];
  }

  // Find best question: difficulty closest to theta
  const theta = profile.theta[targetPillar] || 0;
  const targetDiff = theta < -0.5 ? 'DEBUTANT' : theta > 0.5 ? 'AVANCE' : 'INTERMEDIAIRE';
  const historyIds = profile.history.length > 0 ? profile.history : [0];

  // Query: get question matching pillar + difficulty, not yet seen
  const questions = await sql`
    SELECT id, episode_id, question, options, correct_answer, explanation, difficulty, pillar
    FROM quiz_questions
    WHERE pillar = ${targetPillar}
      AND id != ALL(${historyIds}::int[])
    ORDER BY
      CASE WHEN difficulty = ${targetDiff} THEN 0
           WHEN difficulty = 'INTERMEDIAIRE' THEN 1
           ELSE 2 END,
      RANDOM()
    LIMIT 1
  `;

  if (questions.length === 0) {
    // Fallback: any unseen question
    const fallback = await sql`
      SELECT id, episode_id, question, options, correct_answer, explanation, difficulty, pillar
      FROM quiz_questions
      WHERE id != ALL(${historyIds}::int[])
      ORDER BY RANDOM()
      LIMIT 1
    `;
    if (fallback.length === 0) return null;
    const q = fallback[0];
    return {
      id: q.id,
      episode_id: q.episode_id,
      question: q.question,
      options: q.options as string[],
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'INTERMEDIAIRE',
      pillar: q.pillar || targetPillar,
      strategy,
      target_pillar: targetPillar,
    };
  }

  const q = questions[0];
  return {
    id: q.id,
    episode_id: q.episode_id,
    question: q.question,
    options: q.options as string[],
    correct_answer: q.correct_answer,
    explanation: q.explanation || '',
    difficulty: q.difficulty || 'INTERMEDIAIRE',
    pillar: q.pillar || targetPillar,
    strategy,
    target_pillar: targetPillar,
  };
}

export async function processAnswer(
  questionId: number,
  selectedAnswer: number,
  profile: QuizProfile
): Promise<AnswerResult> {
  const sql = neon(process.env.DATABASE_URL!);

  // Get the question
  const [q] = await sql`SELECT * FROM quiz_questions WHERE id = ${questionId}`;
  if (!q) throw new Error('Question not found');

  const correct = selectedAnswer === q.correct_answer;
  const pillar = q.pillar || 'FINANCES_PERSO';
  const difficulty = q.difficulty || 'INTERMEDIAIRE';

  // Update profile
  const updatedProfile = { ...profile };
  updatedProfile.history = [...(profile.history || []), questionId];
  updatedProfile.counts[pillar] = (profile.counts[pillar] || 0) + 1;

  // Update score (running average)
  const oldScore = profile.scores[pillar] || 50;
  const delta = correct ? 10 : -5;
  updatedProfile.scores[pillar] = Math.max(0, Math.min(100, oldScore + delta));

  // Bayesian theta update (simplified)
  const oldTheta = profile.theta[pillar] || 0;
  const diffTheta = DIFFICULTY_THETA[difficulty] || 0;
  const stepSize = 0.3;
  if (correct) {
    updatedProfile.theta[pillar] = oldTheta + stepSize * (1 - sigmoid(oldTheta - diffTheta));
  } else {
    updatedProfile.theta[pillar] = oldTheta - stepSize * sigmoid(oldTheta - diffTheta);
  }

  // Recommend similar episode (via similarity table)
  let recommendedEpisode = null;
  if (q.episode_id) {
    const similar = await sql`
      SELECT e2.episode_number, e2.title, e2.pillar, es.similarity_score
      FROM episode_similarities es
      INNER JOIN episodes e2 ON e2.id = es.similar_episode_id
      WHERE es.episode_id = ${q.episode_id}
      ORDER BY es.similarity_score DESC
      LIMIT 1
    `;
    if (similar.length) {
      recommendedEpisode = {
        episode_number: similar[0].episode_number,
        title: similar[0].title,
        pillar: similar[0].pillar,
        similarity: Number(similar[0].similarity_score),
      };
    }
  }

  return {
    correct,
    updated_profile: updatedProfile,
    recommended_episode: recommendedEpisode,
    explanation: q.explanation || '',
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
