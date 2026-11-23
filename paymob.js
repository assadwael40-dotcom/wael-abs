const crypto = require("crypto");

async function createPaymobPayment(order) {
  const base = "https://accept.paymob.com/api";
  const authRes = await fetch(`${base}/auth/tokens`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.PAYMOB_API_KEY })
  });
  if (!authRes.ok) throw new Error("Paymob auth failed");
  const { token } = await authRes.json();
  const merchantOrderId = `WAEL-${order.id}`;
  const orderRes = await fetch(`${base}/ecommerce/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: token, delivery_needed: false, amount_cents: Number(order.amount) * 100,
      currency: process.env.PAYMOB_CURRENCY || "EGP", merchant_order_id: merchantOrderId,
      items: [{ name: `WAEL ADS order ${order.id}`, amount_cents: Number(order.amount) * 100, description: order.service, quantity: 1 }]
    })
  });
  if (!orderRes.ok) throw new Error("Paymob order failed");
  const payOrder = await orderRes.json();
  const keyRes = await fetch(`${base}/acceptance/payment_keys`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: token, amount_cents: Number(order.amount) * 100,
      expiration: 3600, order_id: payOrder.id, billing_data: {
        apartment: "NA", email: "customer@example.com", floor: "NA", first_name: order.name.slice(0, 40),
        street: "NA", building: "NA", phone_number: order.phone, shipping_method: "NA",
        postal_code: "00000", city: "Cairo", country: "EG", last_name: "Customer", state: "NA"
      }, currency: process.env.PAYMOB_CURRENCY || "EGP",
      integration_id: Number(process.env.PAYMOB_INTEGRATION_ID)
    })
  });
  if (!keyRes.ok) throw new Error("Paymob payment key failed");
  const { token: paymentToken } = await keyRes.json();
  return {
    orderId: payOrder.id,
    checkoutUrl: `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${encodeURIComponent(paymentToken)}`
  };
}

// Paymob HMAC-SHA512 uses this exact ordered set of transaction fields.
function verifyPaymobHmac(body, secret) {
  const obj = body.obj;
  if (!obj || !body.hmac) return false;
  const values = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured, obj.has_parent_transaction,
    obj.id, obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_refunded,
    obj.is_standalone_payment, obj.is_voided, obj.order?.id, obj.owner, obj.pending, obj.source_data?.pan,
    obj.source_data?.sub_type, obj.source_data?.type, obj.success
  ].map(v => String(v ?? "")).join("");
  const digest = crypto.createHmac("sha512", secret).update(values).digest("hex");
  const a = Buffer.from(digest, "hex"), b = Buffer.from(String(body.hmac), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { createPaymobPayment, verifyPaymobHmac };
