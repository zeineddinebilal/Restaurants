/**
 * Clean payment module boundary per SPEC.md Section 5.
 *
 * Version 1 uses pay-at-restaurant settlement (diners pay the restaurant directly;
 * platform fees are recorded in PlatformFee when orders are accepted and billed monthly).
 * Future online card payment providers (e.g., Stripe, Checkout.com UAE) implement `PaymentProvider`.
 */

export type PaymentMethodMode = "PAY_AT_RESTAURANT" | "ONLINE_CARD";
export type TableSettlementMode = "SPLIT_BY_PERSON" | "ONE_PERSON_PAYS_ALL";

export interface PaymentIntentResult {
  mode: PaymentMethodMode;
  requiresRedirect: boolean;
  checkoutUrl?: string;
  instructionsEn: string;
  instructionsAr: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly mode: PaymentMethodMode;
  prepareOrderSettlement(params: {
    orderId: string;
    amountAed: string;
    currency: string;
  }): Promise<PaymentIntentResult>;
}

export class PayAtRestaurantProvider implements PaymentProvider {
  readonly name = "pay-at-restaurant";
  readonly mode: PaymentMethodMode = "PAY_AT_RESTAURANT";

  async prepareOrderSettlement(): Promise<PaymentIntentResult> {
    return {
      mode: "PAY_AT_RESTAURANT",
      requiresRedirect: false,
      instructionsEn: "Pay your server at the table as usual when you finish dining.",
      instructionsAr: "ادفع للنادل على الطاولة كالمعتاد عند الانتهاء من وجبتك.",
    };
  }
}

export const paymentProvider: PaymentProvider = new PayAtRestaurantProvider();
