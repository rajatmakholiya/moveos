declare module 'react-native-razorpay' {
  interface RazorpayOptions {
    description?: string;
    currency?: string;
    key: string;
    /** Amount in paise as a string, e.g. "35000" */
    amount: string;
    order_id: string;
    name?: string;
    prefill?: {
      contact?: string;
      name?: string;
      email?: string;
    };
    theme?: { color?: string };
  }

  interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  interface RazorpayErrorResponse {
    code: number;
    description: string;
  }

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccessResponse>;
  };

  export default RazorpayCheckout;
}
