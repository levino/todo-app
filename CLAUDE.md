# Instructions for Claude AI

## 🚨 CRITICAL RULES - READ FIRST

### Test-Driven Development - NO CODE WITHOUT FAILING TESTS
- **STRICTLY FORBIDDEN**: Changing any code without a failing test that proves the bug exists
- **STRICTLY FORBIDDEN**: "Quick fixes" or "obvious fixes" without tests
- **STRICTLY FORBIDDEN**: Implementing multiple features at once
- **REQUIRED WORKFLOW**:
  1. Write ONE small failing test
  2. Write MINIMAL code to make it pass
  3. Repeat with next small test
  4. Never skip ahead - no "while I'm here" implementations
  5. Never write code before the test exists

### Database Migrations - NEVER EDIT BY HAND
- **STRICTLY FORBIDDEN**: Editing any file in `packages/api/pocketbase/pb_migrations/`
- **STRICTLY FORBIDDEN**: Creating migration files manually
- **STRICTLY FORBIDDEN**: Modifying existing migration files after they are created
- **REQUIRED**: Use PocketBase SDK only (see README.md:66-86 for examples)
- **REQUIRED**: Use PocketBase admin UI → export as migration via CLI
- **REQUIRED**: Create new migrations to fix issues, never edit existing ones

### Why This Rule Exists
Database migrations represent the historical evolution of the database schema. Once applied in any environment (development, staging, production), they cannot be safely modified as this can cause:
- Database corruption
- Data loss
- Deployment failures
- Inconsistent database states across environments

### Correct Migration Workflow
1. **Never edit migration files directly**
2. **Use PocketBase SDK** to make schema changes programmatically
3. **Export migrations** using PocketBase CLI tools
4. **Create new migrations** if fixes are needed to previous migrations
5. **Test thoroughly** before committing any database changes

### Emergency Procedure
If you discover you've accidentally edited a migration file:
1. **STOP immediately**
2. **Revert the changes** to the original migration
3. **Create a new migration** to implement the intended changes
4. **Inform the repository owner** of the violation

## Development Guidelines

### General Rules
- Always read this CLAUDE.md file first when starting work
- Follow existing code patterns and conventions
- Run tests before and after making changes
- Use the project's linting and formatting tools
- Never commit sensitive information (API keys, passwords, etc.)

### Code Style
- Follow the existing TypeScript/JavaScript patterns in the codebase
- Use the configured Biome formatter and linter
- Maintain consistent naming conventions
- Add appropriate error handling

### Testing
- Run the integration test suite before committing: `npm run docker:test`
- Ensure all tests pass before submitting changes
- Add tests for new functionality when appropriate
- **NO SCHEMA TESTS**: Don't write tests that just verify database schemas exist. Test actual behavior and user flows instead.

### Plans
- Plans describe WHAT should be enabled, not HOW to implement it
- Use "dev user stories" - describe the usage and behavior from a developer/tester perspective
- Never write implementation details in plans - that's what the code is for
- Focus on: What can the user/tester do? What should happen? What's the expected outcome?

### Git Workflow
- Use descriptive commit messages
- Include co-authoring information when appropriate
- Never force push to shared branches
- Keep commits focused and atomic

## Repository Structure

```
todo-app/
├── packages/
│   ├── api/pocketbase/         # Backend API and database
│   │   ├── pb_migrations/      # 🚨 AUTO-GENERATED - DO NOT EDIT
│   │   └── pb_hooks/          # Server-side business logic
│   ├── frontend/              # Astro frontend application
│   ├── mcp/                   # MCP server for AI integration
│   └── docs/                  # Documentation
└── agentic-work/              # AI workflow definitions
```

## Environment Setup

After cloning, create a `.env` file in the project root:

```bash
CLOUDFLARED_TUNNEL_TOKEN=your-tunnel-token-here
```

This token is required for the Cloudflare tunnel that exposes the MCP server for Claude integration.

## Key Commands

### Development
- Start development: `npm run dev`
- Run tests: `npm run docker:test`
- Format code: `npm run format`
- Lint code: `npm run lint`

### Database Operations
- **NEVER edit migrations manually**
- Use PocketBase admin UI at http://localhost:8090/_/
- Export changes as migrations using PocketBase CLI tools

Remember: When in doubt about database changes, ask the repository owner for guidance rather than editing migration files directly.