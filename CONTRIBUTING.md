# Contributing to LendStrangler

Thank you for contributing to LendStrangler! This project demonstrates production-grade legacy modernization and enterprise architecture standards.

---

## 1. Commit Message Convention

We strictly enforce [Conventional Commits](https://www.conventionalcommits.org/) via **Husky** and **commitlint**. Every commit must use one of the following prefixes:

- `feat:` A new feature or architectural component
- `fix:` A bug fix
- `refactor:` Code changes that neither fix a bug nor add a feature
- `test:` Adding missing tests or correcting existing tests
- `docs:` Documentation updates
- `chore:` Changes to the build process or auxiliary tools/libraries
- `ci:` Changes to CI configuration files and scripts

**Rules:**
- Keep commit subjects concise (max 100 characters).
- Use imperative mood ("implement feature", not "implemented feature").

---

## 2. Quality Bar & Pull Request Checklist

Before submitting a PR, verify:

1. **TypeScript Strict Mode:** Zero `any` types; Zod validation at every domain and API boundary.
   ```bash
   npm run typecheck
   ```
2. **Tests & Coverage:** 80%+ coverage on domain logic (reducing-balance EMI calculator, underwriting engine, saga handlers).
   ```bash
   npm run test:coverage
   ```
3. **Build:** All packages, services, and frontend bundle build cleanly without warnings.
   ```bash
   npm run build
   ```
4. **Code Formatting:**
   ```bash
   npm run format
   ```
