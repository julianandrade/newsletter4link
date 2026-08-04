---
name: dotnet
description: .NET 8.0 backend development guidelines, Clean Architecture patterns, CQRS with MediatR, and Entity Framework Core. Use when working with .NET backend projects, implementing APIs, creating domain entities, setting up repositories, or configuring ASP.NET Core applications. Includes FluentValidation, AutoMapper, PostgreSQL integration, and Podman containerization.
---

# .NET Speciality - <your-project-name> Project

This file contains all .NET-specific configurations, patterns, and conventions for the **<your-project-name>** backend system.

## Technology Stack

- **.NET**: 8.0 (LTS)
- **ASP.NET Core**: 8.0 - Web framework for REST API
- **Entity Framework Core**: 8.0 - ORM for database operations
- **Npgsql.EntityFrameworkCore.PostgreSQL**: 8.0 - PostgreSQL provider for EF Core
- **Database**: See `.claude/specialities/postgreSQL.md` for database details

## Architecture & Patterns

- **Clean Architecture**: Layer separation (API → Application → Domain → Infrastructure)
- **DDD Principles**: Domain-driven design patterns
- **CQRS**: MediatR (v12.2.0) - Command/Query separation in Application layer
- **Repository Pattern**: Data access abstraction in Infrastructure layer

## Validation & Mapping

- **FluentValidation**: 11.3.0 - Request/command validation in Application layer
- **FluentValidation.AspNetCore**: 11.3.0 - ASP.NET Core integration
- **AutoMapper**: 12.0.1 - DTO to Entity mapping in Application layer
- **AutoMapper.Extensions.Microsoft.DependencyInjection**: 12.0.1 - DI integration

## API Documentation

- **Swashbuckle.AspNetCore**: 6.6.2 - Swagger/OpenAPI documentation generation
- **Microsoft.AspNetCore.OpenApi**: 8.0.21 - OpenAPI support

## Additional Libraries

- **FuzzySharp**: 2.0.2 - Fuzzy string matching (Levenshtein distance)
- **Microsoft.AspNetCore.Authentication.JwtBearer**: 8.0.0 - JWT authentication (if needed)

## Containerization

- **Podman**: Container runtime (use `podman-compose` instead of `docker-compose`)
- Container name conventions: lowercase, hyphenated (e.g., `<your-project-name>-api`, `<your-project-name>-postgres`)

## Testing

- **xUnit**: Unit testing framework
- **Moq**: Mocking framework
- **TestContainers**: Integration testing with containers

## <your-project-name> Naming Conventions (MANDATORY)

| Type         | Convention                             | Example                               |
| ------------ | -------------------------------------- | ------------------------------------- |
| Controllers  | {Entity}Controller                     | NormativosController                  |
| Commands     | {Action}{Entity}Command                | CreateNormativoCommand                |
| Queries      | Get{Entity}Query, Get{Entity}ListQuery | GetNormativoQuery, GetNormativosQuery |
| Handlers     | {Command/Query}Handler                 | CreateNormativoCommandHandler         |
| DTOs         | {Entity}Dto, {Action}{Entity}Dto       | NormativoDto, CreateNormativoDto      |
| Entities     | {Entity}                               | Normativo                             |
| Repositories | I{Entity}Repository                    | INormativoRepository                  |
| Validators   | {Action}{Entity}Validator              | CreateNormativoValidator              |

## Code Quality Standards

- All public classes must have XML documentation comments
- Use async/await for all I/O operations
- Implement proper error handling with try-catch blocks
- Use dependency injection for all dependencies
- Follow SOLID principles
- Use MediatR for CQRS pattern
- Use FluentValidation for input validation
- Map domain entities to DTOs using AutoMapper or manual mapping

## Error Handling Standard

All API responses should use consistent error format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Map exceptions to HTTP status codes:
- 400 Bad Request: Validation errors
- 401 Unauthorized: Authentication required
- 403 Forbidden: Authorization failed
- 404 Not Found: Resource not found
- 409 Conflict: Business rule violation
- 500 Internal Server Error: Unexpected errors

## Database Mapping

For database-specific details, see `.claude/specialities/postgreSQL.md`, including:
- Database connection details
- Existing database tables and schema
- Database access commands
- Database mapping guidelines
- EF Core configuration patterns

## <your-project-name> Clean Architecture Structure

```
backend/src/
├── <your-project-name>.API/              # Presentation Layer
│   ├── Controllers/        # REST API Controllers
│   ├── Middleware/         # Custom middleware
│   └── Extensions/         # Service extensions
├── <your-project-name>.Application/      # Application Layer (Use Cases)
│   ├── Features/           # Feature modules
│   │   ├── Commands/       # Write operations (CQRS)
│   │   ├── Queries/        # Read operations (CQRS)
│   │   ├── DTOs/           # Data Transfer Objects
│   │   └── Validators/     # FluentValidation validators
│   └── Common/             # Shared application concerns
├── <your-project-name>.Domain/           # Domain Layer
│   ├── Entities/           # Domain entities
│   ├── ValueObjects/       # Value objects
│   ├── Events/             # Domain events
│   └── Interfaces/         # Domain interfaces
└── <your-project-name>.Infrastructure/   # Infrastructure Layer
    ├── Persistence/        # Data access (EF Core, repositories)
    ├── Services/           # External services
    └── Configurations/     # EF Core configurations
```

## File Organization Pattern (Example for Normativos Feature)

```
<your-project-name>.Application/Features/Normativos/
├── Commands/
│   ├── CreateNormativo/
│   │   ├── CreateNormativoCommand.cs
│   │   ├── CreateNormativoCommandHandler.cs
│   │   └── CreateNormativoValidator.cs
│   ├── UpdateNormativo/
│   └── DeleteNormativo/
├── Queries/
│   ├── GetNormativo/
│   │   ├── GetNormativoQuery.cs
│   │   └── GetNormativoQueryHandler.cs
│   └── GetNormativos/
│       ├── GetNormativosQuery.cs
│       └── GetNormativosQueryHandler.cs
└── DTOs/
    ├── NormativoDto.cs
    ├── CreateNormativoDto.cs
    └── UpdateNormativoDto.cs
```

## Design Patterns Examples

### CQRS Pattern (for complex operations)

```csharp
// Command
public record CreateNormativoCommand : IRequest<NormativoDto>
{
    public string Referencia { get; init; }
    public int TipoNormativoId { get; init; }
}

// Handler
public class CreateNormativoCommandHandler : IRequestHandler<CreateNormativoCommand, NormativoDto>
{
    private readonly INormativoRepository _repository;

    public CreateNormativoCommandHandler(INormativoRepository repository)
    {
        _repository = repository;
    }

    public async Task<NormativoDto> Handle(CreateNormativoCommand request, CancellationToken cancellationToken)
    {
        // Implementation
    }
}

// Validator
public class CreateNormativoValidator : AbstractValidator<CreateNormativoCommand>
{
    public CreateNormativoValidator()
    {
        RuleFor(x => x.Referencia)
            .NotEmpty().WithMessage("Reference is required")
            .MaximumLength(150).WithMessage("Reference cannot exceed 150 characters");
    }
}
```

### Repository Pattern

```csharp
// Domain Interface
public interface INormativoRepository
{
    Task<Normativo> GetByIdAsync(int id);
    Task<IEnumerable<Normativo>> GetAllAsync();
    Task AddAsync(Normativo normativo);
    Task UpdateAsync(Normativo normativo);
    Task DeleteAsync(int id);
}

// Infrastructure Implementation
public class NormativoRepository : INormativoRepository
{
    private readonly ApplicationDbContext _context;

    public NormativoRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Normativo> GetByIdAsync(int id)
    {
        return await _context.Normativos.FindAsync(id);
    }
}
```

## Validation Strategy

```csharp
public class CreateNormativoValidator : AbstractValidator<CreateNormativoCommand>
{
    public CreateNormativoValidator()
    {
        RuleFor(x => x.ReferenciaNormativo)
            .NotEmpty().WithMessage("Reference is required")
            .MaximumLength(150).WithMessage("Reference cannot exceed 150 characters")
            .Matches("^[a-zA-Z0-9]+$").WithMessage("Reference must be alphanumeric");

        RuleFor(x => x.TipoNormativoId)
            .GreaterThan(0).WithMessage("Valid normativo type is required");

        RuleFor(x => x.DataPublicacao)
            .NotEmpty().WithMessage("Publication date is required");
    }
}
```

## API Design Principles

- Use RESTful conventions
- Implement pagination for list endpoints (default: page=1, pageSize=20)
- Support filtering via query parameters
- Support sorting via query parameter (sort=fieldName:asc|desc)
- Return appropriate HTTP status codes
- Use consistent response structure
- Include HATEOAS links when relevant
- Version APIs appropriately (e.g., /api/v1/normativos)

## Controller Example

```csharp
[ApiController]
[Route("api/v1/normativos")]
public class NormativosController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ILogger<NormativosController> _logger;

    public NormativosController(IMediator mediator, ILogger<NormativosController> logger)
    {
        _mediator = mediator;
        _logger = logger;
    }

    [HttpPost]
    [ProducesResponseType(typeof(NormativoDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateNormativo([FromBody] CreateNormativoDto dto)
    {
        var command = new CreateNormativoCommand { /* map from dto */ };
        var result = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetNormativo), new { id = result.Id }, result);
    }

    [HttpGet("{id}")]
    [ProducesResponseType(typeof(NormativoDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetNormativo(int id)
    {
        var query = new GetNormativoQuery { Id = id };
        var result = await _mediator.Send(query);
        return Ok(result);
    }
}
```

## Environment Variables Format

Use double underscore (`__`) for nested configuration:
- `ConnectionStrings__DefaultConnection`
- `Jwt__Secret`
- `Jwt__Issuer`

Example:
```bash
ConnectionStrings__DefaultConnection="Host=localhost;Database=<your-project-name>;Username=<your-project-name>_user;Password=<your-project-name>_pass123"
FuzzyMatching__Threshold="0.8"
```

## Podman Compose Guidelines

- Reference existing patterns from `/backend/docker-compose.yml`
- Use `podman-compose` to run services (NOT `docker-compose`)
- Use environment variables for configuration (never hardcode secrets)
- Follow naming conventions: lowercase, hyphenated (e.g., <your-project-name>-api, <your-project-name>-postgres)
- Include health checks:
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
    interval: 30s
    timeout: 3s
    retries: 3
    start_period: 5s
  ```

## Security Considerations

- **Authentication**: JWT bearer token requirements
- **Authorization**: Define required roles/permissions per endpoint
- **Input Validation**: Specify sanitization rules
- **Data Protection**: Note sensitive fields requiring encryption
- **CORS**: Document allowed origins
- **Rate Limiting**: Specify limits if needed

## Build and Run Commands

```bash
# Build solution
dotnet build

# Run application
dotnet run --project <your-project-name>.API

# Run tests
dotnet test

# Start services with Podman
cd backend
podman-compose up -d

# Check services status
podman-compose ps

# View logs
podman-compose logs -f

# Stop services
podman-compose down
```

## Project References

- **Database Details**: `.claude/specialities/postgreSQL.md`
- **Technical Context**: `/documentation/docs/<your-project-name> - Contexto técnico - en-us.md`
- **OpenAPI Specifications**: `/api/<your-project-name>-rest-api.yaml`
- **Backend Source**: `/backend/src/`
- **Docker Compose**: `/backend/docker-compose.yml` (use with `podman-compose`)
