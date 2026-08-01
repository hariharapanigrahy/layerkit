package com.acme.integrations.vendor;

/**
 * Strategy interface for vendor send (fixture).
 */
public interface VendorAdapter {
  String vendorId();

  void send(String intent, String jsonBody) throws Exception;
}
