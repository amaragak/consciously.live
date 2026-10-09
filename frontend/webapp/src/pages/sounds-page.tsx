import { useLocation, useNavigate } from "react-router-dom";
import { AppPrimaryTabsDesktop } from "@/components/app-primary-tabs";
import {
  HEADER_SECTION_TABS_IDLE,
  HEADER_SECTION_TABS_SELECTED,
  HEADER_SECTION_TABS_TRACK,
} from "@/components/header-section-tabs";
import { MixerSoundsStudio } from "@/components/mixer-sounds-studio";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import { SoundsSoundscapesBrowse } from "@/components/sounds-soundscapes-browse";
import { SoundsVoicesBrowse } from "@/components/sounds-voices-browse";
import {
  SOUNDS_HUB_TABS,
  soundsHubHref,
  soundsHubTabFromPath,
  type SoundsHubTab,
} from "@/lib/sounds-tabs";

/**
 * Sounds hub: Custom Sounds (mixer studio) + Soundscapes + Voices browse.
 * Studio stays mounted across `/meditate/sounds`, `/new`, `/mix/:id`, `/preset/:id`
 * so URL changes do not remount or re-fetch.
 */
export function SoundsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = soundsHubTabFromPath(pathname);

  function goToTab(id: SoundsHubTab) {
    navigate(soundsHubHref(id));
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <AppPrimaryTabsDesktop>
        <SegmentedPillTabs
          aria-label="Sounds section"
          value={tab}
          onChange={goToTab}
          className={HEADER_SECTION_TABS_TRACK}
          idleClassName={HEADER_SECTION_TABS_IDLE}
          selectedClassName={HEADER_SECTION_TABS_SELECTED}
          options={SOUNDS_HUB_TABS.map((t) => ({
            id: t.id,
            label:
              t.shortLabel === t.label ? (
                t.label
              ) : (
                <>
                  <span className="sm:hidden">{t.shortLabel}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </>
              ),
          }))}
        />
      </AppPrimaryTabsDesktop>
      {tab === "custom" ? <MixerSoundsStudio /> : null}
      {tab === "soundscapes" ? <SoundsSoundscapesBrowse /> : null}
      {tab === "voices" ? <SoundsVoicesBrowse /> : null}
    </div>
  );
}
