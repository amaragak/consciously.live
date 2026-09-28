/**
 * Next marketing colour scheme — hybrid default, no localStorage preference.
 * Re-exports shared helpers after disabling persistence for this app.
 */
import {
  setColorSchemePreferencePersistence,
  colorSchemeBootScriptNoPersist,
} from "@consciously/common/theme";

setColorSchemePreferencePersistence(false);

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
  setColorScheme,
  toggleColorScheme,
  setColorSchemePreferencePersistence,
  colorSchemePreferencePersists,
} from "@consciously/common/theme";

/** Always hybrid (except `/login?scheme=`), and clears any stored preference. */
export const colorSchemeBootScript = colorSchemeBootScriptNoPersist;
