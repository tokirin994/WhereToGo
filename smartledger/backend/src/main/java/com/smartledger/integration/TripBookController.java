package com.smartledger.integration;

import javax.validation.Valid;
import javax.validation.constraints.AssertTrue;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations/wheretogo/trips")
public class TripBookController {
    private final JdbcTemplate jdbc;
    private final URI publicUrl;

    public TripBookController(JdbcTemplate jdbc, @Value("${smartledger.public-url}") URI publicUrl,com.smartledger.security.ApiPolicy policy) {
        this.jdbc = jdbc;
        this.publicUrl = publicUrl;
        boolean loopback="localhost".equals(publicUrl.getHost())||"127.0.0.1".equals(publicUrl.getHost())||"[::1]".equals(publicUrl.getHost());
        if(publicUrl.getHost()==null||publicUrl.getUserInfo()!=null||publicUrl.getFragment()!=null||publicUrl.getQuery()!=null||(!"https".equals(publicUrl.getScheme())&&!(policy.isLocalDevelopment()&&loopback&&"http".equals(publicUrl.getScheme()))))throw new IllegalStateException("SmartLedger public URL must use HTTPS outside local development");
    }

    @PostMapping("/{tripId}/open")
    @Transactional
    public OpenTripBookResponse open(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID tripId,
                                     @Valid @RequestBody OpenTripBookRequest request) {
        UUID userId = jdbc.queryForObject(
            "INSERT INTO sl_users(id, issuer, subject, display_name) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT (issuer, subject) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, sl_users.display_name) " +
            "RETURNING id",
            UUID.class, UUID.randomUUID(), jwt.getIssuer().toString(), jwt.getSubject(), request.getDisplayName());

        UUID bookId = jdbc.queryForObject(
            "INSERT INTO ledger_books(id, user_id, name, book_type, external_app, external_trip_id, " +
            "external_trip_name, external_destination, external_trip_starts_on, external_trip_ends_on, start_date, end_date) " +
            "VALUES (?, ?, ?, 'trip', 'wheretogo', ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT (user_id, external_app, external_trip_id) WHERE deleted_at IS NULL AND external_trip_id IS NOT NULL " +
            "DO UPDATE SET name = EXCLUDED.name, external_trip_name = EXCLUDED.external_trip_name, " +
            "external_destination = EXCLUDED.external_destination, " +
            "external_trip_starts_on = EXCLUDED.external_trip_starts_on, " +
            "external_trip_ends_on = EXCLUDED.external_trip_ends_on, updated_at = now() RETURNING id",
            UUID.class, UUID.randomUUID(), userId, request.getTripName().substring(0,request.getTripName().offsetByCodePoints(0,Math.min(153,request.getTripName().codePointCount(0,request.getTripName().length())))) + " · 旅行账本", tripId,
            request.getTripName(), request.getDestination(), request.getStartsOn(), request.getEndsOn(),
            request.getStartsOn(), request.getEndsOn());
        return new OpenTripBookResponse(bookId, publicUrl.resolve("/books/" + bookId).toString());
    }

    public static class OpenTripBookRequest {
        @NotBlank @Size(max = 180) private String tripName;
        @Size(max = 180) private String destination;
        private LocalDate startsOn;
        private LocalDate endsOn;
        @Size(max = 120) private String displayName;

        public OpenTripBookRequest() { }
        @AssertTrue(message = "startsOn must be on or before endsOn")
        public boolean isDateRangeValid() { return startsOn == null || endsOn == null || !startsOn.isAfter(endsOn); }
        public String getTripName() { return tripName; }
        public void setTripName(String tripName) { this.tripName = tripName; }
        public String getDestination() { return destination; }
        public void setDestination(String destination) { this.destination = destination; }
        public LocalDate getStartsOn() { return startsOn; }
        public void setStartsOn(LocalDate startsOn) { this.startsOn = startsOn; }
        public LocalDate getEndsOn() { return endsOn; }
        public void setEndsOn(LocalDate endsOn) { this.endsOn = endsOn; }
        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
    }

    public static class OpenTripBookResponse {
        private final UUID bookId;
        private final String url;
        public OpenTripBookResponse(UUID bookId, String url) { this.bookId = bookId; this.url = url; }
        public UUID getBookId() { return bookId; }
        public String getUrl() { return url; }
    }
}
