// api/auth/xero.js — Xero OAuth (initiate + callback combined), same shape
// as api/auth/google.js and api/auth/square.js.
//
// One thing Xero needs that the others don't: a "tenant ID" — Xero calls
// each connected organisation a tenant, and every API call after connecting
// has to say which one. Fetched once right after the token exchange and
// stored in oauth_tokens.metadata alongside everything else.
//
// It also needs to know which bank account to record payments against when
// syncing a paid invoice — Xero has no concept of "just mark it paid" the
// way Square does, a payment has to land against a real account in the
// practitioner's chart of accounts. Rather than adding an extra step to
// this connect flow (which every other provider here is deliberately a
// single click), this auto-selects the practitioner's first bank-type
// account and stores it. Good enough for the common case of one practice
// bank account; if that ever needs to be a real choice, that's a Settings-
// page addition for later, not something worth complicating this flow for
// today.
import sql from '../../lib/db.js';
import { requireAuth, signToken, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

const REDIRECT_URI = process.env.XERO_REDIRECT_URI;
// Xero replaced the old broad `accounting.transactions` scope with
// granular ones on 2 March 2026 — any app created after that date (which
// this one is) has no access to the broad scope at all and gets rejected
// with invalid_scope if it's requested. accounting.transactions covered
// both invoices and payments; split here into the two granular
// replacements since this integration needs to create both. Contacts and
// settings scopes weren't part of that change, so those stayed as-is.
const XERO_SCOPES = 'openid profile email accounting.invoices accounting.payments accounting.contacts accounting.settings.read offline_access';

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  // ── Callback from Xero ──
  if (code || error) {
    if (error || !code) return res.redirect('https://h-ld.com/?xero_error=1');

    const decoded = verifyToken(state);
    if (!decoded || decoded.purpose !== 'xero_oauth') {
      return res.redirect('https://h-ld.com/?xero_error=1');
    }
    const { practitioner_id: practitionerId, subdomain } = decoded;
    const failRedirect = `https://${subdomain}.h-ld.com/admin.html?xero_error=1`;

    try {
      const tokenRes = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Xero's documented method for confidential (server-side) clients —
          // client credentials go in the Authorization header, not the body.
          Authorization: 'Basic ' + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({ code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) {
        console.error('Xero token exchange failed:', JSON.stringify(tokens));
        return res.redirect(failRedirect);
      }

      // Which organisation(s) this token can act on — almost always exactly
      // one, since the consent screen only offered whichever org the
      // practitioner picked during sign-in.
      const connRes = await fetch('https://api.xero.com/connections', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const connections = await connRes.json();
      const tenant = connections[0];
      if (!tenant) {
        console.error('Xero: no tenant returned from /connections');
        return res.redirect(failRedirect);
      }

      // Pick a bank account to record payments against — first BANK-type
      // account in their chart of accounts. See file header for why this
      // is auto-selected rather than an extra step in this flow.
      let defaultBankAccountId = null;
      let defaultBankAccountName = null;
      try {
        const acctRes = await fetch('https://api.xero.com/api.xro/2.0/Accounts?where=Type%3D%3D%22BANK%22', {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            'Xero-tenant-id': tenant.tenantId,
            Accept: 'application/json',
          },
        });
        const acctData = await acctRes.json();
        const account = acctData.Accounts?.[0];
        if (account) {
          defaultBankAccountId = account.AccountID;
          defaultBankAccountName = account.Name;
        }
      } catch (err) {
        // Not fatal — the connection itself still succeeded. Without a bank
        // account, invoice sync will fail with a clear "no bank account
        // configured" error rather than silently doing nothing, so this is
        // safe to leave unset and surface later rather than block here.
        console.error('Xero: could not fetch bank accounts:', err.message);
      }

      await sql`
        INSERT INTO oauth_tokens (practitioner_id, provider, access_token, refresh_token, expires_at, email, metadata, updated_at)
        VALUES (${practitionerId}, 'xero', ${tokens.access_token}, ${tokens.refresh_token || null},
                ${new Date(Date.now() + tokens.expires_in * 1000).toISOString()},
                ${tenant.tenantName || 'Xero'},
                ${JSON.stringify({ tenantId: tenant.tenantId, tenantName: tenant.tenantName, defaultBankAccountId, defaultBankAccountName })},
                NOW())
        ON CONFLICT (practitioner_id, provider) DO UPDATE SET
          access_token  = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
          expires_at    = EXCLUDED.expires_at,
          email         = EXCLUDED.email,
          metadata      = EXCLUDED.metadata,
          updated_at    = NOW()
      `;

      return res.redirect(`https://${subdomain}.h-ld.com/admin.html?xero_connected=1`);
    } catch (err) {
      console.error('Xero OAuth callback error:', err);
      return res.redirect(failRedirect);
    }
  }

  // ── Initiate — same pattern as Google/Square: authenticated fetch,
  // frontend navigates the browser to the returned URL itself. ──
  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stateToken = signToken(
    { practitioner_id: auth.practitioner_id, subdomain: org.subdomain, purpose: 'xero_oauth' },
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.XERO_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    scope:         XERO_SCOPES,
    state:         stateToken,
  });

  return res.json({ url: `https://login.xero.com/identity/connect/authorize?${params}` });
}
