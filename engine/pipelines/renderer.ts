import type { PackOutput, PackOutputFormat } from './runPack';

// Renderer — séparé du pipeline d'exécution.
//
// Règle anti-overgeneralization :
// - PackRendererOptions est minimal (format only). Pas de toggles
//   "au cas où" sans cas présent.
// - renderPackToMarkdown est restrictif au format 'markdown' du pilote.
//   Les renderers pour 'audio'/'google-docs'/'pdf'/'html-newsletter'
//   seront ajoutés en fonctions séparées quand chaque format atterrira
//   (cf ROADMAP_INTERNE.md P2).

export interface PackRendererOptions {
  format: PackOutputFormat;
}

export function renderPackToMarkdown(
  output: PackOutput,
  options?: Partial<PackRendererOptions>,
): string {
  // Volontairement non-implémenté : on a besoin d'au moins un PackOutput
  // produit par un vrai pack (lundi-mardi) pour figer le format markdown
  // (sections, ordre, ce qui reste interne vs ce qui est livré).
  void output;
  void options;
  throw new Error('renderPackToMarkdown: not implemented yet — needs pack outputs first');
}
