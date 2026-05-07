# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
# Cache the Maven local repo across rebuilds — only re-downloads when pom.xml changes
RUN --mount=type=cache,target=/root/.m2 mvn dependency:go-offline -q
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn package -DskipTests -q

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd -r -s /bin/false appuser
COPY --from=build /app/target/taskflow-api-0.0.1-SNAPSHOT.jar app.jar
USER appuser
EXPOSE 4000
# TieredStopAtLevel=1 skips JIT warm-up — cuts startup by ~50%
# JMX disabled — not needed in a container
ENTRYPOINT ["java", "-XX:TieredStopAtLevel=1", "-Dspring.jmx.enabled=false", "-jar", "app.jar"]
