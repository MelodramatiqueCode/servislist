import { parseEnvFlag } from "./alert-config";

/** Automatické návrhy výjazdov / ticketov. Predvolene vypnuté. */
export function isSuggestionsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return parseEnvFlag(env.SUGGESTIONS_ENABLED, false);
}
