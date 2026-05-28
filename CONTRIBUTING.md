# Contributing to Velya Cloud Relay

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone repository
git clone https://github.com/lorislab/velya-relay
cd velya-relay

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your test values
nano .env

# Start development server (with hot reload)
npm run dev
```

## Project Structure

```
velya-relay/
├── src/
│   ├── index.ts           # Entry point
│   ├── config.ts          # Environment config
│   ├── apns.ts            # APNs push notifications
│   ├── auth/              # Authentication (JWT, API keys)
│   ├── db/                # Database (PostgreSQL, Redis)
│   ├── rest/              # REST API endpoints
│   ├── types/             # TypeScript types & Zod schemas
│   ├── webhooks/          # Webhook dispatcher
│   └── ws/                # WebSocket handler
├── Dockerfile
├── docker-compose.yml
├── init-db.sql
└── README.md
```

## Testing

```bash
# Run tests
npm test

# Lint code
npm run lint

# Build TypeScript
npm run build

# Start production build
npm start
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions or changes
- `chore:` Build process or auxiliary tool changes

Example:
```
feat: add webhook retry mechanism

- Implement exponential backoff for failed webhooks
- Add max_retries configuration
- Log delivery attempts to webhook_deliveries table
```

## Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Max line length: 100 characters
- Use async/await (not .then())
- Comment complex logic

## Security

If you discover a security vulnerability, **DO NOT** open a public issue.

Email: security@lorislab.fr

We will respond within 48 hours.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
