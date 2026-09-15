// lib/practitionerEmailTemplate.js — the practitioner-branded email shell
// (their own logo, business name, address), as opposed to lib/emailTemplate.js
// which is h_ld's own branded shell for system emails h_ld sends to
// practitioners themselves (MFA codes, password resets).
//
// This is a direct port of buildEmailHtml()/getEmailLogoSrc() from
// admin.html, which until now only ever ran client-side — used when a
// practitioner creates/edits a booking from the admin panel. Bookings
// created via the public booking page are handled entirely server-side
// (api/bookings/index.js), so that path had no way to reach this logic at
// all, and fell back to h_ld's own system-email template instead —
// which is why a client confirmation's branding depended on which path
// created the booking. Ported here so both paths use the exact same
// practitioner-branded output.

export function getEmailLogoSrc(settings, org) {
  return settings?.logoUrl || `https://${org.subdomain}.h-ld.com/logo-placeholder.svg`;
}

export function buildPractitionerEmailHtml(body, settings, org) {
  let text = body;
  if (typeof text === 'string' && text.startsWith('"')) {
    try { text = JSON.parse(text); } catch {}
  }
  const bizName = settings?.bizName || 'Your Business';
  const address = settings?.address || '';

  const lines = (text || '').split('\n');
  let html = '';
  let inDetails = false;

  lines.forEach(line => {
    const t = line.trim();
    if (!t) {
      if (inDetails) { html += '<hr style="border:none;border-top:1px solid #E0E8E4;margin:16px 0">'; inDetails = false; }
      return;
    }
    if (t.startsWith('https://') && t.includes('/intake.html')) {
      html += `<div style="margin:16px 0;text-align:center"><a href="${t}" style="display:inline-block;background:#3D6B5C;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">Complete Intake Form</a></div>`;
      return;
    }
    if (t.startsWith('https://') && t.includes('/api/calendar/ics')) {
      html += `<div style="margin:16px 0;text-align:center"><a href="${t}" style="display:inline-block;background:#fff;color:#3D6B5C;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;font-size:15px;border:1.5px solid #3D6B5C">Add to Calendar</a></div>`;
      return;
    }
    const isDetail = /^(Service|Date|Time|Duration|Location|Price):/.test(t);
    if (isDetail && !inDetails) {
      html += '<hr style="border:none;border-top:1px solid #E0E8E4;margin:16px 0">';
      inDetails = true;
    }
    const locationMatch = t.match(/^Location:\s*(https?:\/\/\S+)\s*$/i);
    if (locationMatch) {
      html += `<p style="margin:6px 0;font-size:15px;line-height:1.6">Location: <a href="${locationMatch[1]}" style="color:#3D6B5C;text-decoration:underline">${locationMatch[1]}</a></p>`;
      return;
    }
    html += `<p style="margin:6px 0;font-size:15px;line-height:1.6">${t}</p>`;
  });

  if (inDetails) html += '<hr style="border:none;border-top:1px solid #E0E8E4;margin:16px 0">';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#EEF3F1;margin:0;padding:20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="padding:28px 32px 0">
    <img src="${getEmailLogoSrc(settings, org)}" style="width:100px;display:block;margin-bottom:24px" alt="${bizName}">
    <hr style="border:none;border-top:1px solid #E0E8E4;margin:0 0 20px">
    ${html}
  </div>
  <div style="padding:20px 32px;background:#f8faf9;margin-top:24px;text-align:center">
    <p style="margin:0;font-size:12px;color:#888">${bizName} &mdash; ${address}</p>
  </div>
</div>
<div style="max-width:560px;margin:32px auto 0;text-align:center">
  <img src="https://h-ld.com/email-logo-poweredby.png" alt="Powered by h_ld. — scheduling system" width="220" style="display:inline-block;width:220px;height:auto;border:0">
  <hr style="border:none;border-top:1px solid #DEE3E6;margin:24px 32px 0">
  <p style="margin:16px 32px 0;font-size:12px;color:#686F72;line-height:1.6">h_ld is a Designlinc product. Copyright &copy; ${new Date().getFullYear()} Designlinc.<br>All rights reserved. Mountain Creek QLD Australia.</p>
</div>
</body></html>`;
}
