FROM maven:3.9-eclipse-temurin-25-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
RUN adduser -D -H appuser
COPY --from=build /app/target/taskflow-api-0.0.1-SNAPSHOT.jar app.jar
USER appuser
EXPOSE 4000
ENTRYPOINT ["java", "-jar", "app.jar"]
