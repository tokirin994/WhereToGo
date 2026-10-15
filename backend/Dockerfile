FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/travelatlas-api-0.1.0-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
