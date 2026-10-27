FROM eclipse-temurin:8-jre-jammy
WORKDIR /app
ARG ARTIFACT
COPY --chown=10001:10001 ${ARTIFACT} /app/app.jar
USER 10001:10001
ENTRYPOINT ["java","-XX:+ExitOnOutOfMemoryError","-jar","/app/app.jar"]
