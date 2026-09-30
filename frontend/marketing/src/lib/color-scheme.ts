/**
 * Next marketing colour scheme — hybrid default, no localStorage preference.
 * Re-exports shared helpers after disabling persistence for this app.
 *
 * Hybrid is the marketing “light” look (cream header / cool surface-2). The
 * sun/moon toggle maps light ↔ hybrid so returning from dark restores hybrid,
 * not the SPA navy-header light tokens.
 */
import {
  setColorSchemePreferencePersistence,
  setDefaultColorScheme,
  colorSchemeBootScriptNoPersist,
  setColorScheme as setColorSchemeShared,
  toggleColorScheme as toggleColorSchemeShared,
  type ColorScheme,
} from "@consciously/common/theme";

setColorSchemePreferencePersistence(false);
setDefaultColorScheme("hybrid");

export {
  type ColorScheme,
  COLOR_SCHEME_STORAGE_KEY,
  COLOR_SCHEME_CHANGED_EVENT,
  COLOR_SCHEME_QUERY_PARAM,
  COLOR_SCHEME_OPTIONS,
  COLOR_SCHEME_OPTIONS_HOME_V2,
  HOME_HERO_PATTERN_LIGHT,
  HOME_HERO_PATTERN_DARK,
  AUTH_HERO_PATTERN_LIGHT,
  AUTH_HERO_PATTERN_DARK,
  getStoredColorScheme,
  parseColorScheme,
  getLiveColorScheme,
  isDarkColorScheme,
  resolveAuthColorScheme,
  withAuthColorSchemeQuery,
  applyColorScheme,
  setColorSchemePreferencePersistence,
  colorSchemePreferencePersists,
  setDefaultColorScheme,
  getDefaultColorScheme,
} from "@consciously/common/theme";

/** Always hybrid (except `/login?scheme=`), and clears any stored preference. */
export const colorSchemeBootScript = colorSchemeBootScriptNoPersist;

/** Marketing: treat “light” as hybrid so the Next default look is restored. */
export function setColorScheme(scheme: ColorScheme): void {
  setColorSchemeShared(scheme === "light" ? "hybrid" : scheme);
}

export function toggleColorScheme(): ColorScheme {
  return toggleColorSchemeShared();
}
