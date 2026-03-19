# ADEY Backend — Deployment Guide

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Push schema to database
npx prisma db push

# 4. Seed with sample data
node prisma/seed.js

# 5. Start dev server
npm run dev
```

Server runs at: `http://localhost:5000`
Health check:   `http://localhost:5000/health`

---

## Deploy to Railway (Recommended — Free Tier Available)

1. Create account at **railway.app**
2. New Project → Deploy from GitHub repo
3. Add a **PostgreSQL** plugin to your project
4. Add a **Redis** plugin (optional but recommended)
5. Copy `DATABASE_URL` from PostgreSQL plugin → paste into Railway env vars
6. Add all other env vars from `.env.example`
7. Railway auto-detects Node.js and runs `npm start`

After first deploy:
```bash
# Run migrations on Railway (one-time)
railway run npx prisma db push
railway run node prisma/seed.js
```

---

## Deploy to Render (Alternative Free Option)

1. Create account at **render.com**
2. New Web Service → connect GitHub repo
3. Build command: `npm install && npx prisma generate`
4. Start command: `npm start`
5. Add a free **PostgreSQL** database on Render
6. Set all environment variables in Render dashboard

---

## API Endpoints Reference

### Auth
| Method | Endpoint              | Auth     | Description        |
|--------|-----------------------|----------|--------------------|
| POST   | /api/auth/register    | None     | Create account     |
| POST   | /api/auth/login       | None     | Login              |
| POST   | /api/auth/refresh     | None     | Refresh token      |
| POST   | /api/auth/logout      | None     | Logout             |
| GET    | /api/auth/me          | Customer | Get own profile    |

### Products
| Method | Endpoint              | Auth     | Description             |
|--------|-----------------------|----------|-------------------------|
| GET    | /api/products         | None     | List with filters       |
| GET    | /api/products/:slug   | None     | Single product          |
| POST   | /api/products         | Admin    | Create product          |
| PUT    | /api/products/:id     | Admin    | Update product          |
| DELETE | /api/products/:id     | Admin    | Soft-delete product     |
| GET    | /api/products/inventory | Staff  | Inventory stats         |

### Orders
| Method | Endpoint                  | Auth   | Description          |
|--------|---------------------------|--------|----------------------|
| POST   | /api/orders               | Any    | Create order         |
| GET    | /api/orders/mine          | Self   | My orders            |
| GET    | /api/orders/all           | Staff  | All orders (admin)   |
| GET    | /api/orders/stats         | Staff  | Revenue stats        |
| GET    | /api/orders/:reference    | Self   | Single order         |
| PATCH  | /api/orders/:id/status    | Staff  | Update status        |

### Payments
| Method | Endpoint                      | Auth | Description            |
|--------|-------------------------------|------|------------------------|
| POST   | /api/payments/initiate        | Self | Start Paystack payment |
| GET    | /api/payments/verify/:ref     | Self | Verify after payment   |
| POST   | /api/payments/webhook         | None | Paystack webhook       |

### Shipments
| Method | Endpoint                      | Auth  | Description         |
|--------|-------------------------------|-------|---------------------|
| GET    | /api/shipments                | Staff | All shipments       |
| POST   | /api/shipments                | Admin | Create shipment     |
| PATCH  | /api/shipments/:id/status     | Staff | Update status       |
| GET    | /api/shipments/track/:ref     | None  | Public tracking     |

### Admin
| Method | Endpoint              | Auth  | Description         |
|--------|-----------------------|-------|---------------------|
| GET    | /api/admin/summary    | Staff | Dashboard metrics   |
| GET    | /api/admin/coupons    | Staff | List coupons        |
| POST   | /api/admin/coupons    | Admin | Create coupon       |

### Users
| Method | Endpoint                        | Auth     | Description      |
|--------|---------------------------------|----------|------------------|
| PATCH  | /api/users/me                   | Self     | Update profile   |
| GET    | /api/users/addresses            | Self     | Get addresses    |
| POST   | /api/users/addresses            | Self     | Add address      |
| DELETE | /api/users/addresses/:id        | Self     | Remove address   |
| GET    | /api/users/notifications        | Self     | Get notifications|
| PATCH  | /api/users/notifications/read   | Self     | Mark all read    |
| GET    | /api/users                      | Admin    | All customers    |

---

## Environment Variables Explained

| Variable              | Where to get it                          |
|-----------------------|------------------------------------------|
| DATABASE_URL          | Railway/Render/Supabase PostgreSQL       |
| REDIS_URL             | Upstash.com free tier                   |
| JWT_SECRET            | Any random 32+ char string              |
| PAYSTACK_SECRET_KEY   | dashboard.paystack.com → API Keys       |
| PAYSTACK_WEBHOOK_SECRET | Paystack dashboard → Webhooks         |
| RESEND_API_KEY        | resend.com → API Keys (free 3k emails/mo)|
| TERMII_API_KEY        | termii.com → Nigerian SMS gateway       |
| CLOUDINARY_*          | cloudinary.com → free media storage     |

---

## Security Checklist Before Going Live

- [ ] Change all default passwords in seed.js
- [ ] Set NODE_ENV=production
- [ ] Use strong random JWT_SECRET (32+ chars)
- [ ] Enable HTTPS on your domain
- [ ] Set FRONTEND_URL to your actual domain (CORS)
- [ ] Configure Paystack webhook URL in Paystack dashboard
- [ ] Add your domain to Paystack allowed callback URLs
- [ ] Set up Sentry for error monitoring (optional)
