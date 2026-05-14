# MTA My Way

A mobile-first Progressive Web App (PWA) for NYC subway commuters. Get real-time arrival predictions, personalized alerts, and commute analysis—all optimized for on-the-go use.

## Features

- **Real-time Arrivals**: Live countdown clocks for all NYC subway stations
- **Personalized Alerts**: Push notifications for your favorite lines and stations
- **Commute Analysis**: Compare regular vs express service, track delays
- **Trip Journal**: Automatic trip tracking with history and insights
- **Fare Tracking**: OMNY fare cap progress and weekly spending
- **Offline Support**: Works without internet via PWA caching
- **Interactive Map**: Pan/zoom map with station filtering and tap-to-view
- **Context-Aware**: Detects home/commute/transfer context automatically

## Tech Stack

### Frontend
- **React 19** - UI framework
- **Vite 6** - Build tool and dev server
- **Zustand** - State management
- **Tailwind CSS 4** - Styling
- **Workbox** - PWA service worker and caching

### Backend
- **Hono** - Web framework
- **Node.js 22** - Runtime
- **better-sqlite3** - Database (push subscriptions, preferences)
- **Zod** - Schema validation

### Testing
- **Vitest** - Unit/integration tests
- **Playwright** - E2E tests
- **Testing Library** - React component testing

### Infrastructure
- **Cloudflare Tunnel** - Reverse proxy and DDoS protection
- **Tailscale** - Internal network and SSH access
- **Docker** - Container deployment

## Quick Start

### Prerequisites

- Node.js 22+
- npm 10+

### Installation

```bash
# Clone repository
git clone https://github.com/jedarden/mta-my-way.git
cd mta-my-way

# Install dependencies
npm install

# Build GTFS data
npm run process-gtfs --workspace=packages/server

# Start development server
npm run dev --workspace=packages/server
```

The app will be available at `http://localhost:3001`.

### Running Tests

```bash
# All tests
npm test

# E2E tests
cd tests/e2e && npm test

# Watch mode
npm run test:watch
```

## Documentation

- [Testing Guide](docs/testing.md) - Testing infrastructure and conventions
- [Security](docs/security.md) - Security model and implementation
- [Observability](docs/observability.md) - Logging, metrics, and tracing
- [Plan](docs/plan/plan.md) - Project roadmap and architecture

## Project Structure

```
mta-my-way/
├── packages/
│   ├── server/      # Hono backend (Node.js)
│   ├── web/         # React frontend (Vite)
│   └── shared/      # Shared types and utilities
├── tests/
│   └── e2e/         # Playwright E2E tests
├── docs/
│   ├── plan/        # Project planning
│   ├── research/    # Research notes
│   ├── testing.md   # Testing guide
│   ├── security.md  # Security documentation
│   └── observability.md  # Observability guide
└── .github/
    └── workflows/   # CI/CD configurations
```

## Deployment

The app runs as a single Docker container deployed via ArgoCD to the `ardenone-cluster` cluster.

### Environment Variables

See `.env.example` for required environment variables.

### CI/CD

GitHub Actions runs on push to main:
- Runs linter and type checker
- Executes unit/integration tests
- Runs E2E tests
- Builds Docker image (via separate workflow)

## Development

### Adding a New Feature

1. Create feature branch from `main`
2. Implement feature with tests
3. Run `npm run lint` and `npm run typecheck`
4. Run `npm test` to verify all tests pass
5. Push and create PR

### Code Style

- Use **Biome** for formatting (run `npm run format`)
- Follow **TypeScript** strict mode
- Write tests for all new functionality
- Update documentation for user-facing changes

### Git Conventions

- Prefix commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Reference issues: `fixes #123`
- Keep commits focused and atomic

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

For issues or questions, please open a GitHub issue.
