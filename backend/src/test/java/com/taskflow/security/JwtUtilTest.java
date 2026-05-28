package com.taskflow.security;

import com.taskflow.entity.User;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        // Inject a 32-char+ secret via ReflectionTestUtils (mirrors @Value injection)
        ReflectionTestUtils.setField(jwtUtil, "secret", "test-secret-key-that-is-long-enough");
        ReflectionTestUtils.setField(jwtUtil, "expirationHours", 24L);
        jwtUtil.init(); // trigger @PostConstruct
    }

    private User buildUser(String email, String name) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setName(name);
        user.setEmail(email);
        user.setPassword("hashed");
        return user;
    }

    // ── generateToken ─────────────────────────────────────────────────────────

    @Test
    void generateToken_nonNull() {
        User user = buildUser("alice@example.com", "Alice");
        String token = jwtUtil.generateToken(user);
        assertThat(token).isNotNull().isNotBlank();
    }

    @Test
    void generateToken_threePartJwt() {
        User user = buildUser("alice@example.com", "Alice");
        String token = jwtUtil.generateToken(user);
        assertThat(token.split("\\.")).hasSize(3);
    }

    // ── parseClaims / extractUserId / extractEmail ────────────────────────────

    @Test
    void extractUserId_matchesUser() {
        User user = buildUser("alice@example.com", "Alice");
        String token = jwtUtil.generateToken(user);
        assertThat(jwtUtil.extractUserId(token)).isEqualTo(user.getId());
    }

    @Test
    void extractEmail_matchesUser() {
        User user = buildUser("alice@example.com", "Alice");
        String token = jwtUtil.generateToken(user);
        assertThat(jwtUtil.extractEmail(token)).isEqualTo("alice@example.com");
    }

    @Test
    void parseClaims_containsNameClaim() {
        User user = buildUser("alice@example.com", "Alice");
        String token = jwtUtil.generateToken(user);
        Claims claims = jwtUtil.parseClaims(token);
        assertThat(claims.get("name", String.class)).isEqualTo("Alice");
    }

    // ── generateSseToken ──────────────────────────────────────────────────────

    @Test
    void generateSseToken_hasSseScope() {
        User user = buildUser("bob@example.com", "Bob");
        String token = jwtUtil.generateSseToken(user);
        Claims claims = jwtUtil.parseClaims(token);
        assertThat(claims.get("scope", String.class)).isEqualTo("sse");
    }

    @Test
    void generateSseToken_isShortLived() {
        User user = buildUser("bob@example.com", "Bob");
        String token = jwtUtil.generateSseToken(user);
        Claims claims = jwtUtil.parseClaims(token);
        long diffMs = claims.getExpiration().getTime() - claims.getIssuedAt().getTime();
        // Should be 2 minutes = 120_000 ms (allow ±500 ms for test execution time)
        assertThat(diffMs).isBetween(119_000L, 121_000L);
    }

    @Test
    void generateSseToken_emailMatchesUser() {
        User user = buildUser("bob@example.com", "Bob");
        String token = jwtUtil.generateSseToken(user);
        assertThat(jwtUtil.extractEmail(token)).isEqualTo("bob@example.com");
    }

    // ── invalid token ─────────────────────────────────────────────────────────

    @Test
    void parseClaims_invalidToken_throwsException() {
        assertThatThrownBy(() -> jwtUtil.parseClaims("not.a.valid.token"))
                .isInstanceOf(Exception.class);
    }

    @Test
    void parseClaims_tamperedToken_throwsException() {
        User user = buildUser("alice@example.com", "Alice");
        String token = jwtUtil.generateToken(user) + "tampered";
        assertThatThrownBy(() -> jwtUtil.parseClaims(token))
                .isInstanceOf(Exception.class);
    }

    // ── short secret auto-padding ─────────────────────────────────────────────

    @Test
    void shortSecret_paddedToMinimum_tokenStillValid() {
        JwtUtil util = new JwtUtil();
        ReflectionTestUtils.setField(util, "secret", "short"); // < 32 bytes
        ReflectionTestUtils.setField(util, "expirationHours", 1L);
        util.init();

        User user = buildUser("x@y.com", "X");
        String token = util.generateToken(user);
        assertThat(util.extractEmail(token)).isEqualTo("x@y.com");
    }
}
