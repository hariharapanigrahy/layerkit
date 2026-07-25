package com.acme.integrations.client;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Fixture-only Java client for style-profile scan evals (not production).
 */
@Component
public class ExampleClient {
  private static final Logger log = LoggerFactory.getLogger(ExampleClient.class);

  private final OkHttpClient http;

  public ExampleClient(OkHttpClient http) {
    this.http = http;
  }

  public String ping(String url) throws Exception {
    Request request = new Request.Builder().url(url).get().build();
    try (Response response = http.newCall(request).execute()) {
      log.debug("status={}", response.code());
      return response.body() != null ? response.body().string() : "";
    }
  }
}
