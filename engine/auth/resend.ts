/**
 * Resend — envoi du magic-link par email.
 *
 * Config :
 *   - RESEND_API_KEY  : clé API Resend (https://resend.com/api-keys)
 *   - AUTH_FROM_EMAIL : from address (fallback: onboarding@resend.dev sans DNS)
 *   - AUTH_BASE_URL   : URL de base du hub (ex: https://ms-hub.vercel.app)
 *
 * En l'absence de RESEND_API_KEY (dev local) : mode noop qui logge le lien dans la
 * console Express. Permet de tester le flow sans compte Resend.
 */

import { Resend } from 'resend';

const DEFAULT_FROM = 'onboarding@resend.dev';

function renderHtml(link: string, baseUrl: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif; color: #0a0a0a; background: #f5f5f5; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px 32px;">
    <div style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #7a7a7a; margin-bottom: 16px;">Univers MS</div>
    <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px 0; letter-spacing: -0.02em;">Ton lien de connexion</h1>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0;">
      Clique sur le bouton ci-dessous pour accéder au hub créateur. Le lien est valable <strong>15 minutes</strong> et utilisable <strong>une seule fois</strong>.
    </p>
    <a href="${link}" style="display: inline-block; padding: 14px 28px; border-radius: 99px; background: #0a0a0a; color: #ffffff; font-weight: 600; text-decoration: none; font-size: 14px;">Se connecter au hub</a>
    <p style="color: #7a7a7a; font-size: 13px; line-height: 1.5; margin: 32px 0 0 0;">
      Si tu n'as pas demandé cet email, tu peux l'ignorer sans risque. Aucun compte n'a été créé.
    </p>
    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
    <p style="color: #7a7a7a; font-size: 12px; line-height: 1.5; margin: 0; word-break: break-all;">
      Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br>
      <a href="${link}" style="color: #0a0a0a;">${link}</a>
    </p>
    <p style="color: #b5b5b5; font-size: 11px; margin: 16px 0 0 0;">${baseUrl}</p>
  </div>
</body>
</html>`;
}

export interface SendMagicLinkInput {
  email: string;
  token: string;
  baseUrl: string;
}

export interface SendMagicLinkResult {
  sent: boolean;
  provider: 'resend' | 'noop';
  id?: string;
  error?: string;
  link: string; // exposé en dev pour le flow noop
}

export async function sendMagicLink(input: SendMagicLinkInput): Promise<SendMagicLinkResult> {
  const { email, token, baseUrl } = input;
  const link = `${baseUrl.replace(/\/$/, '')}/api/auth/consume?token=${encodeURIComponent(token)}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev / CI fallback : log le lien, ne tente pas d'envoyer.
    console.log(`[auth] RESEND_API_KEY absent — mode noop. Magic link pour ${email} : ${link}`);
    return { sent: false, provider: 'noop', link };
  }

  const from = process.env.AUTH_FROM_EMAIL || DEFAULT_FROM;
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: email,
      subject: 'Ton lien de connexion à Univers MS',
      html: renderHtml(link, baseUrl),
    });
    if (error) {
      console.error('[auth] Resend error:', error);
      return { sent: false, provider: 'resend', error: String((error as any).message || error), link };
    }
    return { sent: true, provider: 'resend', id: data?.id, link };
  } catch (e: any) {
    console.error('[auth] Resend exception:', e.message);
    return { sent: false, provider: 'resend', error: e.message, link };
  }
}
