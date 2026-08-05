---
name: react
description: React 19+ development guidelines, patterns, and best practices. Use when working with React frontend projects, building components, implementing state management, setting up authentication, or configuring React applications. Includes testing with Vitest and Playwright, and design system integration.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# React Speciality - <your-project-name> Project

This file contains all React-specific configurations, patterns, and conventions for the **<your-project-name>** frontend system.

## Technology Stack

- **React**: 19+ (Server Components, Actions, use() hook)
- **TypeScript**: 5.x strict mode
- **Vite**: Build tool and dev server
- **React Router**: v6+ (data APIs, loaders, `<Outlet />`)
- **Tailwind CSS**: v4+ utility-first CSS framework

## State Management

**Decision hierarchy (from simplest to most complex):**

1. **React Context** (default) — shared UI state scoped to a feature tree (auth, theme, user preferences)
2. **Zustand** — cross-feature client state when Context becomes insufficient
3. **Redux Toolkit** — reserved for genuinely complex async flows or when time-travel debugging is a hard Transaction

**Server state (always):**

- **TanStack Query (React Query)**: Server state management (fetching, caching, synchronization) — never use Zustand/Redux for server state
- **URL state**: Use search params for filterable/shareable UI state

## Authentication & Security

- **oidc-client-ts** + **react-oidc-context**: OAuth2/OIDC with PKCE flow
- Fetch API (default) or Axios (optional — when interceptors, cancellation, or consistent error handling are needed) for API communication
- Auth guard (ProtectedRoute component) for route protection
- Auth context/provider for authentication orchestration

## Testing Infrastructure

- **Vitest**: Unit testing (Vite-native, Jest-compatible API)
- **Testing Library React**: Component testing (@testing-library/react)
- **Playwright**: E2E testing with multiple browser support
- **MSW (Mock Service Worker)**: API mocking for tests and development
- Test coverage configuration via Vitest

## Development Tools

- **ESLint**: Code quality with React-specific rules (eslint-plugin-react, eslint-plugin-react-hooks)
- **Prettier**: Code formatting
- **TypeScript**: Strict mode with path aliases
- **Module path aliases**: @app, @core, @shared, @features (via tsconfig paths + Vite resolve)

## React 19+ Best Practices

- Use functional components exclusively — no class components
- Leverage React Server Components where the framework supports them
- Use the `use()` hook for reading resources (promises, context)
- Implement Actions for form handling and mutations
- Design components with single responsibility and clear prop interfaces
- Apply composition over inheritance — use children, render props, and custom hooks
- Consider lazy loading with `React.lazy()` and `Suspense` for code splitting
- Use `useCallback`, `useMemo`, and `React.memo` only when profiling shows a need — avoid premature optimization
- Prefer controlled components for forms
- Keep state as close to where it's used as possible — lift only when necessary
- Use custom hooks to extract reusable stateful logic
- Leverage `useId()` for accessible, SSR-safe unique IDs
- Use `useOptimistic()` for optimistic UI updates
- Use `useTransition()` for non-urgent state updates

## Code Quality Standards

- Write self-documenting code with clear naming conventions
- Add JSDoc comments for public APIs and complex logic
- Implement proper TypeScript types — avoid `any`
- Use strict TypeScript configuration
- Follow consistent code formatting (Prettier) and linting rules (ESLint)
- Apply SOLID principles to component and hook design

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | `PascalCase` | `NormativosList` |
| Hooks | `useCamelCase` | `useNormativos` |
| Context | `XxxContext` + `XxxProvider` | `AuthContext`, `AuthProvider` |
| Services/API | `camelCase` | `normativoService` |
| Types/Interfaces | `PascalCase` (no I prefix) | `Normativo`, `NormativoFilter` |
| Constants | `UPPER_SNAKE_CASE` | `API_BASE_URL` |
| Files (components) | `PascalCase.tsx` | `NormativosList.tsx` |
| Files (hooks/utils) | `camelCase.ts` | `useNormativos.ts` |
| Test files | `*.test.ts(x)` | `NormativosList.test.tsx` |

## User Experience Focus

- Implement proper loading states with Suspense boundaries and skeleton screens
- Provide meaningful error messages with Error Boundaries
- Ensure keyboard navigation and screen reader support (WCAG 2.1 AA minimum)
- Design responsive layouts that work across devices
- Optimize for Core Web Vitals (LCP, INP, CLS)
- Implement proper form validation with clear user feedback

## Testing Strategy

- Write unit tests for components, hooks, and utilities
- Test user interactions and edge cases with Testing Library
- Query elements by **accessible roles and labels** (`getByRole`, `getByLabelText`) — use `data-testid` only as a last resort
- Use MSW for API mocking — no direct fetch/axios mocking
- Test behavior, not implementation details
- Aim for **80%+ coverage** on business logic; coverage alone doesn't equal quality
- Mock only **external dependencies** (API, timers) — not your own modules

## Performance Optimization

- Use `React.memo()` only after profiling identifies re-render issues
- Implement code splitting with `React.lazy()` and `Suspense`
- Optimize images with lazy loading and proper sizing
- Minimize bundle size through tree-shaking and dynamic imports
- Use TanStack Query's caching and deduplication for server state
- Virtualize large lists with `@tanstack/react-virtual`
- Profile with React DevTools Profiler before optimizing

## Accessibility (REQUIRED)

- MUST target WCAG 2.1 AA compliance minimum
- MUST support full keyboard navigation
- MUST provide visible focus indicators
- MUST use semantic HTML and proper ARIA attributes
- MUST ensure sufficient color contrast ratios

## Error Handling & UX (REQUIRED)

- MUST implement Error Boundaries for unexpected errors (class component or react-error-boundary library)
- MUST use API client interceptor with retry logic for transient failures
- MUST provide user feedback via toast notifications for actions
- MUST include 404 and 500 error pages
- MUST handle loading states consistently with Suspense
- **CRITICAL: Backend Error Propagation**: When the backend returns an error response, the frontend MUST display the exact error message from the backend to the user without modification. Extract the error message from the HTTP error response and display it directly to the user.

## Performance (REQUIRED)

- MUST use code splitting with `React.lazy()` for route-level components
- MUST implement proper key props for all list renderings
- MUST use `@tanstack/react-virtual` for large lists (>100 items)
- MUST configure route-based code splitting and prefetching
- MUST enforce build size budgets (Vite build analysis)

## Security (REQUIRED)

- MUST avoid `dangerouslySetInnerHTML` — use DOMPurify if absolutely necessary
- MUST sanitize user input properly
- MUST implement Content Security Policy headers
- MUST validate all external data with Zod schemas
- MUST use HTTPS for all API communications

## Testing Transactions (REQUIRED)

- MUST write unit tests using Vitest and Testing Library
- MUST write E2E tests using Playwright
- MUST prefer accessible selectors (`getByRole`, `getByLabel`) — use `data-testid` only as a last resort
- MUST achieve minimum 80% code coverage for business logic
- MUST test critical user flows with E2E tests
- MUST use MSW for API mocking in tests
- MUST mock only external dependencies (API, timers) — not internal modules

## Design System & Branding (REQUIRED)

### Design System - <your-project-name> Project

**CRITICAL**: All <your-project-name> frontend projects MUST comply with the official **Design System**. The design system assets define the complete visual language for the <your-project-name> application.

**Design System Assets Location**: `./design-system/Design System.zip` (reference)

**Required Assets**:
- **Colors** (`Color.png`): Color palette, primary/secondary colors, semantic colors, gradients
- **Typography** (`Typography.png`): Font families, sizes, weights, line heights, text styles
- **Layout** (`Layout.png`): Grid system, spacing scale, container widths, breakpoints
- **Style** (`Style.png`): Visual principles, shadows, borders, radius, elevation
- **Icons** (`Icons/` folder):
  - `Design System.svg`: Icon system documentation
  - `Icons.png`: Complete icon library reference
- **Logo** (`Logo/` folder):
  - `Logo.png`: Primary logo asset
  - `Property 1=Positive.svg`: Logo positive variant (light backgrounds)
  - `Property 1=Negative.svg`: Logo negative variant (dark backgrounds)

**Implementation Transactions**:
- **MUST** extract color palette from `Color.png` and implement as CSS custom properties / Tailwind theme tokens
- **MUST** configure Tailwind CSS theme to match Design System colors
- **MUST** implement typography system from `Typography.png` (font families, sizes, weights) in Tailwind config
- **MUST** follow layout guidelines from `Layout.png` (grid, spacing, containers)
- **MUST** use Design System icons from `Icons/` folder (via lucide-react or custom SVG components)
- **MUST** use appropriate logo variant from `Logo/` folder based on background
- **MUST** follow style guidelines from `Style.png` for shadows, borders, and visual effects
- **MUST** ensure all UI components comply with design system specifications

## Project Bootstrap & Setup

### Prerequisites

- Node 20+, npm 10+
- TypeScript strict mode enabled
- ESLint + Prettier configured for code quality

### Bootstrap Commands (Windows PowerShell)

```powershell
# Create React app with Vite
npm create vite@latest <projectName> -- --template react-ts
cd <projectName>
npm install

# Tailwind CSS v4 - REQUIRED
npm install tailwindcss @tailwindcss/vite

# React Router - REQUIRED
npm install react-router

# TanStack Query (server state) - REQUIRED
npm install @tanstack/react-query @tanstack/react-query-devtools

# Zustand (client state) - REQUIRED
npm install zustand

# Form handling + validation - REQUIRED
npm install react-hook-form @hookform/resolvers zod

# HTTP client - OPTIONAL (use when interceptors, cancellation, or consistent error handling are needed)
# npm install axios

# OAuth2/OIDC (PKCE) - REQUIRED
npm install oidc-client-ts react-oidc-context

# ESLint + Prettier - REQUIRED
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks
npm install -D prettier eslint-config-prettier

# Vitest + Testing Library - REQUIRED
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/testing-library__jest-dom

# MSW (API mocking) - REQUIRED
npm install -D msw

# Playwright (E2E) - REQUIRED
npm install -D @playwright/test
npx playwright install

# Virtual scrolling (large lists) - REQUIRED
npm install @tanstack/react-virtual

# Error Boundary - REQUIRED
npm install react-error-boundary
```

### Required package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:report": "playwright show-report",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  }
}
```

### Required Folder Structure

```
<projectName>/
├── src/
│   ├── app/                         [REQUIRED]
│   │   ├── providers.tsx            [REQUIRED - wraps QueryClient, Auth, Router]
│   │   ├── routes.tsx               [REQUIRED - route definitions]
│   │   └── App.tsx                  [REQUIRED - root component]
│   ├── core/                        [REQUIRED]
│   │   ├── auth/                    [REQUIRED]
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── useAuth.ts
│   │   ├── api/                     [REQUIRED]
│   │   │   ├── apiClient.ts         [Fetch wrapper or Axios instance with interceptors]
│   │   │   └── queryClient.ts       [TanStack Query client config]
│   │   └── config/                  [REQUIRED]
│   │       └── appConfig.ts         [Runtime config loader]
│   ├── shared/                      [REQUIRED]
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── types/
│   ├── features/                    [REQUIRED]
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   └── normativos/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── services/
│   │       ├── types/
│   │       └── index.ts
│   ├── components/                  [REQUIRED - shared UI components]
│   │   └── ui/                      [Reusable UI primitives]
│   ├── pages/                       [REQUIRED - route-level entry points]
│   │   ├── HomePage.tsx
│   │   └── NotFoundPage.tsx
│   ├── layout/                      [REQUIRED]
│   │   ├── MainLayout.tsx
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── lib/                         [REQUIRED - utility functions]
│   │   └── utils.ts                 [Utility functions (e.g. cn() helper)]
│   ├── main.tsx
│   └── index.css                    [Tailwind imports + CSS variables]
├── public/                          [REQUIRED]
│   └── config.json                  [REQUIRED - runtime configuration]
├── e2e/                             [REQUIRED]
│   └── (Playwright tests)
├── vitest.config.ts                 [REQUIRED]
├── playwright.config.ts             [REQUIRED]
├── eslint.config.js                 [REQUIRED]
├── tailwind.config.ts               [REQUIRED - design system tokens]
├── tsconfig.json                    [REQUIRED with strict mode + path aliases]
├── tsconfig.app.json
├── vite.config.ts                   [REQUIRED]
└── package.json
```

### Required Providers Setup (src/app/providers.tsx)

The providers.tsx MUST include ALL of these providers:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from 'react-oidc-context';
import { BrowserRouter } from 'react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { queryClient } from '@/core/api/queryClient';
import { authConfig } from '@/core/auth/AuthProvider';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AuthProvider {...authConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            {children}
          </BrowserRouter>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

### Runtime Configuration

- MUST provide `config.json` in `public/` with `apiUrl`, `auth.authority`, etc.
- MUST load configuration at app startup before rendering
- MUST expose configuration via `appConfig` module

### TanStack Query Conventions (REQUIRED)

- MUST use query keys as arrays: `['normativos', 'list', filters]`
- MUST use `queryKey` factories per feature: `normativosKeys.list(filters)`
- MUST handle loading/error/success states in UI
- MUST use `useMutation` for create/update/delete operations
- MUST invalidate related queries after mutations
- MUST configure sensible defaults for `staleTime` and `gcTime`

### Client State Conventions (REQUIRED)

**Zustand (preferred for most apps):**
- MUST use slices pattern for complex stores
- MUST keep stores small and focused (one per concern)
- Use for UI state only (sidebar open, selected theme, etc.)
- Server state belongs in TanStack Query, not Zustand

**Redux Toolkit (optional — high-complexity apps only):**
- Use only when the app requires cross-feature state with complex async flows or time-travel debugging
- MUST use `createSlice` — never write raw reducers
- MUST use `createAsyncThunk` for async operations
- Normalize relational data with `createEntityAdapter`

### Theming & UI (REQUIRED)

- MUST choose styling system based on the design system library the project consumes:
  - **Path A (PT)**: CSS / SCSS Modules — when consuming `ctt-web-components` (PT design system)
  - **Path B (ES)**: Tailwind CSS v4 — when consuming `@ctt-library/*` (ES design system)
- MUST express all design values (colours, spacing, typography) via **CSS custom properties** regardless of styling engine
- MUST support dark mode toggle (via Tailwind `dark:` variant or CSS custom properties)
- MUST use CSS variables for theming (colors, spacing, typography)
- MUST ensure responsive layout across all screen sizes
- MUST maintain consistent design system

### Playwright E2E Testing Policy

- For every new feature, user flow, or regression fix, add or update Playwright E2E tests in the `e2e` suite
- Prefer resilient selectors using `data-testid` attributes; avoid brittle text/XPath selectors
- Cover at minimum:
  - Happy path for core user flow
  - Validation and error states relevant to the change
  - Authorization/visibility behavior if applicable
- Keep E2E fast and deterministic: isolate state, mock external calls at the network layer when needed, and reset data between tests

Example test skeleton:
```ts
// e2e/specs/normativos-list.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Normativos - Listagem', () => {
  test('deve listar e filtrar normativos', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-normativos').click();
    await expect(page.getByTestId('normativos-title')).toBeVisible();

    await page.getByTestId('filter-referencia').fill('DL');
    await page.getByTestId('apply-filters').click();

    await expect(page.getByTestId('grid-row')).toHaveCountGreaterThan(0);
  });
});
```

Recommended selectors in JSX:
```tsx
<h1 data-testid="normativos-title">Normativos</h1>
<input data-testid="filter-referencia" />
<button data-testid="apply-filters">Pesquisar</button>
{rows.map((row) => (
  <tr key={row.id} data-testid="grid-row">...</tr>
))}
```

## <your-project-name> Technical Context

### Domain Concepts
The <your-project-name> system manages regulatory and legal norms with the following core concepts:

**Core Entities**:
- **Normativos**: Regulatory documents (Laws, Decrees, Resolutions)
- **Matrizes**: Thematic matrices that group related normativos
- **Categorias**: Classification categories for organizing content
- **Temas**: Themes within categories for finer granularity
- **Obrigações**: Obligations derived from normativos and matrices
- **Entidades**: Issuing entities/organizations
- **Tipos de Normativo**: Types of regulatory documents

**Key Features**:
- Search and filter normativos by multiple criteria
- Characterize normativos (assign categories, themes, obligations)
- Manage matrices and their relationships
- Track obligations and their normative sources
- Support versioning and soft delete (I_REG_ATIV)

### Backend API Integration
- **Base URL**: Configured via runtime `config.json` (`apiUrl`)
- **API Version**: `/api/v1/`
- **Authentication**: OAuth2/OIDC with PKCE flow (JWT Bearer tokens)
- **Error Format**: Standardized ErrorResponseDto from backend
- **Pagination**: Standard format (page, pageSize, totalCount, hasNext, hasPrevious)

### Required Configuration Keys (`public/config.json`)
```json
{
  "apiUrl": "http://localhost:5000/api/v1",
  "auth": {
    "authority": "https://auth-server.example.com",
    "clientId": "<your-project-name>-frontend",
    "scope": "openid profile email <your-project-name>-api",
    "responseType": "code",
    "redirectUri": "http://localhost:5173/auth/callback",
    "postLogoutRedirectUri": "http://localhost:5173",
    "usePkce": true
  }
}
```

### Project File References
- **Technical Context Document**: `/documentation/docs/<your-project-name> - Contexto técnico - en-us.md`
- **OpenAPI Specifications**: `/api/<your-project-name>-rest-api.yaml` and domain-specific files
- **Business Transactions**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/req.md`
- **Frontend Technical Specs**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}-frontend-tech-spec.md`
- **Backend Technical Specs**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}-backend-tech-spec.md`

## Route Naming Conventions

See [../routing-conventions.md](../routing-conventions.md) — shared across all frontend stacks.
## Focus Management — Inline Edit + Modal Interactions (REQUIRED)

Any screen that combines inline-edit rows (e.g. table rows with auto-commit on blur) with modals opened from within those rows (e.g. LOV/search modals) MUST follow these rules:

- **Commit guard**: Any component with a "blur → commit" side-effect MUST suppress that logic when focus moves to a modal it triggered. Implement via an `isLovOpen` / `hasActiveModal` boolean prop passed from the parent, or by checking `document.activeElement?.closest('[role="dialog"]')` before committing.
- **Focus trap**: All modal components that can be opened from an inline-edit context MUST trap focus inside themselves until dismissed. Intercept `Tab` and `Shift+Tab` on the modal container and cycle through its focusable children (`input, button, [tabindex]:not([tabindex="-1"])`), preventing Tab from reaching background elements.
- **Acceptance criteria**: Any screen combining inline editing with modals MUST include the acceptance criterion: "User can type in the modal search/input box without focus escaping to the background table."
- **Test plan**: MUST include a test case asserting `document.activeElement` remains inside the modal while the user types.
