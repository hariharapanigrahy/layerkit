package com.acme.integrations;

import com.acme.integrations.vendor.VendorAdapter;
import com.acme.integrations.vendor.VendorRegistry;
import org.springframework.stereotype.Component;

/**
 * Facade entry — integrate mode must not create a parallel client.
 */
@Component
public class DataLayerClient {
  private final VendorRegistry registry;

  public DataLayerClient(VendorRegistry registry) {
    this.registry = registry;
  }

  public void track(String intent, String vendor, String jsonBody) throws Exception {
    VendorAdapter adapter =
        registry
            .get(vendor)
            .orElseThrow(() -> new IllegalArgumentException("unknown vendor: " + vendor));
    adapter.send(intent, jsonBody);
  }
}
