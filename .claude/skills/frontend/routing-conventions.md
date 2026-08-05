# Route Naming Conventions

Applies to all frontend stacks (React, Angular, etc.).

- All routes must be in **English**, regardless of the UI language.
- Use **kebab-case**, lowercase only (`/user-profile`, not `/userProfile` or `/user_profile`).
- Use **plural nouns** for resource collections (`/products`, `/products/:id`).
- Use **verbs only for actions**, never for resources (`/posts/:id/edit`, not `/getPost/:id`).
- Reflect data hierarchy in the path (`/users/:userId/orders/:orderId`).
- Use **path params** to identify resources, **query params** for filters (`/products?category=shoes`).
- Prefix authenticated areas (`/admin/*`, `/account/*`).
- For multilingual apps, locale goes first but route names stay in English (`/pt-br/products`, not `/pt-br/produtos`).
- Keep routes short, semantic, and consistent across the project.
