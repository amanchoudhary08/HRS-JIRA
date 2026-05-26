package com.taskflow.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class S3Config {

    @Bean
    public S3Client s3Client(@Value("${app.s3.region}") String region) {
        // Uses DefaultCredentialsProvider: instance profile on EC2,
        // env vars (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) locally.
        return S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
