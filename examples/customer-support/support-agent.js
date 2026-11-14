/** The real code under test: replace this implementation with your own agent.
 * A live MCP Client can use the same callTool interface outside tests. */
export default async function supportAgent(client, { input }) {
  const response = await client.callTool({ name: 'orders.lookup', arguments: { orderId: input.orderId } });
  const order = response.structuredContent;
  if (input.sendUpdate) {
    await client.callTool({ name: 'email.send', arguments: {
      to: order.customerEmail,
      subject: 'Your order update',
      body: `Your order has ${order.status}.`,
    } });
  }
  return { orderId: input.orderId, status: order.status, notified: input.sendUpdate };
}
