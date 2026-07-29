// api/settings/abn-search.js — proxies the free ABN Lookup web service
// (abr.business.gov.au), run by the Australian Business Register. Two
// modes, both via GET:
//   ?name=Solful Kinesiology   → candidate ABNs matching that business name
//   ?abn=51824753556           → full detail for one specific ABN, including
//                                 current GST registration status
//
// Proxied server-side (not called directly from the browser) for two
// reasons: it keeps the ABN Lookup GUID out of client-side code, and the
// ABR's JSON endpoint wraps its response in a JSONP callback by default,
// which needs stripping before it's usable as plain JSON.
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

const ABR_GUID = process.env.ABN_LOOKUP_GUID;

// The ABR's "JSON" endpoint actually returns JSONP — callback({...}) —
// regardless of whether a callback name is supplied. Stripping it out is
// simpler and more reliable than trying to coax plain JSON out of it.
function parseAbrJsonp(text) {
  const match = text.match(/^\s*callback\((.*)\)\s*;?\s*$/s);
  const jsonText = match ? match[1] : text;
  return JSON.parse(jsonText);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (!ABR_GUID) {
    return res.status(500).json({ error: 'ABN lookup is not configured on this server — add ABN_LOOKUP_GUID to Vercel environment variables (free from abr.business.gov.au)' });
  }

  const { name, abn } = req.query;

  try {
    if (abn) {
      // Full detail for one specific ABN — used once the practitioner has
      // picked a candidate from the name-search results, to confirm the
      // exact entity and pull its current GST registration status.
      const cleanAbn = String(abn).replace(/\s+/g, '');
      const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(cleanAbn)}&callback=callback&guid=${ABR_GUID}`;
      const abrRes = await fetch(url);
      const data = parseAbrJsonp(await abrRes.text());
      if (data.Exception?.exceptionDescription) {
        return res.status(404).json({ error: data.Exception.exceptionDescription });
      }
      return res.json({
        abn: data.Abn,
        entityName: data.EntityName,
        entityType: data.EntityTypeName,
        state: data.AddressState,
        postcode: data.AddressPostcode,
        // Gst is the date GST registration became effective, or blank/null
        // if not registered — matches how the ATO itself represents this.
        gstRegistered: !!data.Gst,
      });
    }

    if (name) {
      // Name search — returns a shortlist of candidate businesses for the
      // practitioner to pick from, since business names alone are rarely
      // unique enough to resolve to one ABN automatically.
      const url = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(name)}&maxResults=10&callback=callback&guid=${ABR_GUID}`;
      const abrRes = await fetch(url);
      const data = parseAbrJsonp(await abrRes.text());
      if (data.Exception?.exceptionDescription) {
        return res.status(400).json({ error: data.Exception.exceptionDescription });
      }
      const results = (data.Names || []).map(n => ({
        abn: n.Abn,
        name: n.Name,
        state: n.State,
        postcode: n.Postcode,
        score: n.Score,
      }));
      return res.json({ results });
    }

    return res.status(400).json({ error: 'Provide either ?name= or ?abn=' });
  } catch (err) {
    console.error('ABN lookup error:', err);
    return res.status(500).json({ error: 'Could not reach ABN Lookup — please try again' });
  }
}
