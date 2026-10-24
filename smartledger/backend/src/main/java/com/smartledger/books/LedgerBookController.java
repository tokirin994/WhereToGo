package com.smartledger.books;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/books")
public class LedgerBookController {
    private final JdbcTemplate jdbc;
    public LedgerBookController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<BookListItem> listBooks(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.query("SELECT b.id, b.name, b.book_type, b.external_destination, b.updated_at, " +
            "COALESCE(s.expenses, 0) AS expenses, COALESCE(s.income, 0) AS income, " +
            "COALESCE(s.transaction_count, 0) AS transaction_count " +
            "FROM ledger_books b JOIN sl_users u ON u.id = b.user_id " +
            "LEFT JOIN (SELECT tb.book_id, " +
            "SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END) AS expenses, " +
            "SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE 0 END) AS income, COUNT(t.id) AS transaction_count " +
            "FROM ledger_transaction_books tb JOIN ledger_transactions t ON t.id = tb.transaction_id " +
            "WHERE tb.include_in_statistics = true AND t.deleted_at IS NULL GROUP BY tb.book_id) s ON s.book_id = b.id " +
            "WHERE u.issuer = ? AND u.subject = ? AND b.deleted_at IS NULL " +
            "ORDER BY b.is_pinned DESC, b.updated_at DESC",
            (rs, rowNum) -> new BookListItem(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("book_type"), rs.getString("external_destination"),
                rs.getBigDecimal("expenses"), rs.getBigDecimal("income"), rs.getLong("transaction_count")),
            jwt.getIssuer().toString(), jwt.getSubject());
    }

    @PostMapping
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    public BookCreatedResponse createBook(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateBookRequest request) {
        UUID userId = jdbc.queryForObject(
            "INSERT INTO sl_users(id, issuer, subject, display_name) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT (issuer, subject) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, sl_users.display_name) " +
            "RETURNING id", UUID.class, UUID.randomUUID(), jwt.getIssuer().toString(), jwt.getSubject(), request.getDisplayName());
        UUID bookId = UUID.randomUUID();
        jdbc.update("INSERT INTO ledger_books(id, user_id, name, book_type, is_pinned) VALUES (?, ?, ?, 'general', true)",
            bookId, userId, request.getName().trim());
        return new BookCreatedResponse(bookId);
    }

    @GetMapping("/{bookId}")
    public TripBookView getBook(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookId) {
        return jdbc.query("SELECT b.id, b.name, b.external_trip_name, b.external_destination, " +
            "b.external_trip_starts_on, b.external_trip_ends_on FROM ledger_books b " +
            "JOIN sl_users u ON u.id = b.user_id WHERE b.id = ? AND u.issuer = ? AND u.subject = ? AND b.deleted_at IS NULL",
            rs -> {
                if (!rs.next()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
                return new TripBookView(rs.getObject("id", UUID.class), rs.getString("name"),
                    rs.getString("external_trip_name"), rs.getString("external_destination"),
                    rs.getObject("external_trip_starts_on", LocalDate.class), rs.getObject("external_trip_ends_on", LocalDate.class));
            }, bookId, jwt.getIssuer().toString(), jwt.getSubject());
    }

    @GetMapping("/{bookId}/summary")
    public BookSummary getSummary(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookId) {
        getBook(jwt, bookId);
        return jdbc.queryForObject("SELECT COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END), 0) AS expenses, " +
            "COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE 0 END), 0) AS income, COUNT(t.id) AS transaction_count " +
            "FROM ledger_transaction_books tb JOIN ledger_transactions t ON t.id = tb.transaction_id " +
            "WHERE tb.book_id = ? AND tb.include_in_statistics = true AND t.deleted_at IS NULL",
            (rs, rowNum) -> new BookSummary(rs.getBigDecimal("expenses"), rs.getBigDecimal("income"), rs.getLong("transaction_count")), bookId);
    }

    public static class TripBookView {
        private final UUID id; private final String name; private final String tripName;
        private final String destination; private final LocalDate startsOn; private final LocalDate endsOn;
        public TripBookView(UUID id, String name, String tripName, String destination, LocalDate startsOn, LocalDate endsOn) {
            this.id=id; this.name=name; this.tripName=tripName; this.destination=destination; this.startsOn=startsOn; this.endsOn=endsOn;
        }
        public UUID getId() { return id; } public String getName() { return name; }
        public String getTripName() { return tripName; } public String getDestination() { return destination; }
        public LocalDate getStartsOn() { return startsOn; } public LocalDate getEndsOn() { return endsOn; }
    }
    public static class BookSummary {
        private final BigDecimal expenses; private final BigDecimal income; private final long transactionCount;
        public BookSummary(BigDecimal expenses, BigDecimal income, long transactionCount) {
            this.expenses=expenses; this.income=income; this.transactionCount=transactionCount;
        }
        public BigDecimal getExpenses() { return expenses; } public BigDecimal getIncome() { return income; }
        public long getTransactionCount() { return transactionCount; }
    }

    public static class CreateBookRequest {
        @NotBlank @Size(max = 160) private String name;
        @Size(max = 120) private String displayName;
        public CreateBookRequest() { }
        public String getName() { return name; } public void setName(String value) { name=value; }
        public String getDisplayName() { return displayName; } public void setDisplayName(String value) { displayName=value; }
    }

    public static class BookCreatedResponse {
        private final UUID id;
        public BookCreatedResponse(UUID id) { this.id=id; }
        public UUID getId() { return id; }
    }

    public static class BookListItem {
        private final UUID id; private final String name; private final String type; private final String destination;
        private final BigDecimal expenses; private final BigDecimal income; private final long transactionCount;
        public BookListItem(UUID id, String name, String type, String destination, BigDecimal expenses, BigDecimal income, long transactionCount) {
            this.id=id; this.name=name; this.type=type; this.destination=destination;
            this.expenses=expenses; this.income=income; this.transactionCount=transactionCount;
        }
        public UUID getId() { return id; } public String getName() { return name; }
        public String getType() { return type; } public String getDestination() { return destination; }
        public BigDecimal getExpenses() { return expenses; } public BigDecimal getIncome() { return income; }
        public long getTransactionCount() { return transactionCount; }
    }
}
