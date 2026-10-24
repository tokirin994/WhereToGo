package com.smartledger.transactions;

import javax.validation.Valid;
import javax.validation.constraints.DecimalMin;
import javax.validation.constraints.Digits;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/books/{bookId}/transactions")
public class TransactionController {
    private final JdbcTemplate jdbc;
    public TransactionController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<TransactionView> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookId) {
        UUID userId = requireBookOwner(jwt, bookId);
        return jdbc.query("SELECT t.id, t.title, t.amount, t.kind, t.happened_at, t.note, t.merchant, " +
            "t.payment_method, t.currency, t.category_name_snapshot FROM ledger_transactions t " +
            "JOIN ledger_transaction_books tb ON tb.transaction_id = t.id " +
            "WHERE t.user_id = ? AND tb.book_id = ? AND t.deleted_at IS NULL ORDER BY t.happened_at DESC LIMIT 200",
            (rs, rowNum) -> new TransactionView(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getBigDecimal("amount"), rs.getString("kind"), rs.getObject("happened_at", OffsetDateTime.class),
                rs.getString("note"), rs.getString("merchant"), rs.getString("payment_method"),
                rs.getString("currency"), rs.getString("category_name_snapshot")), userId, bookId);
    }

    @PostMapping
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    public TransactionView create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookId,
                                  @Valid @RequestBody TransactionRequest request) {
        UUID userId = requireBookOwner(jwt, bookId);
        String currency = request.getCurrency() == null ? "CNY" : request.getCurrency();
        if (request.getCategoryId() != null) {
            Integer count = jdbc.queryForObject("SELECT count(*) FROM ledger_categories " +
                "WHERE id = ? AND user_id = ? AND flow_type = ? AND deleted_at IS NULL",
                Integer.class, request.getCategoryId(), userId, request.getKind());
            if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid category");
        }

        UUID transactionId = UUID.randomUUID();
        jdbc.update("INSERT INTO ledger_transactions(id, user_id, title, amount, kind, happened_at, note, " +
            "merchant, payment_method, currency, category_id, category_name_snapshot, source) " +
            "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, c.id, c.name, 'manual' FROM (SELECT 1) seed " +
            "LEFT JOIN ledger_categories c ON c.id = ? AND c.user_id = ?",
            transactionId, userId, request.getTitle(), request.getAmount(), request.getKind(), request.getHappenedAt(),
            request.getNote(), request.getMerchant(), request.getPaymentMethod(), currency, request.getCategoryId(), userId);
        jdbc.update("INSERT INTO ledger_transaction_books(user_id, transaction_id, book_id, source) VALUES (?, ?, ?, 'manual')",
            userId, transactionId, bookId);
        return new TransactionView(transactionId, request.getTitle(), request.getAmount(), request.getKind(),
            request.getHappenedAt(), request.getNote(), request.getMerchant(), request.getPaymentMethod(),
            currency, categoryName(request.getCategoryId(), userId));
    }

    private UUID requireBookOwner(Jwt jwt, UUID bookId) {
        List<UUID> ids = jdbc.query("SELECT u.id FROM sl_users u JOIN ledger_books b ON b.user_id = u.id " +
            "WHERE u.issuer = ? AND u.subject = ? AND b.id = ? AND b.deleted_at IS NULL",
            (rs, rowNum) -> rs.getObject(1, UUID.class), jwt.getIssuer().toString(), jwt.getSubject(), bookId);
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ids.get(0);
    }

    private String categoryName(UUID categoryId, UUID userId) {
        if (categoryId == null) return null;
        return jdbc.queryForObject("SELECT name FROM ledger_categories WHERE id = ? AND user_id = ?", String.class, categoryId, userId);
    }

    public static class TransactionRequest {
        @NotBlank @Size(max = 240) private String title;
        @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) private BigDecimal amount;
        @NotBlank @Pattern(regexp = "expense|income") private String kind;
        @NotNull private OffsetDateTime happenedAt;
        @Size(max = 4000) private String note;
        @Size(max = 200) private String merchant;
        @Size(max = 100) private String paymentMethod;
        @Pattern(regexp = "[A-Z]{3}") private String currency;
        private UUID categoryId;
        public TransactionRequest() { }
        public String getTitle() { return title; } public void setTitle(String v) { title=v; }
        public BigDecimal getAmount() { return amount; } public void setAmount(BigDecimal v) { amount=v; }
        public String getKind() { return kind; } public void setKind(String v) { kind=v; }
        public OffsetDateTime getHappenedAt() { return happenedAt; } public void setHappenedAt(OffsetDateTime v) { happenedAt=v; }
        public String getNote() { return note; } public void setNote(String v) { note=v; }
        public String getMerchant() { return merchant; } public void setMerchant(String v) { merchant=v; }
        public String getPaymentMethod() { return paymentMethod; } public void setPaymentMethod(String v) { paymentMethod=v; }
        public String getCurrency() { return currency; } public void setCurrency(String v) { currency=v; }
        public UUID getCategoryId() { return categoryId; } public void setCategoryId(UUID v) { categoryId=v; }
    }

    public static class TransactionView {
        private final UUID id; private final String title; private final BigDecimal amount; private final String kind;
        private final OffsetDateTime happenedAt; private final String note; private final String merchant;
        private final String paymentMethod; private final String currency; private final String categoryName;
        public TransactionView(UUID id, String title, BigDecimal amount, String kind, OffsetDateTime happenedAt,
                               String note, String merchant, String paymentMethod, String currency, String categoryName) {
            this.id=id; this.title=title; this.amount=amount; this.kind=kind; this.happenedAt=happenedAt;
            this.note=note; this.merchant=merchant; this.paymentMethod=paymentMethod; this.currency=currency; this.categoryName=categoryName;
        }
        public UUID getId() { return id; } public String getTitle() { return title; }
        public BigDecimal getAmount() { return amount; } public String getKind() { return kind; }
        public OffsetDateTime getHappenedAt() { return happenedAt; } public String getNote() { return note; }
        public String getMerchant() { return merchant; } public String getPaymentMethod() { return paymentMethod; }
        public String getCurrency() { return currency; } public String getCategoryName() { return categoryName; }
    }
}
