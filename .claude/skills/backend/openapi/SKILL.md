---
name: openapi
description: OpenAPI 3.0.3 specification guidelines, YAML structure, and API design patterns. Use when creating or updating OpenAPI specifications, designing REST APIs, defining request/response schemas, or documenting API endpoints. Includes modular file organization, common schema patterns, security schemes, and database schema integration.
---

# OpenAPI Speciality - <your-project-name> Project

This file contains all OpenAPI-specific configurations, patterns, and conventions for the **<your-project-name>** API specifications.

## Specification Format

- **OpenAPI Version**: 3.0.3
- **Format**: YAML
- **Structure**: Modular (main file + domain files + common file)

## File Organization

```
/api/
├── <your-project-name>-rest-api.yaml            # Main file (metadata, references domain files)
├── common.yaml                    # Shared schemas (BaseEntityDto, PageRequestDto, PageInfoDto, ErrorResponseDto, etc.)
├── normativos.yaml                # Normativos domain (paths + domain-specific schemas)
├── matrizes.yaml                  # Matrizes domain (paths + domain-specific schemas)
├── obrigacoes.yaml                # Obrigações domain (paths + domain-specific schemas)
└── {domain-name}.yaml             # Other domain-specific files
```

## Required Common Schemas (in common.yaml)

1. **BaseEntityDto**: Base entity with id, createdAt, updatedAt
2. **PageRequestDto**: Pagination request (page, pageSize, sort, filter)
3. **PageInfoDto**: Pagination metadata (page, pageSize, totalCount, totalPages, hasNext, hasPrevious)
4. **ErrorResponseDto**: Standard error response format with code, message, details

## Import Pattern Guidelines

- Use `$ref` to reference paths from domain files: `$ref: "./{domain}.yaml#/paths/{path}"`
- Use `$ref` to reference shared schemas from common.yaml: `$ref: "./common.yaml#/components/schemas/{SchemaName}"`
- Use `$ref` within domain files to reference domain-specific schemas: `$ref: "#/components/schemas/{SchemaName}"`
- Use `allOf` to extend BaseEntityDto in domain schemas
- Reference common parameters from common.yaml when needed
- Use proper path escaping for `$ref` (e.g., `~1normativos` for `/normativos`)

## OpenAPI Specification Guidelines

- Include all endpoints defined in the business requirements
- Define request/response schemas matching business requirements
- Document all query parameters (pagination, filtering, sorting)
- Specify authentication requirements (JWT Bearer token) in main file security section
- Include authorization requirements (roles/permissions) in endpoint security when specified
- Document error responses with proper status codes using ErrorResponseDto
- Use reusable components from common.yaml for common schemas
- Include examples for request/response bodies
- Follow RESTful conventions in path structure
- Version APIs appropriately (e.g., /api/v1/normativos)
- Group endpoints by domain using tags
- Use proper HTTP status codes (200, 201, 400, 401, 403, 404, 409, 500)
- Include required fields in schema definitions
- Add descriptions to all schemas and properties

## HTTP Status Codes

- 200 OK: Success response
- 201 Created: Resource created successfully
- 400 Bad Request: Validation errors
- 401 Unauthorized: Authentication required
- 403 Forbidden: Authorization failed
- 404 Not Found: Resource not found
- 409 Conflict: Business rule violation
- 500 Internal Server Error: Unexpected errors

## Security Schemes

- **bearerAuth**: JWT Bearer token authentication
  - Type: http
  - Scheme: bearer
  - Bearer Format: JWT

## Schema Patterns

- Use `allOf` to extend BaseEntityDto for entity schemas
- Use `type: array` with `items` for list responses
- Use `format: date-time` for DateTime fields
- Use `format: int64` for large integers
- Use `maxLength`, `minLength` for string constraints
- Use `minimum`, `maximum` for numeric constraints
- Use `pattern` for regex validation
- Mark required fields explicitly in `required` array

## Database Schema Integration

- When business requirements reference database entities, inspect the actual database schema
- Map OpenAPI schema fields to existing database columns accurately
- Use correct data types matching database schema (string maxLength from VARCHAR size, integer formats from INT/BIGINT)
- Mark fields as required based on database NOT NULL constraints
- Include proper format specifications (date-time, int64, etc.) matching database column types

## <your-project-name> API Context

### API Base Structure
- **Base Path**: `/api/v1`
- **Authentication**: JWT Bearer token (OAuth2/OIDC PKCE)
- **Main File**: `/api/<your-project-name>-rest-api.yaml`
- **Common Schemas**: `/api/common.yaml`
- **Domain Files**: `/api/{domain-name}.yaml` (normativos, matrizes, obrigacoes, etc.)

### <your-project-name> Domain Files
- **normativos.yaml**: Normativos (regulatory documents) endpoints
- **matrizes.yaml**: Matrices (thematic groupings) endpoints
- **obrigacoes.yaml**: Obligations endpoints
- **categorias.yaml**: Categories endpoints (if applicable)
- **temas.yaml**: Themes endpoints (if applicable)
- **entidades.yaml**: Entities (issuing organizations) endpoints (if applicable)

### <your-project-name> Common Patterns
- **Soft Delete**: All entities support soft delete via `isActive` boolean field (maps to `I_REG_ATIV` in DB)
- **Timestamps**: All entities include `createdAt` and `updatedAt` (map to `DT_CRIACAO`, `DT_ATUALIZACAO` in DB)
- **Pagination**: Standard pagination with `page`, `pageSize`, `totalCount`, `totalPages`, `hasNext`, `hasPrevious`
- **Filtering**: Query parameters for filtering (e.g., `referencia`, `tipoNormativoId`)
- **Sorting**: Query parameter `sort` with format `field:asc` or `field:desc`

### <your-project-name> Entity Naming Conventions
- API uses **camelCase**: `normativoId`, `referenciaNormativo`, `tipoNormativoId`
- Database uses **UPPER_SNAKE_CASE**: `ID_NORMTV`, `REF_NORMTV`, `ID_TIPO_NORMTV`
- OpenAPI schemas should use **camelCase** for consistency with frontend DTOs

### Example <your-project-name> Entity Schema
```yaml
NormativoDto:
  allOf:
    - $ref: "./common.yaml#/components/schemas/BaseEntityDto"
    - type: object
      required:
        - referencia
        - tipoNormativoId
      properties:
        referencia:
          type: string
          maxLength: 150
          description: "Normativo reference (e.g., 'Lei 123/2024')"
          example: "Lei 123/2024"
        tipoNormativoId:
          type: integer
          format: int64
          description: "ID of the normativo type"
          example: 1
        estadoNormativoId:
          type: integer
          format: int64
          description: "ID of the normativo state"
          example: 1
        dataPublicacao:
          type: string
          format: date
          description: "Publication date (YYYY-MM-DD)"
          example: "2024-01-15"
```

### <your-project-name> Database Tables Reference
- **TB<your-project-name>00001_NORMATIVO**: Normativos (REF_NORMTV, ID_TIPO_NORMTV, etc.)
- **TB<your-project-name>00002_MATRIZ**: Matrizes (NM_MATRIZ, DESCRICAO, etc.)
- **TB<your-project-name>00004_CATEGORIA**: Categories (D_CATEGORIA, etc.)
- **TB<your-project-name>00005_TEMA**: Themes (D_TEMA, ID_CATEGORIA, etc.)
- **TB<your-project-name>00006_TIPONORMATIVO**: Normativo types (DESCRICAO_TIPO_NORMATIVO, etc.)
- **TB<your-project-name>00007_OBRIGACAO**: Obligations (DESCRICAO, ID_MATRIZ, ID_NORMATIVO, etc.)
- **TB<your-project-name>00025_ENTIDADE**: Entities (D_ENTIDADE, etc.)

### Project References
- **OpenAPI Main File**: `/api/<your-project-name>-rest-api.yaml`
- **Common Schemas**: `/api/common.yaml`
- **Domain Files**: `/api/{domain-name}.yaml`
- **Technical Context**: `/documentation/docs/<your-project-name> - Contexto técnico - en-us.md`
- **Business Requirements**: `/documentation/specs/{req-id-name}/req.md`
