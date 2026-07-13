# Solful Kinesiology Booking System

## Project Structure

```
solful-booking/
├── public/              # Frontend HTML files (served statically)
│   ├── solful-admin.html
│   ├── solful-book.html
│   ├── solful-pay.html
│   ├── manifest.json
│   └── sw.js
├── api/                 # Serverless API routes (Node.js)
│   ├── auth/
│   │   ├── login.js
│   │   ├── google.js
│   │   └── google/callback.js
│   ├── bookings/
│   │   ├── index.js
│   │   └── [id].js
│   ├── clients/index.js
│   ├── services/index.js
│   ├── settings/index.js
│   ├── calendar/sync.js
│   ├── sms/send.js
│   ├── email/send.js
│   ├── push/
│   │   ├── subscribe.js
│   │   └── payment.js
│   └── webhooks/square.js
├── lib/                 # Shared helpers
│   ├── db.js
│   ├── auth.js
│   └── migrate.js
├── vercel.json
├── package.json
└── .env.example
```

## Setup Steps

### 1. Database (Neon Postgres)
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project called `solful`
3. Copy the connection string — it looks like `postgresql://user:pass@host/dbname?sslmode=require`
4. Add it as `DATABASE_URL` in Vercel environment variables

### 2. Run database migration
```bash
npm install
cp .env.example .env
# Fill in DATABASE_URL in .env
npm run db:migrate
```

### 3. Environment Variables in Vercel
Go to your Vercel project → Settings → Environment Variables and add:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Neon dashboard |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ADMIN_EMAIL` | Your email |
| `ADMIN_PASSWORD` | Choose a strong password |
| `GOOGLE_CLIENT_ID` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-URL/api/auth/google/callback` |
| `MESSAGEBIRD_API_KEY` | MessageBird dashboard |
| `RESEND_API_KEY` | resend.com |
| `SQUARE_APP_ID` | Square Developer dashboard |
| `VAPID_PUBLIC_KEY` | Generate (see below) |
| `VAPID_PRIVATE_KEY` | Generate (see below) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL |

### 4. Generate VAPID keys (for push notifications)
```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
```

### 5. Google Cloud Console setup
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select your existing project
3. APIs & Services → Credentials
4. Create OAuth 2.0 Client ID (Web application)
5. Add `https://YOUR-VERCEL-URL/api/auth/google/callback` as Authorised redirect URI

### 6. Deploy
Push to GitHub — Vercel deploys automatically.

### 7. Wix embed code
Add an HTML element to your Wix page with:
```html
<iframe id="solful-booking" src="https://YOUR-VERCEL-URL/solful-book.html"
  width="100%" style="border:none;min-height:600px" scrolling="no"></iframe>
<script>
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'solful-booking-height') {
    document.getElementById('solful-booking').style.height = e.data.height + 'px';
  }
});
</script>
```

## Phase 3 Checklist
- [ ] Neon database created and `DATABASE_URL` set
- [ ] Migration run (`npm run db:migrate`)
- [ ] All environment variables set in Vercel
- [ ] Google Calendar connected via admin Settings
- [ ] MessageBird API key added
- [ ] Resend account created and API key added
- [ ] VAPID keys generated and added
- [ ] PWA installed on iPhone (open admin in Safari → Share → Add to Home Screen)
- [ ] Push notification permission granted on iPhone
- [ ] Wix embed code updated with real Vercel URL
- [ ] Square App ID updated in solful-pay.html
