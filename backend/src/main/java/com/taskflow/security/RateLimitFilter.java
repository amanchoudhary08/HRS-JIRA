package com.taskflow.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    // 200 requests per minute per IP (global)
    private static final int REQUESTS_PER_MINUTE = 200;
    // 10 login/register attempts per minute per IP
    private static final int AUTH_REQUESTS_PER_MINUTE = 10;

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> authBuckets = new ConcurrentHashMap<>();

    private Bucket bucketForIp(String ip) {
        return buckets.computeIfAbsent(ip, k -> Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(REQUESTS_PER_MINUTE)
                        .refillGreedy(REQUESTS_PER_MINUTE, Duration.ofMinutes(1))
                        .build())
                .build());
    }

    private Bucket authBucketForIp(String ip) {
        return authBuckets.computeIfAbsent(ip, k -> Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(AUTH_REQUESTS_PER_MINUTE)
                        .refillGreedy(AUTH_REQUESTS_PER_MINUTE, Duration.ofMinutes(1))
                        .build())
                .build());
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String ip = resolveClientIp(request);
        String path = request.getRequestURI();

        // Tighter limit on auth endpoints to prevent brute force
        boolean isAuthPath = path.equals("/auth/login") || path.equals("/auth/register");
        Bucket bucket = isAuthPath ? authBucketForIp(ip) : bucketForIp(ip);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"too many requests\"}");
        }
    }

    // CloudFront forwards the real client IP in X-Forwarded-For
    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
