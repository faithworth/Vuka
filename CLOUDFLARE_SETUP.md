# VUKA — Cloudflare Configuration Guide
## Phase 11 — Infrastructure & Deployment

Cloudflare serves as the CDN layer in front of Vercel (for pages) and R2 (for audio/artwork).

---

## DNS Setup

Add these DNS records in the Cloudflare dashboard for `vuka.app`:

| Type  | Name    | Value                          | Proxied |
|-------|---------|--------------------------------|---------|
| A     | @       | 76.76.21.21 (Vercel)           | ✅ Yes  |
| CNAME | www     | cname.vercel-dns.com           | ✅ Yes  |
| CNAME | cdn     | [your-r2-bucket].r2.dev        | ✅ Yes  |
| CNAME | audio   | vuka-audio.[cf-account].workers.dev | ✅ Yes |

---

## Page Rules

Create these Page Rules (or Cache Rules) in the Cloudflare dashboard:

### 1. API routes — bypass cache entirely
- Pattern: `www.vuka.app/api/*`
- Setting: Cache Level = Bypass

### 2. Admin routes — bypass + no index
- Pattern: `www.vuka.app/admin*`
- Setting: Cache Level = Bypass
- Setting: Browser Cache TTL = No cache

### 3. Static assets — edge cache 1 year
- Pattern: `www.vuka.app/_next/static/*`
- Setting: Cache Level = Cache Everything
- Setting: Edge Cache TTL = 1 year (31536000 seconds)
- Setting: Browser Cache TTL = 1 year

### 4. Audio CDN — edge cache audio files
- Pattern: `audio.vuka.app/*`
- Setting: Cache Level = Cache Everything
- Setting: Edge Cache TTL = 1 year
- Browser Cache TTL = 4 hours (clients re-validate)

---

## Rate Limiting Rules (Cloudflare WAF)

Navigate to Security → WAF → Rate Limiting Rules:

### Rule 1: Protect auth endpoints
- Expression: `(http.request.uri.path contains "/api/auth/")`
- Rate: 10 requests per 60 seconds per IP
- Action: Block for 600 seconds

### Rule 2: Protect API generally
- Expression: `(http.request.uri.path contains "/api/")`
- Rate: 60 requests per 60 seconds per IP
- Action: Challenge after threshold

### Rule 3: Protect admin routes
- Expression: `(http.request.uri.path contains "/admin")`
- Rate: 20 requests per 60 seconds per IP
- Action: Block

---

## Workers & R2 Deployment

```bash
# Install Wrangler
npm install -g wrangler

# Authenticate
wrangler login

# Create R2 buckets
wrangler r2 bucket create vuka-audio
wrangler r2 bucket create vuka-artwork
wrangler r2 bucket create vuka-documents

# Deploy the audio CDN worker
cd cloudflare
wrangler deploy audio-worker.js --name vuka-audio --env production

# Set the signing secret (used to validate audio download tokens)
openssl rand -hex 32  # generate a secret
wrangler secret put SIGNING_SECRET --name vuka-audio --env production
```

---

## R2 Bucket CORS Policy

Apply this CORS policy to the `vuka-audio` and `vuka-artwork` buckets:

```json
[
  {
    "AllowedOrigins": ["https://vukamusic.com", "https://www.vukamusic.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Range", "Authorization", "Content-Type"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Note: `PUT` is required here, not optional — every artwork/beat/release upload is a direct
browser-to-R2 `PUT` via a presigned URL (see `/api/beats/upload`, `/api/releases/upload`,
`/api/dashboard/settings/upload-url`). Without `PUT` in `AllowedMethods`, every upload fails
with a browser-level network error before the request ever reaches R2 — this is not
detectable from Vercel logs, since the PUT never touches the Next.js server.

If you change domains (e.g. moving off a `*.vercel.app` preview domain onto a custom
domain), update `AllowedOrigins` here immediately — a domain not listed here will fail
uploads silently, with no server-side error to point to.

---

## SSL/TLS Settings

In Cloudflare dashboard → SSL/TLS:
- Mode: **Full (strict)**v
- Minimum TLS Version: **TLS 1.2**
- HSTS: Enabled, max-age 63072000, includeSubDomains, preload
- Opportunistic Encryption: On
- TLS 1.3: On
