package com.taskflow.security;

import com.taskflow.entity.User;
import com.taskflow.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    public OAuth2SuccessHandler(UserRepository userRepository, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");
        String googleId = oAuth2User.getAttribute("sub");

        // Find user by Google ID first, then fall back to email
        User user = userRepository.findByGoogleId(googleId).orElseGet(() ->
            userRepository.findByEmail(email).map(existing -> {
                // Link existing account to Google
                if (existing.getGoogleId() == null) {
                    existing.setGoogleId(googleId);
                    userRepository.save(existing);
                }
                return existing;
            }).orElseGet(() -> {
                // Create brand-new account via Google
                User newUser = new User();
                newUser.setEmail(email);
                newUser.setName(name != null ? name : email.split("@")[0]);
                newUser.setGoogleId(googleId);
                // Unusable random password — Google users authenticate via OAuth only
                newUser.setPassword(UUID.randomUUID().toString());
                return userRepository.save(newUser);
            })
        );

        String token = jwtUtil.generateToken(user);
        String redirectUrl = frontendUrl + "/oauth2/callback?token="
                + URLEncoder.encode(token, StandardCharsets.UTF_8);
        response.sendRedirect(redirectUrl);
    }
}
