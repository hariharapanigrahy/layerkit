package com.acme.integrations.vendor;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Registry of vendor adapters (fixture for integrate-mode topology scan).
 */
public class VendorRegistry {
  private final Map<String, VendorAdapter> byId = new LinkedHashMap<>();

  public void register(VendorAdapter adapter) {
    byId.put(adapter.vendorId(), adapter);
  }

  public Optional<VendorAdapter> get(String vendorId) {
    return Optional.ofNullable(byId.get(vendorId));
  }
}
