// lib/emailTemplate.js — shared HTML shell for every system email h_ld.
// sends to practitioners (MFA codes, password resets, admin notifications).
// Centralizing this means every one of those gets the same real branding
// instead of each route hand-rolling its own plain <p> tags.
//
// Palette below is sampled directly from the reference design (peach card,
// black text, teal accent) rather than the app's own UI tokens — this is a
// deliberately distinct "marketing/brand" look for system email, not meant
// to match the in-app color system.
const PEACH        = '#FEEEE1'; // card background
const PEACH_BORDER = '#EFCBBD'; // code box border
const DIVIDER      = '#F5DACF'; // thin rule under the logo
const INK          = '#1A1A1A'; // headings, body copy, code digits
const TEAL         = '#71ABA5'; // "Bridging the gap..." tagline + h-ld.com
const FOOTER_GRAY  = '#6F6F71'; // disclaimer / copyright line
const SERIF        = "Georgia,'Times New Roman',Times,serif";
const SANS         = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

// Real logo assets (supplied vector files, rasterized to PNG for email-client
// compatibility — most clients, Outlook especially, don't render inline SVG
// reliably). Same ROOT_DOMAIN pattern already used for reset/consent links
// elsewhere, so these stay correct across local/staging/production.
const ROOT_DOMAIN     = process.env.ROOT_DOMAIN || 'h-ld.com';
const HEADER_LOGO_URL = `https://${ROOT_DOMAIN}/email-logo-header.png`; // "h_ld." + "scheduling system" descriptor
const FOOTER_LOGO_URL = `https://${ROOT_DOMAIN}/email-logo-footer.png`; // "h_ld." + "space makers" byline

// TODO: confirm this against your actual support inbox — h-ld.com's domain
// is already used for the sending address elsewhere (noreply@h-ld.com), so
// this assumes the matching support@ address exists. Update if not.
const SUPPORT_EMAIL = 'support@h-ld.com';

export function renderEmail({ bodyHtml, footerText }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:32px 16px;background:#FFFFFF;font-family:${SANS};-webkit-font-smoothing:antialiased">
  <div style="max-width:520px;margin:0 auto">

    <div style="background:${PEACH};border-radius:28px;padding:40px 36px">
      <img src="${HEADER_LOGO_URL}" alt="h_ld. — scheduling system" width="220" style="display:block;width:220px;height:auto;border:0">
      <div style="border-top:1px solid ${DIVIDER};margin:24px 0"></div>
      ${bodyHtml}
    </div>

    <div style="padding:32px 20px 0">
      <table role="presentation" width="100%" style="border-collapse:collapse">
        <tr>
          <td style="font-family:${SERIF};font-weight:700;font-size:21px;line-height:1.35;color:${TEAL};vertical-align:top">
            Bridging the gap between<br>being fully booked<br>and fully present.
          </td>
          <td style="text-align:right;vertical-align:top;white-space:nowrap;padding-left:16px">
            <img src="${FOOTER_LOGO_URL}" alt="h_ld. — space makers" width="140" style="display:inline-block;width:140px;height:auto;border:0">
            <div style="font-family:${SERIF};font-weight:700;font-style:italic;font-size:13px;color:${TEAL};margin-top:12px">[ h-ld.com ]</div>
          </td>
        </tr>
      </table>

      <div style="border-top:1px solid #E5E1DE;margin:20px 0"></div>

      <p style="margin:0 0 8px;font-size:12px;color:${FOOTER_GRAY};line-height:1.6;font-family:${SANS}">${footerText || "If you didn't request this, ignore this email. h_ld will never ask for this code by phone, chat, or email."}</p>
      <p style="margin:0;font-size:12px;color:${FOOTER_GRAY};line-height:1.6;font-family:${SANS}">h_ld is a Designlinc product. Copyright &copy; ${year} Designlinc. All rights reserved. Mountain Creek QLD Australia.</p>
    </div>

  </div>
</body>
</html>`;
}

// A 6-digit code in a prominent callout box — used by both practitioner
// and super-admin MFA emails.
export function codeBlockHtml(code, ttlMinutes) {
  return `
    <p style="margin:0 0 20px;font-size:15px;color:${INK};line-height:1.6;font-family:${SANS}">This one-time code will allow you to sign in to your account. Enter this code within the next ${ttlMinutes} minutes to sign in:</p>
    <div style="background:${PEACH};border:1px solid ${PEACH_BORDER};border-radius:10px;padding:16px 22px;display:inline-block;margin:0 0 24px">
      <span style="font-family:${SANS};font-size:26px;font-weight:800;letter-spacing:8px;color:${INK}">${code}</span>
    </div>
    <p style="margin:0 0 12px;font-size:13px;color:${INK};line-height:1.6;font-family:${SANS}">Your account can't be accessed without this authentication code, even if you didn't submit this request.</p>
    <p style="margin:0;font-size:13px;color:${INK};line-height:1.6;font-family:${SANS}">If you have any questions, please contact <a href="mailto:${SUPPORT_EMAIL}" style="color:${INK};text-decoration:underline">Support</a>.</p>
  `;
}

// A single call-to-action button — used by password reset and
// impersonation consent request emails.
export function buttonHtml(url, label) {
  return `
    <div style="margin:24px 0">
      <a href="${url}" style="display:inline-block;background:${INK};color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px;font-family:${SANS}">${label}</a>
    </div>
  `;
}
