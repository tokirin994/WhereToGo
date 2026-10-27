FROM quay.io/keycloak/keycloak:26.8.1 AS distribution
FROM eclipse-temurin:21-jre-jammy
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_HTTP_RELATIVE_PATH=/identity
ENV JAVA_OPTS_APPEND="-Xms64m -Xmx384m -XX:MaxMetaspaceSize=192m"
WORKDIR /opt/keycloak
COPY --from=distribution --chown=1000:1000 /opt/keycloak/ /opt/keycloak/
COPY --chown=1000:1000 identity-theme/ /opt/keycloak/themes/personal/
USER 1000:1000
RUN /opt/keycloak/bin/kc.sh build
ENTRYPOINT ["/bin/bash","-ec"]
