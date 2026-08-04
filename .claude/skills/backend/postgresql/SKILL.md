---
name: postgresql
description: PostgreSQL 15+ database configuration, schema mapping, and Entity Framework Core patterns. Use when working with database operations, mapping entities to existing tables, configuring EF Core, or accessing PostgreSQL databases. Includes connection details, table structures, soft delete patterns, and database inspection queries.
---

# PostgreSQL Speciality - <your-project-name> Project

This file contains all PostgreSQL-specific configurations, database schemas, and database access patterns for the **<your-project-name>** backend system.

## Database Technology

- **Database**: PostgreSQL 15+ (primary), SQL Server (optional)
- **Provider**: Npgsql.EntityFrameworkCore.PostgreSQL 8.0 - PostgreSQL provider for EF Core

## <your-project-name> Database Context

### Connection Details
- **Container**: `<your-project-name>-postgres`
- **User**: `<your-project-name>_user`
- **Password**: `<your-project-name>_pass123`
- **Database**: `<your-project-name>_db`
- **Port**: `5432`

### Existing Database Tables (USE ONLY THESE - NO NEW TABLES)

**Core Entities:**

- **TB<your-project-name>00001_NORMATIVO**: Regulatory documents (Leis, Decretos)
  - Columns: ID_NORMTV, REF_NORMTV, ID_TIPO_NORMTV, ID_ESTADO_NORMTV, etc.
- **TB<your-project-name>00002_MATRIZ**: Thematic matrices grouping normativos
  - Columns: ID_MATRIZ, NM_MATRIZ, DESCRICAO, I_REG_ATIV, etc.
- **TB<your-project-name>00004_CATEGORIA**: Classification categories
  - Columns: ID_CATEGORIA, D_CATEGORIA, I_REG_ATIV, etc.
- **TB<your-project-name>00005_TEMA**: Themes within categories
  - Columns: ID_TEMA, ID_CATEGORIA, D_TEMA, I_REG_ATIV, etc.
- **TB<your-project-name>00006_TIPONORMATIVO**: Types of regulatory documents
  - Columns: ID_TIPO_NORMTV, DESCRICAO_TIPO_NORMATIVO, I_REG_ATIV, etc.
- **TB<your-project-name>00025_ENTIDADE**: Issuing entities
  - Columns: ID_ENTIDADE, D_ENTIDADE, I_REG_ATIV, etc.
- **TB<your-project-name>00007_OBRIGACAO**: Obligations associated with matrices and normativos
  - Columns: ID_OBRIGACAO, ID_MATRIZ, ID_NORMATIVO, DESCRICAO, etc.

### Database Access Commands

**Check if database services are running:**
```bash
cd backend
podman-compose ps
```

**Start database services:**
```bash
cd backend
podman-compose up -d
```

**Connect to PostgreSQL database:**
```bash
podman exec -it <your-project-name>-postgres psql -U <your-project-name>_user -d <your-project-name>_db
```

**Useful PostgreSQL inspection queries:**
```sql
-- List all columns for a table
SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'TB<your-project-name>00001_NORMATIVO'
ORDER BY ordinal_position;

-- Check foreign key relationships
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'TB<your-project-name>00001_NORMATIVO';

-- Check primary keys
SELECT column_name
FROM information_schema.key_column_usage
WHERE table_name = 'TB<your-project-name>00001_NORMATIVO'
  AND constraint_name IN (
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'TB<your-project-name>00001_NORMATIVO'
      AND constraint_type = 'PRIMARY KEY'
  );
```

## Database Mapping Guidelines

- **CRITICAL**: All entity mappings MUST use existing database tables and columns
- **NEVER** create new database tables or modify schema
- Use EF Core configurations with explicit column mappings
- Implement soft delete using `I_REG_ATIV` column (1 = active, 0 = inactive)
- Map relationships using existing foreign keys
- Use existing column names (verified via database inspection)
- **Field Naming Convention**: Database uses UPPER_SNAKE_CASE, API uses camelCase, Domain uses PascalCase

### Common Mapping Patterns

- **Boolean Fields**: Database may use CHAR(1) with '1'/'0' or BIT, map to C# bool
- **Date Fields**: Database may use DATE, DATETIME, or TIMESTAMP, map to C# DateTime
- **Soft Delete**: Use existing `I_REG_ATIV` column (typically '1' = active, '0' = inactive)
- **Foreign Keys**: Map to existing ID columns (e.g., `ID_TIPO_NORMTV`, `ID_MATRIZ`)

## Performance Guidelines

- **Pagination**: Always implement for list endpoints (default: 20 items)
- **Query Optimization**: Use EF Core Include() for eager loading, AsNoTracking() for read-only
- **Indexing**: Reference existing database indexes
- **Async/Await**: All I/O operations must be async

## EF Core Configuration Example

```csharp
public class NormativoConfiguration : IEntityTypeConfiguration<Normativo>
{
    public void Configure(EntityTypeBuilder<Normativo> builder)
    {
        // Map to existing table (verified via database inspection)
        builder.ToTable("TB<your-project-name>00001_NORMATIVO");

        // Map to existing columns (all verified via database inspection)
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasColumnName("ID_NORMTV");

        // API field "referencia" maps to existing column "REF_NORMTV"
        builder.Property(e => e.Referencia).HasColumnName("REF_NORMTV");

        // API field "tipoNormativoId" maps to existing column "ID_TIPO_NORMTV"
        builder.Property(e => e.TipoNormativoId).HasColumnName("ID_TIPO_NORMTV");

        // Soft delete using existing column "I_REG_ATIV"
        builder.Property(e => e.IsActive).HasColumnName("I_REG_ATIV");
        builder.HasQueryFilter(e => e.IsActive);
    }
}
```

## Connection String Format

Use double underscore (`__`) for nested configuration:
- `ConnectionStrings__DefaultConnection`

Example:
```bash
ConnectionStrings__DefaultConnection="Host=localhost;Database=<your-project-name>;Username=<your-project-name>_user;Password=<your-project-name>_pass123"
```

## Project References

- **.NET Implementation**: See `.claude/specialities/dotnet.md` for EF Core usage patterns
- **Backend Source**: `/backend/src/`
- **Docker Compose**: `/backend/docker-compose.yml` (use with `podman-compose`)
