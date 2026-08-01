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
}
