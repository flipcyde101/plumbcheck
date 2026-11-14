import { ReplaySession, createRecorder } from '../../src/index.js';

// Replace this synthetic client with your trusted MCP SDK Client to record real
// interactions. Recording with a real client DOES execute its tools.
const syntheticClient = {
  async callTool({ name }) {
    if (name !== 'orders.lookup') throw new Error('Unknown synthetic tool');
    return { content: [{ type: 'text', text: 'Order has shipped.' }], structuredContent: { status: 'shipped' } };
  },
};
const recorder = createRecorder(syntheticClient);
await recorder.callTool({ name: 'orders.lookup', arguments: { orderId: 'ORD-1042' } });

// The same callTool interface works with an MCP SDK Client or ReplaySession.
async function supportAgent(client) {
  const result = await client.callTool({ name: 'orders.lookup', arguments: { orderId: 'ORD-1042' } });
  return result.structuredContent.status;
}

const replay = new ReplaySession({ fixtures: await recorder.snapshot(), policies: { allow: ['orders.lookup'] } });
console.log('Replayed agent output:', await supportAgent(replay));
replay.verifyComplete();
console.log('Replay completed. Live tool calls during replay: 0.');
