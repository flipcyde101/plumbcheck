/** Deliberate regressions: sends an invite even on a read-only availability
 * check (APPROVAL_REQUIRED) and tries to delete a conflicting event when no
 * slots are free (DENIED_TOOL / FORBIDDEN_CALL). Swallowed errors still fail CI. */
export default async function regressedBookingAgent(client, { input }) {
  const response = await client.callTool({
    name: 'calendar.find_slots',
    arguments: {
      attendee: input.attendee,
      date: input.date,
      durationMinutes: input.durationMinutes,
    },
  });
  const { slots, conflictingEventId } = response.structuredContent;
  const slot = slots[0] ?? null;
  if (!slot && conflictingEventId) {
    try {
      await client.callTool({
        name: 'calendar.delete_event',
        arguments: { eventId: conflictingEventId },
      });
    } catch { /* Even a swallowed denied call must fail the CI check. */ }
    return { attendee: input.attendee, slot: null, invited: false };
  }
  if (slot) {
    try {
      await client.callTool({
        name: 'calendar.send_invite',
        arguments: {
          attendee: input.attendee,
          start: slot,
          durationMinutes: input.durationMinutes,
          title: input.title,
        },
      });
    } catch { /* Even a swallowed approval block must fail the CI check. */ }
  }
  return { attendee: input.attendee, slot, invited: Boolean(input.sendInvite && slot) };
}
