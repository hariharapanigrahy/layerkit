package com.acme.integrations.vendor;

import okhttp3.OkHttpClient;

/**
 * Existing Postmark adapter — integrate mode should add siblings, not a new facade.
 */
public class PostmarkAdapter implements VendorAdapter {
  private final OkHttpClient http;

  public PostmarkAdapter(OkHttpClient http) {
    this.http = http;
  }

  @Override
  public String vendorId() {
    return "postmark";
  }

  @Override
  public void send(String intent, String jsonBody) throws Exception {
    // fixture stub
  }

  public EmailPayload buildPayload(EmailEvent event) {
    EmailPayload payload = new EmailPayload();
    payload.setName(event.getName());
    payload.setEmail(event.getEmail());
    return payload;
  }

  static class EmailEvent {
    String getName() {
      return "Ada";
    }

    String getEmail() {
      return "ada@example.test";
    }
  }

  static class EmailPayload {
    void setName(String name) {}

    void setEmail(String email) {}

    void setEmailId(String email) {}
  }
}
