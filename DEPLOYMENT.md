# Universal Deployment Guide

Master reference for deploying apps across Railway and Vercel.

---

## Platform Selection Quick Reference

| Platform | Best For | Cost | Setup Time |
|----------|----------|------|------------|
| **Railway** | Node.js, Python, PostgreSQL backends, monolithic apps | Free tier + pay-as-you-go | 5 minutes |
| **Vercel** | Next.js, React, static sites, edge functions | Free tier, $20/mo Pro | 2 minutes |

---

## Railway Deployment

### Prerequisites

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login
```

### Initial Setup (One-Time)

```bash
# Create project
railway init

# Add services (PostgreSQL, Redis, etc. as needed)
railway add  # Select service from menu

# Configure environment variables
railway variables
```

### Deploy Steps

1. **Commit your code:**
   ```bash
   git add .
   git commit -m "feat: description of changes"
   git push origin main
   ```

2. **Railway auto-deploys** on push (if connected to GitHub)

3. **Or manual deploy:**
   ```bash
   railway up
   ```

4. **Verify:**
   ```bash
   railway logs
   railway open  # Opens the deployed app in browser
   ```

### Environment Variables

**Adding a variable:**
```bash
railway variables set KEY=value
```

**Referencing variables in Railway:**
- Use Railway dashboard → Service → Variables tab
- Or CLI: `railway variables`

**Shared vs App-Specific:**
- **Shared:** API keys used across multiple apps (e.g., `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`)
  - Store in `~/.env.shared` in your local machine
  - Add to each Railway app's Variables manually (or via script)
  - DO NOT commit to git

- **App-Specific:** Variables unique to one app (e.g., `AUTH_PASSWORD`, `DATABASE_URL`)
  - Store ONLY in Railway's Variables tab
  - DO NOT commit `.env` files

### Database (PostgreSQL)

**Local Setup:**
```bash
# Start Postgres in Docker
docker run -d \
  -e POSTGRES_PASSWORD=password \
  -p 5433:5432 \
  postgres:latest

# Connection string
postgresql://postgres:password@localhost:5433/myapp
```

**Railway Setup:**
1. Railway dashboard → + New service → Database → PostgreSQL
2. Railway auto-generates `DATABASE_URL` env var
3. Run migrations:
   ```bash
   railway run npm run db:push
   ```

**Connection via CLI:**
```bash
# Access database shell
railway connect --database

# Or use connection string
psql "$DATABASE_URL"
```

### Useful Commands

```bash
# View logs
railway logs [-f for follow]

# View deployments
railway deployments

# Redeploy previous version
railway redeploy [DEPLOYMENT_ID]

# SSH into running container
railway shell

# View metrics
railway status
```

### Costs

- **First $5/month free**
- Postgres: ~$1-2/month (small)
- Compute: ~$0.000463/CPU-hour + $0.0000925/MB-hour
- Typical small app: $0-5/month total

### Debugging

**Check logs:**
```bash
railway logs
```

**Common issues:**
- `Error: password authentication failed` → Check `DATABASE_URL` is correct
- `Error: connect ECONNREFUSED` → Database not running, wait 30 seconds
- `port already in use` → Kill other process: `lsof -i :5433 | kill -9 <PID>`

**Enable verbose logs:**
```bash
railway logs --tail 100  # Last 100 lines
```

---

## Vercel Deployment

### Prerequisites

```bash
# Install Vercel CLI (latest)
npm i -g vercel@latest

# Login
vercel login
```

### Initial Setup (One-Time)

```bash
cd your-next-app
vercel  # Creates project, links to Git
```

### Deploy Steps

1. **Commit your code:**
   ```bash
   git add .
   git commit -m "feat: description"
   git push origin main
   ```

2. **Vercel auto-deploys** on push (if connected to GitHub)

3. **Or manual deploy:**
   ```bash
   vercel --prod
   ```

4. **Verify:**
   ```bash
   vercel logs  # View logs
   ```

### Environment Variables

**Add via CLI:**
```bash
vercel env add SECRET_KEY  # Interactive input
```

**Add via Dashboard:**
1. Go to Vercel → Project → Settings → Environment Variables
2. Add variable, select which environments (Production, Preview, Development)
3. Re-deploy to apply to Production

**Shared vs App-Specific:**
- Same as Railway (see above)
- Vercel loads from `vercel.json` or `.env.local` in development
- **Important:** Next.js loads `next.config.ts` which can load `~/.env.shared` via `dotenv`

### Deployment Environments

| Environment | When | Rebuild |
|-------------|------|---------|
| **Production** | `main` branch, `vercel --prod` | Full rebuild |
| **Preview** | Pull requests, feature branches | Full rebuild |
| **Development** | Local `npm run dev` | Incremental |

### Database

Vercel doesn't include a database. Use:
- **PostgreSQL:** Railway, Supabase, Neon, AWS RDS
- **MySQL:** PlanetScale, AWS RDS
- **Serverless:** Turso, DynamoDB, MongoDB Atlas

**Typical setup:**
```bash
# Store connection string in Vercel env vars
vercel env add DATABASE_URL
# Value: postgresql://user:pass@host:5432/dbname
```

Then load in `next.config.ts`:
```typescript
import { config as loadDotenv } from 'dotenv'
loadDotenv()  // Loads DATABASE_URL from env vars
```

### Useful Commands

```bash
# View logs
vercel logs

# List deployments
vercel deployments

# Rollback
vercel rollback

# View env vars
vercel env ls

# Promote preview to production
vercel promote [DEPLOYMENT_URL]

# View project info
vercel inspect
```

### Edge vs Serverless Functions

- **Serverless (default):** Full Node.js, database access, 5-60s timeout
- **Edge:** Fast but limited (no Node.js), 30s max, for middleware/redirects

**Use Serverless for:** API routes, database queries, auth, long operations
**Use Edge for:** Redirects, A/B testing, bot detection, header modification

### Costs

- **Free:** 3 users, unlimited deployments, basic analytics
- **Pro:** $20/mo per user, advanced features, priority support
- Database costs vary by provider (separate service)
- Typical small app: Free or $20/mo

### Debugging

**Check logs:**
```bash
vercel logs [--prod]
```

**Common issues:**
- `Error: MODULE_NOT_FOUND` → Missing dependency, add to `package.json`
- `Error: timeout` → Function taking too long, optimize or increase timeout
- `500 Internal Server Error` → Check logs: `vercel logs --prod`

**Enable verbose logs:**
```bash
vercel logs --follow  # Stream logs in real-time
```

---

## Comparing Deployments

### Deployment Process

```
Git commit → Git push → Platform receives push → Build → Deploy → Live
```

**Time to deploy:**
- Vercel: ~2-3 minutes (Next.js optimized)
- Railway: ~3-5 minutes (builds from scratch)

### Rollback

**Vercel:**
```bash
vercel rollback  # Auto-selects previous stable deployment
```

**Railway:**
```bash
railway redeploy [DEPLOYMENT_ID]
```

### Scaling

**Vercel:**
- Auto-scales to handle traffic
- No configuration needed
- Scale down automatically

**Railway:**
- Manual: `railway scale [SERVICE] [CPU] [MEMORY]`
- Auto-scaling: Available on Pro plan
- Monitor: `railway status`

---

## Secrets Management Best Practices

### DO

✅ Store API keys in platform env vars (Vercel, Railway)
✅ Load shared keys from `~/.env.shared` locally
✅ Use `next.config.ts` to load `~/.env.shared` in Next.js
✅ Rotate keys quarterly
✅ Use unique keys per environment (staging key ≠ production key)

### DO NOT

❌ Commit `.env` files to git
❌ Hardcode API keys in source code
❌ Use `process.env.KEY` without checking if it exists
❌ Log sensitive values
❌ Share production keys in Slack/email

### Rotating Secrets

```bash
# 1. Create new key at API provider (e.g., console.anthropic.com)
# 2. Update in platform:
#    Vercel: Settings → Environment Variables → update + redeploy
#    Railway: Variables tab → update + auto-redeploy
# 3. Deactivate old key at provider
# 4. Test: Hit live app with new key
```

---

## Monitoring & Alerts

### Vercel

Dashboard → Analytics:
- **Web Vitals:** Core Web Vitals, response time
- **Deployments:** Success rate, duration
- **Functions:** Invocations, duration, errors

Set alerts: Settings → Integrations

### Railway

Dashboard → Metrics:
- **CPU/Memory:** Real-time usage
- **Logs:** Error rates, deployment status
- **Database:** Connection count, query performance

---

## Common Workflows

### Feature Branch to Production

```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Make changes, commit
git commit -am "feat: add new feature"

# 3. Push to GitHub
git push origin feat/my-feature

# 4. Both platforms auto-create Preview deployments
#    Vercel: Automatic preview URL
#    Railway: Manual (or configure GitHub integration)

# 5. Merge to main
git merge feat/my-feature
git push origin main

# 6. Both platforms auto-deploy to production
```

### Emergency Rollback

```bash
# Vercel
vercel rollback

# Railway
railway deployments  # Find previous ID
railway redeploy [ID]
```

### Check Logs

```bash
# Vercel
vercel logs --prod

# Railway
railway logs --follow
```

---

## Checklist: Before Every Deploy

- [ ] Tests pass: `npm test`
- [ ] Dev server works: `npm run dev`
- [ ] No TypeScript errors: `npm run typecheck`
- [ ] Database migrations tested locally
- [ ] Commit message is clear
- [ ] No secrets in `.env` or git history
- [ ] Reviewed changes: `git diff origin/main`

---

## Troubleshooting Decision Tree

```
Deploy failed?
├─ Check logs: vercel logs / railway logs
├─ Is it a build error?
│  └─ Missing dependency? Add to package.json
│  └─ TypeScript error? Fix and re-push
│  └─ Env var missing? Add to platform
└─ Is it a runtime error?
   └─ Check Database connection
   └─ Check API keys are set
   └─ Rollback: vercel rollback / railway redeploy
```

---

## Resources

- **Vercel Docs:** https://vercel.com/docs
- **Railway Docs:** https://docs.railway.app
- **Next.js:** https://nextjs.org/docs
- **Node.js:** https://nodejs.org/docs

## Quick Reference: Commands

```bash
# Vercel
vercel --prod                    # Deploy to production
vercel logs                      # View logs
vercel rollback                  # Rollback to previous

# Railway
railway up                       # Deploy
railway logs                     # View logs
railway redeploy [ID]           # Rollback
railway variables set KEY=value # Set env var
```
