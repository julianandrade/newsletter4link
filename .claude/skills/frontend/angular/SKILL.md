---
name: angular
description: Angular 18+ development guidelines, patterns, and best practices. Use when working with Angular frontend projects, building components, implementing state management with NgRx, setting up authentication, or configuring Angular applications. Includes PrimeNG component library usage, testing with Jest and Playwright, and design system integration.
---

# Angular Speciality - <your-project-name> Project

This file contains all Angular-specific configurations, patterns, and conventions for the **<your-project-name>** frontend system.

## Technology Stack

- **Angular**: 18+ (standalone components, signals)
- **Angular Material**: Custom theme, typography, and animations
- **PrimeNG**: Preferred component library for UI components (https://primeng.org/)
- **Angular CDK**: Advanced UI patterns
- **Angular PWA**: Progressive Web App capabilities
- **Angular Service Worker**: Offline functionality

## State Management

- **NgRx Store**: Centralized state management
- **NgRx Effects**: Side effects handling
- **NgRx Entity**: Normalized state
- **NgRx Router Store**: Router state sync
- **NgRx Store DevTools**: Debugging

## Authentication & Security

- **angular-oauth2-oidc**: OAuth2/OIDC with PKCE flow
- Token interceptor for API authentication
- Auth guard for route protection
- Auth service for authentication orchestration

## Testing Infrastructure

- **Jest**: Unit testing with jest-preset-angular
- **Testing Library Angular**: Component testing
- **Playwright**: E2E testing with multiple browser support
- Test coverage configuration

## Development Tools

- **ESLint**: Code quality with Angular-specific rules
- **TypeScript**: Strict mode
- **Module path aliases**: @app, @core, @shared, @features

## Angular 18+ Best Practices

- Use standalone components by default for maximum modularity
- Implement smart/container and presentational component patterns appropriately
- Leverage Angular signals for reactive state management
- Design components with single responsibility and clear interfaces
- Apply composition over inheritance principles
- Consider lazy loading and code splitting for optimal bundle sizes
- Utilize control flow syntax (@if, @for, @switch) over structural directives
- Implement proper dependency injection with inject() function and providedIn
- Use defer blocks for optimized loading strategies
- Leverage computed signals and effects appropriately
- Apply proper change detection strategies (OnPush where beneficial)
- Use the modern HttpClient with functional interceptors

## UI Component Libraries

- **PrimeNG is the preferred component library** for building Angular UI components: https://primeng.org/
- Follow PrimeNG documentation and patterns when implementing components
- Leverage PrimeNG's comprehensive component suite for consistent UI/UX across the application
- Import only the specific PrimeNG modules needed to optimize bundle size

## Code Quality Standards

- Write self-documenting code with clear naming conventions
- Add JSDoc comments for public APIs and complex logic
- Implement proper TypeScript types - avoid 'any'
- Use strict TypeScript configuration
- Follow consistent code formatting and linting rules
- Apply SOLID principles to component and service design

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | `XxxComponent` | `NormativosListComponent` |
| Services | `XxxService` | `NormativoService` |
| Guards | `XxxGuard` | `AuthGuard` |
| Interceptors | `XxxInterceptor` | `TokenInterceptor` |
| Store (NgRx) | `featureKey`, action triads `load/success/failure` | `normativos`, `loadNormativos` |
| Selectors | `selectXxx` | `selectNormativosList` |

## User Experience Focus

- Implement proper loading states and skeleton screens
- Provide meaningful error messages and error boundaries
- Ensure keyboard navigation and screen reader support (WCAG 2.1 AA minimum)
- Design responsive layouts that work across devices
- Optimize for Core Web Vitals (LCP, FID, CLS)
- Implement proper form validation with clear user feedback

## Testing Strategy

- Write unit tests for components, services, and pipes
- Test user interactions and edge cases
- Use TestBed for component integration tests
- Mock dependencies appropriately with spies/mocks compatible with the chosen test runner
- Aim for meaningful test coverage, not just high percentages

## Performance Optimization

- Use OnPush change detection where appropriate
- Implement virtual scrolling for large lists (CDK)
- Optimize images and assets
- Minimize bundle size through tree-shaking and lazy loading
- Profile and optimize expensive operations
- Use trackBy functions in *ngFor loops

## Accessibility (REQUIRED)

- MUST target WCAG 2.1 AA compliance minimum
- MUST support full keyboard navigation
- MUST provide visible focus indicators
- MUST use semantic HTML and proper ARIA attributes
- MUST ensure sufficient color contrast ratios

## Error Handling & UX (REQUIRED)

- MUST implement global `ErrorHandler` for unexpected errors
- MUST use HTTP interceptor with retry logic for transient failures
- MUST provide user feedback via snackbars/toasts for actions
- MUST include 404 and 500 error pages
- MUST handle loading states consistently
- **CRITICAL: Backend Error Propagation**: When the backend returns an error response, the frontend MUST display the exact error message from the backend to the user without modification. Extract the error message from the HTTP error response and display it directly to the user.

## Performance (REQUIRED)

- MUST use OnPush change detection strategy where beneficial
- MUST implement `trackBy` functions for all `*ngFor` loops
- MUST use `cdk-virtual-scroll` for large lists (>100 items)
- MUST configure route preloading strategies
- MUST enforce build size budgets

## Security (REQUIRED)

- MUST avoid inline scripts and styles
- MUST sanitize user input properly
- MUST implement Content Security Policy headers
- MUST validate all external data
- MUST use HTTPS for all API communications

## Testing Requirements (REQUIRED)

- MUST write unit tests using Jest and Testing Library
- MUST write E2E tests using Playwright
- MUST use `data-testid` attributes for E2E selectors
- MUST achieve minimum 70% code coverage for business logic
- MUST test critical user flows with E2E tests

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

**Implementation Requirements**:
- **MUST** extract color palette from `Color.png` and implement as CSS custom properties
- **MUST** configure Angular Material theme to match Design System colors
- **MUST** implement typography system from `Typography.png` (font families, sizes, weights)
- **MUST** follow layout guidelines from `Layout.png` (grid, spacing, containers)
- **MUST** use Design System icons from `Icons/` folder
- **MUST** use appropriate logo variant from `Logo/` folder based on background
- **MUST** follow style guidelines from `Style.png` for shadows, borders, and visual effects
- **MUST** ensure all UI components comply with design system specifications

## Project Bootstrap & Setup

### Prerequisites

- Node 20+, pnpm 9 via corepack, Angular CLI (see version above)
- TypeScript strict mode enabled
- ESLint configured for code quality

### Bootstrap Commands (Windows PowerShell)

```powershell
# pnpm via corepack
corepack enable
corepack prepare pnpm@9 --activate

# Create Angular app
pnpm dlx @angular/cli@latest new <projectName> `
  --routing --standalone --style=scss --package-manager=pnpm
cd <projectName>

# Angular Material (custom theme, typography, animations) - REQUIRED
pnpm ng add @angular/material@latest --theme custom --typography true --animations true

# PrimeNG - REQUIRED (preferred component library for Angular components: https://primeng.org/)
pnpm add primeng primeicons

# PWA - REQUIRED
pnpm ng add @angular/pwa@latest

# ESLint - REQUIRED
pnpm ng add @angular-eslint/schematics@latest

# Jest + Testing Library - REQUIRED
pnpm add -D jest jest-preset-angular ts-jest @types/jest @testing-library/angular @testing-library/jest-dom

# Playwright (E2E) - REQUIRED
pnpm add -D @playwright/test
pnpm exec playwright install

# NgRx Complete Suite - REQUIRED
pnpm ng add @ngrx/store@latest
pnpm add @ngrx/effects@latest @ngrx/entity@latest @ngrx/router-store@latest @ngrx/store-devtools@latest

# OAuth2/OIDC (PKCE) - REQUIRED
pnpm add angular-oauth2-oidc
```

### Required package.json Scripts

```json
{
  "scripts": {
    "start": "ng serve",
    "build": "ng build",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:report": "playwright show-report",
    "lint": "ng lint"
  }
}
```

### Required Folder Structure

```
<projectName>/
├── src/
│   ├── app/
│   │   ├── core/                    [REQUIRED]
│   │   │   ├── auth/                [REQUIRED]
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.guard.ts
│   │   │   │   └── token.interceptor.ts
│   │   │   ├── api/                 [REQUIRED]
│   │   │   │   └── api.service.ts
│   │   │   └── config/              [REQUIRED]
│   │   │       ├── app-config.service.ts
│   │   │       └── (loaded in app.config.ts)
│   │   ├── shared/                  [REQUIRED]
│   │   │   ├── components/
│   │   │   ├── directives/
│   │   │   ├── pipes/
│   │   │   └── models/
│   │   ├── features/                [REQUIRED]
│   │   │   ├── dashboard/
│   │   │   ├── normativos/
│   │   │   │   ├── models/
│   │   │   │   └── services/
│   │   │   ├── matrizes/
│   │   │   └── tabelas/
│   │   ├── layout/                  [REQUIRED]
│   │   ├── app.component.ts
│   │   ├── app.config.ts            [REQUIRED with specific providers]
│   │   └── app.routes.ts
│   └── (assets/ or public/)         [REQUIRED]
│       └── config.json              [REQUIRED]
├── e2e/                             [REQUIRED]
│   └── (Playwright tests)
├── jest.config.ts                   [REQUIRED]
├── setup-jest.ts                    [REQUIRED]
├── playwright.config.ts             [REQUIRED]
├── eslint.config.js                 [REQUIRED]
├── tsconfig.json                    [REQUIRED with strict mode]
├── ngsw-config.json                 [REQUIRED for PWA]
└── package.json
```

### Required app.config.ts Configuration

The app.config.ts MUST include ALL of these providers:

```typescript
import { ApplicationConfig, provideZoneChangeDetection, isDevMode, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { AppConfigService } from './core/config/app-config.service';

export function initializeApp(appConfig: AppConfigService) {
  return () => appConfig.loadConfig();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideStore(),
    provideEffects(),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AppConfigService],
      multi: true
    }
  ]
};
```

### Runtime Configuration

- MUST provide `config.json` in public/ or assets/ with `apiUrl`, `auth.authority`, etc.
- MUST load configuration at bootstrap with `APP_INITIALIZER` in `app.config.ts`
- MUST expose configuration via `AppConfigService`

### NgRx Conventions (REQUIRED)

- MUST use feature stores with proper module isolation
- MUST use `EntityAdapter` for normalized collections
- MUST implement memoized selectors for derived state
- MUST handle side effects with NgRx Effects
- MUST follow action triads pattern: `load/success/failure`
- Consider using `correlationId` for request idempotency

### Theming & UI (REQUIRED)

- MUST use Angular Material with custom theme configuration
- MUST use PrimeNG as the preferred component library for Angular components: https://primeng.org/
- MUST support dark mode toggle functionality
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

Recommended selectors in templates:
```html
<h1 data-testid="normativos-title">Normativos</h1>
<input data-testid="filter-referencia" />
<button data-testid="apply-filters">Pesquisar</button>
<tr *ngFor="let row of rows; trackBy: trackById" data-testid="grid-row"></tr>
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

### Required Configuration Keys (`assets/public/config.json`)
```json
{
  "apiUrl": "http://localhost:5000/api/v1",
  "auth": {
    "authority": "https://auth-server.example.com",
    "clientId": "<your-project-name>-frontend",
    "scope": "openid profile email <your-project-name>-api",
    "responseType": "code",
    "redirectUri": "http://localhost:4200/auth/callback",
    "postLogoutRedirectUri": "http://localhost:4200",
    "usePkce": true
  }
}
```

### Project File References
- **Technical Context Document**: `/documentation/docs/<your-project-name> - Contexto técnico - en-us.md`
- **OpenAPI Specifications**: `/api/<your-project-name>-rest-api.yaml` and domain-specific files
- **Business Requirements**: `/documentation/specs/{req-id-name}/req.md`
- **Frontend Technical Specs**: `.claude/docs/requirements/{req-id-name}/{req-id}-frontend-tech-spec.md`
- **Backend Technical Specs**: `.claude/docs/requirements/{req-id-name}/{req-id}-backend-tech-spec.md`
