export const PLAYER_ID_KEY = "cl-auction-player-id";
export const PLAYER_NAME_KEY = "cl-auction-display-name";
/** Aktiv auktion — spillere med samme game_id deler rum og holdpulje. */
export const PLAYER_GAME_ID_KEY = "cl-auction-game-id";

export type GameAdminSession = {
  gameId: string;
  adminSecret: string;
  inviteCode: string;
  label: string | null;
};

/** Vært: gemmer game_id + hemmelig nøgle til admin-RPC’er (beskyt i produktion med rigtig auth). */
export const GAME_ADMIN_SESSION_KEY = "cl-auction-game-admin-session";

/** Læser værtens gemte admin-session fra localStorage (null hvis ingen/ugyldig). */
export function readAdminSession(): GameAdminSession | null {
  try {
    const raw = localStorage.getItem(GAME_ADMIN_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof o.gameId === "string" &&
      typeof o.adminSecret === "string" &&
      typeof o.inviteCode === "string"
    ) {
      return {
        gameId: o.gameId,
        adminSecret: o.adminSecret,
        inviteCode: o.inviteCode,
        label: typeof o.label === "string" ? o.label : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeAdminSession(s: GameAdminSession) {
  localStorage.setItem(GAME_ADMIN_SESSION_KEY, JSON.stringify(s));
}
