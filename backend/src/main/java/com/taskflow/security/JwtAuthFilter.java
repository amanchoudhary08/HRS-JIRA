package com.taskflow.security;

import com.taskflow.entity.User;
import com.taskflow.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    public JwtAuthFilter(JwtUtil jwtUtil, UserRepository userRepository) {
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        // For SSE endpoints the browser EventSource cannot set headers, so the JWT
        // is passed as a ?token= query parameter instead.
        String header = request.getHeader("Authorization");
        String token = null;
        if (header != null && header.startsWith("Bearer ")) {
            token = header.substring(7);
        } else {
            String queryToken = request.getParameter("token");
            if (queryToken != null && !queryToken.isEmpty()) {
                token = queryToken;
            }
        }

        if (token == null) {
            chain.doFilter(request, response);
            return;
        }
        try {
            UUID userId = jwtUtil.extractUserId(token);
            String email = jwtUtil.extractEmail(token);
            if (userId != null && email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                User user = userRepository.findById(userId).orElse(null);
                if (user != null && user.getEmail().equals(email)) {
                    var auth = new UsernamePasswordAuthenticationToken(user, null, List.of());
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            }
        } catch (Exception ignored) {
            // invalid token — leave context empty; security config will reject
        }
        chain.doFilter(request, response);
    }
}
