// Enriched v2: article_content, key_takeaways, guest_bio, community_rating
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/api';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
