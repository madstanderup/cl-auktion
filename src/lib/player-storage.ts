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
