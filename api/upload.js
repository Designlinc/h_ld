// api/upload.js — shared image upload route, backed by Vercel Blob.
//
// Deliberately generic: this route only knows how to turn a base64 data URL
// into a public Blob URL and hand that back. It does NOT write the URL
// anywhere itself — Settings saves it into app_settings.logoUrl, Account
// saves it onto practitioners.avatar_url, and the super-admin background
// editor saves it into platform_settings. Keeping the upload route dumb
// means none of those callers have to route their save logic through here,
// and this file never needs to know about any of their schemas.
//
// Two auth shapes, selected by `scope` in the request body:
//   'org'      (default) — a practitioner uploading something that belongs
//              to their own organization (logo, avatar). Requires the
//              normal requireOrg + requireAuth pair, same as any other
//              tenant-scoped route.
//   'platform' — a super-admin uploading something global, like the login
//              background image. Runs on the main app host, not a tenant
//              subdomain, so requireOrg would never resolve — this skips
//              straight to requireSuperAdmin instead.
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { requireAuth, requireSuperAdmin } from '../lib/auth.js';
import { requireOrg } from '../lib/tenant.js';

// Vercel's default JSON body limit (1mb) is too small for a base64-encoded
// image — base64 inflates size by ~33%, so this allows roughly a 5MB
// original file through comfortably.
export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, checked against the decoded file
const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'File uploads are not configured — add a Blob store to this project in Vercel and redeploy.' });
  }

  const { dataUrl, filename, scope } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing dataUrl' });
  }

  // ── Auth + path prefix ──
  let prefix;
  if (scope === 'platform') {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    prefix = 'platform';
  } else {
    const org = await requireOrg(req, res);
    if (!org) return;
    const auth = requireAuth(req, res, org);
    if (!auth) return;
    prefix = `org/${org.id}`;
  }

  // ── Decode + validate ──
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'dataUrl must be a base64 data URL' });

  const [, mimeType, base64] = match;
  const ext = EXT_BY_MIME[mimeType];
  if (!ext) {
    return res.status(400).json({ error: 'Unsupported file type — use PNG, JPEG, WebP, GIF, or SVG' });
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Could not decode file data' });
  }
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File too large — 5MB max' });
  }

  try {
    const blob = await put(`${prefix}/${randomUUID()}.${ext}`, buffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
    });
    return res.json({ ok: true, url: blob.url, filename: filename || null });
  } catch (err) {
    console.error('Blob upload error:', err.message);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
