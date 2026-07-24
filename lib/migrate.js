// lib/migrate.js — run once against a fresh database to set up the schema
// Usage: node lib/migrate.js
//
// Tenant model: two levels, not one.
//   organizations  — the actual tenant/billing/subdomain unit
//   practitioners  — staff members belonging to an organization
// A solo practitioner is just an organization with one practitioner row.
// A future clinic is the same organization with several practitioner rows,
// sharing the client roster, billing, and subdomain. Nothing about this
// schema changes when that day comes — it's already shaped for it.
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Running migrations...');

  // ── Organizations (the tenant) ──
  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id             TEXT PRIMARY KEY,
      subdomain      TEXT UNIQUE NOT NULL CHECK (subdomain ~ '^[a-z0-9-]+$'),
      name           TEXT NOT NULL,
      plan_tier      TEXT NOT NULL DEFAULT 'trial',
      billing_status TEXT NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active','trial','suspended','cancelled')),
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ── Practitioners (staff belonging to an organization) ──
  await sql`
    CREATE TABLE IF NOT EXISTS practitioners (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email           TEXT UNIQUE NOT NULL,
      password        TEXT NOT NULL,
      name            TEXT,
      role            TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_practitioners_org ON practitioners(organization_id)`;

  // ── Super-admins (you and support staff — deliberately a separate
  // credential space from practitioners, not a "role" on the same table,
  // so a bug or forged claim in practitioner auth can never grant
  // cross-tenant access) ──
  await sql`
    CREATE TABLE IF NOT EXISTS super_admins (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ── Impersonation audit log (super-admin support access) ──
  await sql`
    CREATE TABLE IF NOT EXISTS impersonation_log (
      id              SERIAL PRIMARY KEY,
      super_admin_id  TEXT REFERENCES super_admins(id) ON DELETE SET NULL,
      organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      reason          TEXT,
      started_at      TIMESTAMPTZ DEFAULT NOW(),
      ended_at        TIMESTAMPTZ
    )
  `;

  // ── Clients (shared across all practitioners in an organization) ──
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      first           TEXT NOT NULL,
      last            TEXT,
      email           TEXT,
      phone           TEXT,
      address         TEXT,
      dob             DATE,
      referral        TEXT,
      tags            TEXT,
      notes           JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id)`;

  // ── Services (org-wide by default; practitioner_id set only if a service
  // belongs to one specific staff member's specialty) ──
  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      practitioner_id TEXT REFERENCES practitioners(id) ON DELETE SET NULL,
      name            TEXT NOT NULL,
      description     TEXT,
      duration        INTEGER DEFAULT 60,
      price           NUMERIC(10,2) DEFAULT 0,
      category        TEXT,
      location        TEXT,
      icon            TEXT,
      image           TEXT,
      active          BOOLEAN DEFAULT TRUE,
      sort_order      INTEGER,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_services_org ON services(organization_id)`;

  // ── Bookings ──
  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id                  TEXT PRIMARY KEY,
      organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      practitioner_id     TEXT REFERENCES practitioners(id) ON DELETE SET NULL,
      client_name         TEXT NOT NULL,
      client_email        TEXT,
      client_phone        TEXT,
      client_id           TEXT REFERENCES clients(id) ON DELETE SET NULL,
      service_id          TEXT REFERENCES services(id) ON DELETE SET NULL,
      service_name        TEXT,
      date                DATE NOT NULL,
      time                TIME NOT NULL,
      duration            INTEGER DEFAULT 60,
      price               NUMERIC(10,2) DEFAULT 0,
      location            TEXT,
      status              TEXT DEFAULT 'awaiting',
      payment_method      TEXT,
      payment_amount      NUMERIC(10,2),
      paid_at             TIMESTAMPTZ,
      practitioner_notes  TEXT,
      notes               TEXT,
      intake_submitted    BOOLEAN DEFAULT FALSE,
      intake_responses    JSONB,
      homework_reminder   JSONB,
      google_event_id     TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_org_date ON bookings(organization_id, date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_practitioner ON bookings(practitioner_id)`;

  // ── Settings (composite key — one settings row per org per key) ──
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key             TEXT NOT NULL,
      value           JSONB NOT NULL,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (organization_id, key)
    )
  `;

  // ── Intake forms ──
  await sql`
    CREATE TABLE IF NOT EXISTS forms (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      service_id      TEXT,
      active          BOOLEAN DEFAULT TRUE,
      fields          JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_forms_org ON forms(organization_id)`;

  // ── Note templates ──
  await sql`
    CREATE TABLE IF NOT EXISTS note_templates (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      html            TEXT,
      is_default      BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_note_templates_org ON note_templates(organization_id)`;

  // ── Message templates (composite key — one per org per message type) ──
  await sql`
    CREATE TABLE IF NOT EXISTS message_templates (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      type            TEXT NOT NULL,
      channels        JSONB DEFAULT '{"email":true,"sms":false}',
      email_subject   TEXT,
      email_body      TEXT,
      sms_body        TEXT,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (organization_id, type)
    )
  `;

  // ── Web push subscriptions (per staff member's own devices) ──
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id              SERIAL PRIMARY KEY,
      practitioner_id TEXT REFERENCES practitioners(id) ON DELETE CASCADE,
      endpoint        TEXT UNIQUE NOT NULL,
      subscription    JSONB NOT NULL,
      device_name     TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_practitioner ON push_subscriptions(practitioner_id)`;

  // ── Communications log ──
  await sql`
    CREATE TABLE IF NOT EXISTS communications (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      practitioner_id TEXT REFERENCES practitioners(id) ON DELETE SET NULL,
      type            TEXT NOT NULL,
      to_address      TEXT,
      client_name     TEXT,
      subject         TEXT,
      message         TEXT,
      status          TEXT DEFAULT 'queued',
      sent_at         TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_communications_org ON communications(organization_id)`;

  // ── OAuth tokens — keyed per practitioner per provider. This is the
  // structural fix from the single-tenant version, where `provider` alone
  // was the primary key and could only ever hold one Google/Square
  // connection for the whole app. ──
  await sql`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      practitioner_id TEXT NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
      provider        TEXT NOT NULL,
      access_token    TEXT,
      refresh_token   TEXT,
      expires_at      TIMESTAMPTZ,
      email           TEXT,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (practitioner_id, provider)
    )
  `;

  // ── MFA codes (login step, not organization-scoped — email is already
  // globally unique across practitioners, and this row doesn't outlive a
  // single login attempt) ──
  await sql`
    CREATE TABLE IF NOT EXISTS mfa_codes (
      email      TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  // ── Password resets — a random token (not a 6-digit code, since this
  // one travels in a URL) that a "forgot password" email link carries.
  // 30-minute window, deliberately longer than the MFA code's 10 minutes,
  // since this requires checking email and clicking a link rather than
  // typing a code immediately in the same session. ──
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      token           TEXT PRIMARY KEY,
      practitioner_id TEXT NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
      expires_at      TIMESTAMPTZ NOT NULL
    )
  `;

  // ── Impersonation consent requests (SMS/email approval flow) — separate
  // from impersonation_log, which records sessions that actually started.
  // This tracks the request/response before that ever happens. ──
  await sql`
    CREATE TABLE IF NOT EXISTS impersonation_requests (
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      practitioner_id TEXT NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
      super_admin_id  TEXT NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
      reason          TEXT,
      token           TEXT UNIQUE NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired','used')),
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      responded_at    TIMESTAMPTZ,
      expires_at      TIMESTAMPTZ NOT NULL
    )
  `;

  // ── Action log for impersonation sessions — one row per mutating API
  // call (POST/PUT/PATCH/DELETE) made while impersonating. Deliberately
  // coarse (method + path, not a full before/after diff of the data) —
  // enough to answer "what did they touch during this session" without
  // needing to instrument every individual route by hand. ──
  await sql`
    CREATE TABLE IF NOT EXISTS impersonation_actions (
      id                   SERIAL PRIMARY KEY,
      impersonation_log_id INTEGER REFERENCES impersonation_log(id) ON DELETE CASCADE,
      method               TEXT NOT NULL,
      path                 TEXT NOT NULL,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ── Platform settings (super-admin controlled, app-wide config — not
  // scoped to any organization). Same key/value shape as the per-org
  // `settings` table above, just without the tenant column. Currently
  // holds the login screen background (gradient or image). ──
  await sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log('✓ All tables created');

  // ── Incremental additions (ALTER, not CREATE) — the database already has
  // real tables from earlier testing, so new columns must be added this
  // way; CREATE TABLE IF NOT EXISTS is a no-op on a table that already
  // exists and would silently skip these otherwise. ──
  await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
  await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`;
  await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_status TEXT`;
  await sql`ALTER TABLE practitioners ADD COLUMN IF NOT EXISTS notifications_opt_out BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE practitioners ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
  await sql`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS metadata JSONB`;
  await sql`ALTER TABLE impersonation_log ADD COLUMN IF NOT EXISTS request_id TEXT REFERENCES impersonation_requests(id)`;

  // The bookings table in particular had accumulated several columns in the
  // CREATE TABLE statement above (payment tracking, intake status, homework
  // reminders, Google Calendar sync) that were added to this file well after
  // the live bookings table already existed — meaning none of them were ever
  // actually applied. CREATE TABLE IF NOT EXISTS silently does nothing once
  // the table exists, so every one of these needs its own explicit ALTER,
  // same as the block above. This was the direct cause of bookings failing
  // to save with "column ... does not exist".
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2)`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS practitioner_notes TEXT`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS intake_submitted BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS intake_responses JSONB`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS homework_reminder JSONB`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS google_event_id TEXT`;

  // Same latent risk on services — icon/image/sort_order were added to the
  // CREATE TABLE statement above at some point too. Covering them here as a
  // precaution even though no failure has been reported for this table yet.
  await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS icon TEXT`;
  await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS image TEXT`;
  await sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INTEGER`;

  console.log('✓ Billing columns added');

  // Seed the first super-admin account (you). Same fail-loudly pattern as
  // before — no hardcoded fallback password baked into the repo.
  if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in the environment before running migrations.');
  }
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.default.hash(process.env.SUPER_ADMIN_PASSWORD, 12);
  await sql`
    INSERT INTO super_admins (id, email, password)
    VALUES (${randomUUID()}, ${process.env.SUPER_ADMIN_EMAIL}, ${hash})
    ON CONFLICT (email) DO NOTHING
  `;
  console.log('✓ Super-admin account seeded');

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
