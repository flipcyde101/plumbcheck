/** The real code under test: replace this implementation with your own agent.
 * A live MCP Client can use the same callTool interface outside tests. */
export default async function bookingAgent(client, { input }) {
  const response = await client.callTool({
    name: 'calendar.find_slots',
    arguments: {
      attendee: input.attendee,
      date: input.date,
      durationMinutes: input.durationMinutes,
    },
  });
  const slot = response.structuredContent.slots[0] ?? null;
  if (input.sendInvite && slot) {
    await client.callTool({
      name: 'calendar.send_invite',
      arguments: {
        attendee: input.attendee,
        start: slot,
        durationMinutes: input.durationMinutes,
        title: input.title,
      },
    });
    return { attendee: input.attendee, slot, invited: true };
  }
  return { attendee: input.attendee, slot, invited: false };
}
