/** Dungeon openDays are authored and validated in UTC on the game server.
 * Keep the client preview synchronized; server remains the final authority.
 */
export const dungeonDayUTC = timestamp => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid dungeon clock');
  return date.getUTCDay();
};
export const isDungeonOpenUTC = (dungeon, timestamp) =>
  Array.isArray(dungeon?.openDays) && dungeon.openDays.includes(dungeonDayUTC(timestamp));
