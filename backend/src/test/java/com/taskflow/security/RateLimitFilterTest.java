package com.taskflow.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RateLimitFilterTest {

    private RateLimitFilter filter;

    @BeforeEach
    void setUp() {
        filter = new RateLimitFilter();
    }

    // ── Normal requests pass through ──────────────────────────────────────────

    @Test
    void doFilter_normalRequest_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/projects");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(200); // unchanged by filter
    }

    @Test
    void doFilter_loginRequest_passesThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/auth/login");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    // ── Rate limit enforcement ────────────────────────────────────────────────

    @Test
    void doFilter_authEndpointExceedsLimit_returns429() throws Exception {
        // Auth limit is 10 per minute — exhaust it
        for (int i = 0; i < 10; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/auth/login");
            req.setRemoteAddr("192.168.1.100");
            filter.doFilterInternal(req, new MockHttpServletResponse(), mock(FilterChain.class));
        }

        // 11th request must be rate-limited
        MockHttpServletRequest limitedReq = new MockHttpServletRequest("POST", "/auth/login");
        limitedReq.setRemoteAddr("192.168.1.100");
        MockHttpServletResponse limitedRes = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilterInternal(limitedReq, limitedRes, chain);

        assertThat(limitedRes.getStatus()).isEqualTo(429);
        assertThat(limitedRes.getContentAsString()).contains("too many requests");
        verifyNoInteractions(chain);
    }

    @Test
    void doFilter_differentIps_independentBuckets() throws Exception {
        // Exhaust limit for IP A
        for (int i = 0; i < 10; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/auth/login");
            req.setRemoteAddr("10.0.0.1");
            filter.doFilterInternal(req, new MockHttpServletResponse(), mock(FilterChain.class));
        }

        // IP B should still have its own full bucket
        MockHttpServletRequest reqB = new MockHttpServletRequest("POST", "/auth/login");
        reqB.setRemoteAddr("10.0.0.2");
        MockHttpServletResponse resB = new MockHttpServletResponse();
        FilterChain chainB = mock(FilterChain.class);

        filter.doFilterInternal(reqB, resB, chainB);

        verify(chainB).doFilter(reqB, resB);
        assertThat(resB.getStatus()).isEqualTo(200);
    }

    // ── X-Forwarded-For header (CloudFront IP extraction) ─────────────────────

    @Test
    void doFilter_xForwardedFor_usesFirstIp() throws Exception {
        // Exhaust limit using the forwarded IP
        for (int i = 0; i < 10; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/auth/login");
            req.addHeader("X-Forwarded-For", "203.0.113.5, 10.0.0.1");
            filter.doFilterInternal(req, new MockHttpServletResponse(), mock(FilterChain.class));
        }

        // 11th request with same X-Forwarded-For IP is rate-limited
        MockHttpServletRequest limited = new MockHttpServletRequest("POST", "/auth/login");
        limited.addHeader("X-Forwarded-For", "203.0.113.5, 10.0.0.1");
        MockHttpServletResponse limitedRes = new MockHttpServletResponse();

        filter.doFilterInternal(limited, limitedRes, mock(FilterChain.class));

        assertThat(limitedRes.getStatus()).isEqualTo(429);
    }

    // ── 429 response body ────────────────────────────────────────────────────

    @Test
    void doFilter_rateLimited_responseBodyIsJson() throws Exception {
        for (int i = 0; i < 10; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/auth/register");
            req.setRemoteAddr("1.2.3.4");
            filter.doFilterInternal(req, new MockHttpServletResponse(), mock(FilterChain.class));
        }

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/auth/register");
        req.setRemoteAddr("1.2.3.4");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilterInternal(req, res, mock(FilterChain.class));

        assertThat(res.getStatus()).isEqualTo(429);
        assertThat(res.getContentType()).contains("application/json");
        assertThat(res.getContentAsString()).isEqualTo("{\"error\":\"too many requests\"}");
    }
}
