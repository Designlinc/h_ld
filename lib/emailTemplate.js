// lib/emailTemplate.js — shared HTML shell for every system email h_ld.
// sends. Centralizing this means MFA codes, password resets, and admin
// notifications all get the same real branding (logo, colours, layout)
// instead of each route hand-rolling its own plain <p> tags — which is
// what MFA/reset emails looked like before this existed, next to a
// properly designed client-facing booking confirmation.
export function renderEmail({ bodyHtml, footerText }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:24px;background:#F5F2F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased">
  <div style="max-width:520px;margin:0 auto">
    <div style="text-align:center;padding:8px 0 24px">
      <span style="font-size:24px;font-weight:800;color:#231F20;letter-spacing:-0.5px">h_ld<span style="color:#D84148">.</span></span>
    </div>
    <div style="background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06)">
      <div style="padding:32px">
        ${bodyHtml}
      </div>
    </div>
    <div style="text-align:center;padding:20px 12px 0">
      <p style="margin:0;font-size:12px;color:#8A868A">${footerText || 'h_ld. — scheduling made simple'}</p>
    </div>
  </div>
</body>
</html>`;
}

// A 6-digit code in a prominent callout box — used by both practitioner
// and super-admin MFA emails.
export function codeBlockHtml(code, ttlMinutes) {
  return `
    <p style="margin:0 0 8px;font-size:15px;color:#231F20;line-height:1.6">Your login code is:</p>
    <div style="background:#F7F5F4;border-radius:10px;padding:18px;text-align:center;margin:16px 0">
      <span style="font-size:30px;font-weight:800;letter-spacing:8px;color:#231F20">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;color:#8A868A;line-height:1.6">This code expires in ${ttlMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
  `;
}

// A single call-to-action button — used by password reset and
// impersonation consent request emails.
export function buttonHtml(url, label) {
  return `
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#D84148;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px">${label}</a>
    </div>
  `;
}
