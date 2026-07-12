# CL Auktion — teknisk status (reference til næste session)

> Sidst opdateret som udgangspunkt for genstart af chat / nyt kontekstvindue.

## 1. Project objective

**Champions League-auktion og fantasy** for **2–8 spillere** over en sæson (inkl. måneders forløb).

- **Fase 1 — Auktion (implementeret i stor udstrækning):** Blindbud pr. hold; afsløring; uafgjort → om-auktion med minimumsbud; mønter trækkes fra vinder; hold tildeles via per-spil roster (`game_teams`). Flere **parallelle spil** med **invitationskode** og **vært-admin** (hemmelig nøgle i browser).
- **Fase 2 — Turneringspoint / dashboard (delvist):** `players.points` findes; **`/score`** viser stilling og rangliste pr. spil. **Kampe, automatiske pointregler og admin-indtastning af resultater** er endnu ikke bygget ind i det nye `games`/`players`-flow (ældre `matches` / `fantasy_point_events` i `initial_schema` er lobby-baseret og ikke koblet på).

**Admin:** Kan trække hold, afsløre (eller lade auto-afsløring køre), nulstille spil, slette spillere én ad gangen, oprette nye spil med kode.

---

## 2. Tech stack

| Lag | Valg |
|-----|------|
| Framework | **Next.js** (App Router, **v16**-familie — følg projektets `AGENTS.md` / `node_modules/next/dist/docs/` for API-konventioner; fx **proxy** frem for deprecated `middleware`-filnavn) |
| Sprog | **TypeScript** |
| Styling | **Tailwind CSS** |
| UI | **shadcn-**stil komponenter (`Button`, `Input`, …) |
| Backend / data | **Supabase** (Postgres, **Realtime** `postgres_changes`, **RLS**, **RPC** `SECURITY DEFINER`) |
| Client DB | `@supabase/supabase-js` singleton i `src/lib/supabase.ts` (anon key; kaster ved manglende env) |
| Session (nuværende) | **Supabase Auth** (email/adgangskode via `/login` + `/register`); `localStorage` bruges som cache for `player_id`/`game_id`/admin-session og gendannes fra forsiden via `players.user_id` |

**Miljø:** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `next.config.ts` læser `.env.local` eksplicit så Turbopack/system-env ikke overskriver forkert.

---

## 3. Current progress (auktionsmodulet)

- **Velkomst / join:** Forside med regler, **invitationskode** + navn → opretter række i `players` med `game_id`, gemmer keys, linker til auktion.
- **Multi-game:** `games` (invite code, `admin_secret`, label), `game_teams` (ejerskab pr. spil), `players.game_id`, `auction_state.game_id` (én række pr. spil), `auction_room_bids.game_id`. Migration af eksisterende data til spil med kode **`DEFAULT`**.
- **Auktionsrum (`/auction`):** Realtime på `auction_state`, spillere, `game_teams`, bud; status-UI (waiting, bidding, tie_breaker, revealed); bud med ret-bud; statusboks (hold/spillere/bud); holdoversigt; afslutningsmarkering når ingen ledige hold; **vinder-banner ~10 sek.** fra `auction_state` resolution-felter.
- **Auto-afsløring:** Efter INSERT på `auction_room_bids` trigger kalder `reveal_auction_round_for_game(game_id, true)` når alle påkrævede spillere har budt; admin-RPC bruger samme kerne med `require_all_bids = false` for manuel tidlig afsløring.
- **Admin (`/auction/admin`):** Opret spil (`create_game`), vis/kopiér kode, træk hold, afslør, nulstil spil, slet spillere (RPC med game + secret).
- **Stilling (`/score`):** Point, mønter, egne hold, rangliste for spillet; realtime på `players` / `game_teams`.
- **Proxy:** `src/proxy.ts` (ikke `middleware.ts`) til session refresh; matcher bl.a. uden `/api/*` hvis konfigureret sådan.

---

## 4. Key decisions

- **Ingen anden `public.bids` til auktionsrum:** Eksisterende `public.bids` (lobby/auction_draws) i `initial_schema` — rum-bud ligger i **`auction_room_bids`**.
- **Holdkatalog vs. ejerskab:** `teams` er fælles katalog (navn/kort navn); **`game_teams`** knytter `(game_id, team_id)` til `owner_player_id`. `teams.owner_player_id` er efter migration ikke længere sandheden for multi-game (migration nulstiller ejerskab på catalog og flytter til `game_teams`).
- **RPC-admin:** `admin_draw_next_team`, `admin_reveal_and_find_winner`, `admin_reset_game`, `admin_delete_player`, `create_game` — validering med `p_game_id` + `p_admin_secret` (undtagen `create_game` som returnerer secret).
- **Afsløringslogik:** Delt i `reveal_auction_round_for_game(p_game_id, p_require_all_bids)`; seneste bud pr. spiller pr. fase via `distinct on (player_id) … order by created_at desc`.
- **Vinder visning:** Kolonner `resolution_*` + `resolution_until` på `auction_state` i 10 sekunder (server-tidsstempel); klient skjuler når `now > resolution_until`; ryddes ved næste træk / reset / tie-break entry.
- **Spilleridentitet:** Supabase Auth-konto koblet til `players.user_id`. Forsiden viser "mine spil" for den loggede ind bruger og gendanner `localStorage`-nøglerne ved valg af spil. Rejoin med invitationskode finder eksisterende spiller via `user_id` (fallback: navn, hvorefter `user_id` backfilles) — ingen dubletter ved nyt device.
- **Realtime filters:** Kanal-filtre `game_id=eq.<uuid>` hvor muligt.
- **Polling-fallback:** Auktionsside poller ~2,5 s til statistik/oversigt hvis events udebliver.

---

## 5. Pending tasks (næste skridt i modulet / produkt)

**Nær horisont (auktion + drift):**

- Køre / versionsstyre alle relevante **SQL-migrationer** i Supabase (rækkefølge: kerne → multi_game → auto_reveal → victory_banner).
- **Seed af CL-hold** pr. spil sikres ved `create_game` (kopierer fra `teams`); tom `teams` = intet at trække.
- **Turneringsfase:** Kobling fra `matches` / resultater til **`players.points`** (eller nye tabeller pr. `game_id`), admin-UI til indtastning, eventuel historik pr. hold/spiller.
- **Produktion:** ~~Supabase Auth~~ (✅ bygget — email/adgangskode + `players.user_id`-rejoin). Tilbage: **RLS** strammet (ingen åben `update`/`insert` på alt for anon — fx kan alle indsætte bud som enhver spiller), admin uden secret i `localStorage`.

**Kvalitet / UX:**

- Evt. forbedret **gendannelse** af session (magic link, “genindsæt kode + bekræft navn”) uden fuld Auth.
- Tests / E2E for kritisk flow (join → bud → auto reveal → score).

---

## 6. File map

### App (Next.js)

| Fil | Formål |
|-----|--------|
| `src/app/page.tsx` | Forside: regler, invitationskode + navn, join; link til admin, score, auktion |
| `src/app/auction/page.tsx` | Auktionsrum: realtime state, bud, ret bud, statistik, holdoversigt, vinder-banner |
| `src/app/auction/admin/page.tsx` | Vært: opret spil, RPC-knapper, spillersletning, status |
| `src/app/score/page.tsx` | Stilling: egne point/mønter/hold, rangliste pr. spil |
| `src/app/layout.tsx` | Root layout |
| `src/proxy.ts` | Next **proxy** (tidligere middleware-konvention) |
| `src/lib/supabase.ts` | Browser Supabase client |
| `src/lib/supabase/client.ts`, `server.ts` | Evt. split clients (tjek importstier i nye features) |
| `src/lib/player-storage.ts` | `localStorage`-nøgler + `GameAdminSession` type |
| `src/lib/utils.ts` | `cn()` m.fl. |
| `src/components/ui/button.tsx`, `input.tsx` | shadcn-lignende UI |
| `next.config.ts` | Env-injektion fra `.env.local` |
| `AGENTS.md` / `CLAUDE.md` | Next.js-projektregler |

### Supabase

| Fil | Formål |
|-----|--------|
| `supabase/migrations/20260327213000_initial_schema.sql` | Kerne inkl. `teams`, lobby, `bids` (lobby), `matches`, m.m. |
| `supabase/migrations/20260328120000_players.sql` | `players` (name, coins, points) |
| `supabase/migrations/20260329120000_players_rename_display_name_to_name.sql` | Kolonne `name` |
| `supabase/migrations/20260330100000_auction_state_and_bids.sql` | `auction_state` (uden rum-bud tabel) |
| `supabase/migrations/20260330200000_auction_room_bids.sql` | `auction_room_bids` |
| `supabase/migrations/20260331100000_admin_round_and_tiebreaker.sql` | Udvidelser + tidlige admin-funktioner (suppleres af senere migrationer) |
| `supabase/migrations/20260414120000_admin_delete_player.sql` | `admin_delete_player` (ældre signatur — erstattes af multi_game-version) |
| `supabase/migrations/20260415100000_multi_game.sql` | `games`, `game_teams`, `game_id` overalt, RPC multi-game |
| `supabase/migrations/20260416120000_auto_reveal_and_rebid.sql` | `reveal_auction_round_for_game` + trigger auto-afsløring |
| `supabase/migrations/20260417120000_victory_banner_10s.sql` | Resolution-kolonner + opdaterede reveal/draw/reset |
| `supabase/run_*.sql` | Manuelle “kør i SQL Editor”-scripts (kopier eller sammensæt i rækkefølge) |
| `supabase/run_auction_complete_fix.sql` | Ældre samlet fix (kan være forældet ift. multi_game + nyere RPC) |

---

## 7. Hurtig kommando / miljø

- Udvikling: `npm run dev` (Next med Turbopack per projektopsætning).
- Build: `npm run build`.
- Supabase: kør migrationer i Dashboard SQL eller CLI; efter schemaændringer: `notify pgrst, 'reload schema';` (ofte inkluderet i scripts).

---

*Denne fil er skrevet som fast referencenotat; opdater den når arkitektur eller filer ændres væsentligt.*
