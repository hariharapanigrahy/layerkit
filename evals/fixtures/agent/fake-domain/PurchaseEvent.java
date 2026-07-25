package com.acme.domain;

/**
 * Fixture Java Event class for domain discovery evals (not production).
 */
public class PurchaseEvent {
  private final String orderId;
  private final String email;

  public PurchaseEvent(String orderId, String email) {
    this.orderId = orderId;
    this.email = email;
  }

  public String getOrderId() {
    return orderId;
  }

  public String getEmail() {
    return email;
  }
}
