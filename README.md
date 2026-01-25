# Shipyard + PocketBase Template

A simple todo application template built with [Astro](https://astro.build), [Shipyard](https://github.com/levino), and [PocketBase](https://pocketbase.io).

## Features

- **Astro 5** - Server-rendered pages, no client-side JavaScript
- **Shipyard** - Pre-built layouts and navigation
- **PocketBase** - Lightweight backend database
- **TailwindCSS + DaisyUI** - Styling
- **Docker Compose** - Development and production configurations
- **Vitest + Playwright** - Testing

## Quick Start

### Prerequisites

- Node.js 22+
- Docker and Docker Compose

### Development

1. Clone and install:
   ```bash
   git clone <your-repo-url>
   cd shipyard-pocketbase-template
   npm install
   ```

2. Create a `.env` file with your Cloudflare tunnel token:
   ```bash
   echo "CLOUDFLARED_TUNNEL_TOKEN=your-tunnel-token-here" > .env
   ```

3. Start the dev stack:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:4321](http://localhost:4321)

The MCP server is exposed via Cloudflare tunnel for Claude integration.

### PocketBase Admin

Access at [http://localhost:8090/_/](http://localhost:8090/_/)

Default credentials:
- Email: `admin@test.local`
- Password: `testtest123`

## Project Structure

```
├── src/
│   ├── pages/           # Astro pages and API routes
│   ├── lib/             # Utilities (pocketbase client)
│   └── middleware.ts    # Auth middleware
├── tests/
│   └── e2e/             # Playwright tests
├── pocketbase/
│   ├── pb_migrations/   # Auto-generated migrations
│   └── pb_data/         # Development data (gitignored)
├── docker-compose.yaml  # Development stack
└── docker-compose.coolify.yaml  # Production deployment
```

## 🚨 Database Schema Changes - CRITICAL RULES

**NEVER EDIT MIGRATION FILES MANUALLY** - See `CLAUDE.md` for full details.

**STRICTLY FORBIDDEN**:
- ❌ Editing any file in `packages/api/pocketbase/pb_migrations/`
- ❌ Creating migration files by hand
- ❌ Modifying existing migrations after creation

**REQUIRED WORKFLOW** - Use the PocketBase SDK:

```javascript
// temp-collection.js
import PocketBase from 'pocketbase'

const pb = new PocketBase('http://<CONTAINER_IP>:8090')
await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

await pb.collections.create({
  name: 'my_collection',
  type: 'base',
  fields: [
    { name: 'title', type: 'text', required: true },
  ],
})
```

Run with `node temp-collection.js`, then delete the file. PocketBase generates the migration automatically.

## Testing

```bash
# Integration tests
npm run test:bare

# E2E tests (requires Playwright browsers)
npm run test:playwright:bare
```

## Deployment

Use `docker-compose.coolify.yaml` for Coolify/Shipyard deployment.

## License

MIT
