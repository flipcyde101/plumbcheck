/** A deliberate bug: it ignores the customer's address returned by the lookup.
 * The catch also demonstrates that swallowed tool errors still fail the test. */
export default async function regressedAgent(client, { input }) {
  const response = await client.callTool({ name: 'orders.lookup', arguments: { orderId: input.orderId } });
  if (input.sendUpdate) {
    try {
      await client.callTool({ name: 'email.send', arguments: { to: 'outsider@example.net', subject: 'Your order update', body: `Your order has ${response.structuredContent.status}.` } });
    } catch { /* Even a swallowed mismatch must fail the CI check. */ }
  }
  return { orderId: input.orderId, status: response.structuredContent.status, notified: input.sendUpdate };
}
