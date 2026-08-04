---
name: java-spring-microservices
description: Java 11 + Spring Boot 2.7.9 microservices development for HF ecosystem. Use when building backend microservices with MongoDB, Solace messaging, OAuth2 authentication, event-driven architecture, and RESTful APIs. Includes lib-backend integration, OpenAPI/AsyncAPI specs, and Kubernetes deployment patterns.
---

# Java Spring Boot Microservices - HF Ecosystem

This file contains all Java Spring Boot microservices-specific configurations, patterns, and conventions for the **HF ticketing ecosystem** backend services.

## Technology Stack

- **Java**: 11
- **Spring Boot**: 2.7.9
- **Build Tool**: Maven (multi-module: lib + ms)
- **Database**: MongoDB 4.4.20
- **Message Broker**: Solace PubSub+ (JMS)
- **Authentication**: OAuth2 JWT via Keycloak
- **Documentation**: OpenAPI 3.0, AsyncAPI 2.6.0, Swagger UI
- **Containerization**: Docker + Kubernetes

## Core Libraries (HF Ecosystem)

- **lib-backend** (v2.x) - Base library with event-driven architecture, auth, logging, exception handling
- **lib-parent** (v2.0.3) - Parent POM with centralized dependency management
- **lib-mongodb-encrypt** (v1.0.2) - MongoDB field-level encryption
- **lib-identity-manager** - User/auth event models
- **lib-shift-manager** - Shift event models
- **lib-configuration-manager** - System configuration
- **common-configs** - Git submodule with shared configs, pipelines, schemas

## When to Use This Skill

Use this skill when:
- ✅ Creating a new microservice in the HF ecosystem
- ✅ Implementing REST API endpoints with Spring Boot
- ✅ Integrating with Solace event broker (pub/sub)
- ✅ Setting up MongoDB persistence with encryption
- ✅ Implementing OAuth2 JWT authentication
- ✅ Publishing or consuming events in the system
- ✅ Deploying microservices to Kubernetes
- ✅ Writing OpenAPI/AsyncAPI specifications

## Project Structure (REQUIRED)

```
ms-{service-name}/
├── lib/                          # Shared library module
│   ├── src/main/java/.../
│   │   ├── model/               # Data models
│   │   ├── enums/               # Enumerations
│   │   ├── exceptions/          # Custom exceptions
│   │   ├── repository/          # Repository interfaces
│   │   └── service/             # Service interfaces
│   └── pom.xml
├── ms/                           # Microservice module
│   ├── src/main/java/.../
│   │   ├── Application.java     # Spring Boot main
│   │   ├── controller/          # REST controllers
│   │   ├── service/             # Service implementations
│   │   ├── event/               # Event handlers
│   │   │   ├── subscriber/      # Solace consumers
│   │   │   └── consumer/handle/ # Event handlers
│   │   ├── config/              # Spring configurations
│   │   ├── auth/                # RBAC authorization
│   │   └── monitoring/          # Health & Prometheus
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   ├── static/v1/docs/
│   │   │   ├── api.yaml         # OpenAPI spec
│   │   │   └── events.yaml      # AsyncAPI spec
│   │   └── integration/
│   │       ├── solace_queue.csv
│   │       └── solace_subscriptions.csv
│   └── pom.xml
├── common-configs/               # Git submodule
├── deployment-dev.yaml           # K8s manifest
└── pom.xml                       # Parent POM
```

## Best Practices (CRITICAL)

### Architecture
- **MUST** use multi-module Maven structure (lib + ms)
- **MUST** extend lib-backend Entity for MongoDB documents
- **MUST** wrap events in MetaEvent<T> wrapper
- **MUST** implement AbstractSubscriber for event consumers
- **MUST** use ProducerService from lib-backend for publishing events

### REST API
- **MUST** return Result<T> wrapper for all responses
- **MUST** use CustomException from lib-backend for errors
- **MUST** implement Swagger UI at `/[service-name]` path
- **MUST** use OpenAPI 3.0 spec in `api.yaml`
- **MUST** protect all endpoints with OAuth2 JWT

### Event-Driven
- **MUST** use MetaEventHeader with timestamp, module, action, userId
- **MUST** publish events for CREATE, UPDATE, DELETE operations
- **MUST** implement retry logic with max 3 attempts
- **MUST** persist failed messages to MongoDB for reprocessing
- **MUST** define AsyncAPI 2.6.0 spec in `events.yaml`

### Security
- **MUST** validate JWT tokens via Keycloak
- **MUST** implement RBAC with roles (ADMIN, MANAGER, OPERATION)
- **MUST** use encryption for sensitive MongoDB fields
- **MUST** sanitize all user inputs

### Observability
- **MUST** use CommonLog for structured logging
- **MUST** implement `/monitoring/health` endpoint
- **MUST** implement `/monitoring/prometheus` endpoint
- **MUST** log with correlationId for tracing

## Required Dependencies (pom.xml)

```xml
<parent>
    <groupId>com.linkconsulting</groupId>
    <artifactId>lib-parent</artifactId>
    <version>2.0.3</version>
</parent>

<dependencies>
    <dependency>
        <groupId>com.linkconsulting</groupId>
        <artifactId>lib-backend</artifactId>
        <version>2.2.2</version>
    </dependency>
    <dependency>
        <groupId>com.linkconsulting</groupId>
        <artifactId>lib-mongodb-encrypt</artifactId>
        <version>1.0.2</version>
    </dependency>
</dependencies>
```

## Required Configuration (application.properties)

```properties
# Server
server.port=8080

# MongoDB
spring.data.mongodb.uri=mongodb://user:pass@host:27017/DatabaseName
spring.data.mongodb.database=DatabaseName

# Solace
solace.java.host=solace-host:55555
solace.java.msgVpn=default
solace.java.queue=servicename_queue

# OAuth2
spring.security.oauth2.resourceserver.jwt.issuer-uri=http://keycloak:8080/realms/hf

# Logging
logging.level.com.linkconsulting=DEBUG
```

## Code Patterns

### 1. Entity Model (MongoDB)

```java
import com.linkconsulting.ms.backend.model.Entity;
import org.springframework.data.mongodb.core.mapping.Document;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Document(collection = "myEntities")
public class MyEntity extends Entity {
    private String businessField;
    private BigDecimal amount;
    // UUID id, createdDate, lastModifiedDate inherited from Entity
}
```

### 2. REST Controller

```java
import com.linkconsulting.ms.backend.model.Result;
import com.linkconsulting.ms.backend.exceptions.CustomException;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;

@RestController
@RequestMapping("/v1/api/myresource")
public class MyResourceController {

    @GetMapping("/{id}")
    public Result<MyEntityView> getById(
        @PathVariable String id,
        @AuthenticationPrincipal Jwt jwt
    ) throws CustomException {
        MyEntityView entity = myService.getById(id, jwt);
        return Result.success(entity);
    }
}
```

### 3. Service with Logging

```java
import com.linkconsulting.ms.backend.utils.audit.CommonLog;
import com.linkconsulting.ms.backend.utils.events.ProducerService;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MyService {
    private final MyEntityRepository repository;
    private final CommonLog commonLog;
    private final ProducerService producerService;
    private static final String MODULE = "ms-my-service";

    public MyEntityView create(MyEntityRequest request, Jwt jwt) {
        String trackingId = UUID.randomUUID().toString();
        commonLog.log(MODULE, "CREATE_ENTITY", trackingId, null, "Creating entity");

        MyEntity entity = repository.save(buildEntity(request));

        commonLog.log(MODULE, "CREATE_ENTITY", trackingId, entity.getId(), "Created");

        producerService.publishCreateEvent(MODULE, "myresource/created",
            toView(entity), jwt.getSubject());

        return toView(entity);
    }
}
```

### 4. Event Subscriber

```java
import com.linkconsulting.ms.backend.subscriber.AbstractSubscriber;
import org.springframework.jms.annotation.JmsListener;
import org.springframework.stereotype.Component;

@Component
public class MyEventSubscriber extends AbstractSubscriber {

    @JmsListener(destination = "myservice_queue")
    @Override
    public void onMessage(Message message) {
        super.onMessage(message);
    }

    @Override
    protected void handleMessage(Message message) throws Exception {
        // Process MetaEvent
        MetaEvent<MyEventPayload> event = deserialize(message);

        switch (event.getHeader().getAction()) {
            case "CREATE": handler.handleCreate(event.getPayload()); break;
            case "UPDATE": handler.handleUpdate(event.getPayload()); break;
            default: log.warn("Unknown action: {}", event.getHeader().getAction());
        }
    }

    @Override
    protected int getMaxRetries() {
        return 3;
    }
}
```

### 5. Security Configuration

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf().disable()
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers("/actuator/**", "/monitoring/**").permitAll()
                .requestMatchers("/v1/api/**").authenticated()
            )
            .oauth2ResourceServer().jwt();
        return http.build();
    }
}
```

## Solace Setup

### 1. Queue Configuration (solace_queue.csv)
```csv
queueName,queuePermission,queueMaxMsgSpoolUsage,queueAccessType,queueMaxRedelivery
myservice_queue,consume,5000,exclusive,3
```

### 2. Subscriptions (solace_subscriptions.csv)
```csv
queueName,topicSubscription
myservice_queue,myresource/created
myservice_queue,myresource/updated
myservice_queue,user/created
```

### 3. Provision via Newman
```bash
newman run common-configs/Setup/Solace/init.postman_collection.json \
  --folder 'Init' \
  --environment common-configs/Postman/Environments/dev.postman_environment.json \
  --iteration-data ms/src/main/resources/integration/solace_queue.csv

newman run common-configs/Setup/Solace/init.postman_collection.json \
  --folder 'Subscription' \
  --environment common-configs/Postman/Environments/dev.postman_environment.json \
  --iteration-data ms/src/main/resources/integration/solace_subscriptions.csv
```

## Build & Deploy

### Local Development
```bash
# Update submodules
git submodule update --init --recursive

# Build
mvn clean compile -Dproject=hf

# Run
mvn spring-boot:run -pl ms

# Access Swagger
open http://localhost:8080/[service-name]
```

### Docker
```bash
# Build image
docker build -t ms-my-service:latest -f common-configs/Development/Docker/ms/Dockerfile .

# Run
docker run -p 8080:8080 \
  -e MONGODB_URI="mongodb://mongo:27017/MyServiceDB" \
  -e SOLACE_HOST="solace:55555" \
  ms-my-service:latest
```

### Kubernetes
```bash
kubectl apply -f deployment-dev.yaml
kubectl get pods -l app=ms-my-service
kubectl logs -f deployment/ms-my-service
```

## Testing Requirements

- **MUST** write unit tests for services and controllers
- **MUST** achieve 80%+ coverage for core business logic
- **MUST** use JUnit 5 + Mockito
- **MUST** test event handlers with test containers

```bash
# Run tests
mvn test

# Coverage report
mvn jacoco:report
```

## Checklist for New Microservice

- [ ] Create multi-module structure (lib + ms)
- [ ] Add lib-parent as parent POM
- [ ] Add lib-backend dependency
- [ ] Configure application.properties
- [ ] Extend Entity for MongoDB models
- [ ] Implement REST controllers with Result<T>
- [ ] Implement services with CommonLog
- [ ] Configure OAuth2 security
- [ ] Implement event subscribers if needed
- [ ] Create Solace queues and subscriptions
- [ ] Write OpenAPI spec (api.yaml)
- [ ] Write AsyncAPI spec (events.yaml)
- [ ] Implement health checks
- [ ] Write unit tests (80%+ coverage)
- [ ] Create Dockerfile
- [ ] Create K8s deployment manifest
- [ ] Document in docs/projects/

## Common Pitfalls

### ❌ Don't
- Don't use `@SpringBootApplication` without `scanBasePackages` for lib-backend
- Don't publish events without MetaEvent wrapper
- Don't skip failed message handling
- Don't hardcode configuration values
- Don't skip JWT token validation

### ✅ Do
- Use CommonLog for all business operations
- Implement retry logic with AbstractSubscriber
- Use ProducerService for publishing events
- Follow semantic versioning
- Keep services stateless

## HF Ecosystem Context

- All microservices share common patterns via lib-backend
- Event-driven architecture enables loose coupling
- MongoDB provides flexible schema for business entities
- Solace ensures reliable message delivery
- Keycloak centralizes authentication
- K8s provides orchestration and scaling

For complete reference documentation, see: `docs/projects/[service-name].md`
