import type {
  VoiceAccent,
  VoiceEnergy,
  VoiceGender,
  VoicePitch,
} from "@/lib/medimade-api";

export const VOICE_ENERGY_OPTIONS = [
  ["calm", "Calm"],
  ["steady", "Steady"],
  ["bright", "Bright"],
] as const satisfies ReadonlyArray<readonly [VoiceEnergy, string]>;

export const VOICE_PITCH_OPTIONS = [
  ["low", "Low"],
  ["mid", "Mid"],
  ["high", "High"],
] as const satisfies ReadonlyArray<readonly [VoicePitch, string]>;

export const VOICE_GENDER_OPTIONS = [
  ["male", "Male"],
  ["female", "Female"],
] as const satisfies ReadonlyArray<readonly [VoiceGender, string]>;

export const VOICE_ACCENT_OPTIONS = [
  ["UK", "UK"],
  ["US", "US"],
  ["African", "African"],
] as const satisfies ReadonlyArray<readonly [VoiceAccent, string]>;

export function VoiceTraitRadios<T extends string>({
  legend,
  name,
  value,
  options,
  disabled,
  onChange,
}: {
  legend: string;
  name: string;
  value: T | null;
  options: ReadonlyArray<readonly [T, string]>;
  disabled: boolean;
  onChange: (next: T | null) => void;
}) {
  return (
    <fieldset className="text-xs font-medium text-muted">
      <legend>{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {options.map(([val, label]) => (
          <label
            key={val}
            className="flex cursor-pointer items-center gap-1.5 font-normal text-foreground"
          >
            <input
              type="radio"
              name={name}
              checked={value === val}
              disabled={disabled}
              onChange={() => onChange(val)}
            />
            {label}
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-1.5 font-normal text-foreground">
          <input
            type="radio"
            name={name}
            checked={value == null}
            disabled={disabled}
            onChange={() => onChange(null)}
          />
          Not specified
        </label>
      </div>
    </fieldset>
  );
}

export function VoicePreferredTraitFields({
  id,
  energy,
  pitch,
  gender,
  accent,
  disabled,
  onEnergy,
  onPitch,
  onGender,
  onAccent,
}: {
  id: string;
  energy: VoiceEnergy | null;
  pitch: VoicePitch | null;
  gender: VoiceGender | null;
  accent: VoiceAccent | null;
  disabled: boolean;
  onEnergy: (next: VoiceEnergy | null) => void;
  onPitch: (next: VoicePitch | null) => void;
  onGender: (next: VoiceGender | null) => void;
  onAccent: (next: VoiceAccent | null) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <VoiceTraitRadios
        legend="Energy"
        name={`energy-${id}`}
        value={energy}
        options={VOICE_ENERGY_OPTIONS}
        disabled={disabled}
        onChange={onEnergy}
      />
      <VoiceTraitRadios
        legend="Pitch"
        name={`pitch-${id}`}
        value={pitch}
        options={VOICE_PITCH_OPTIONS}
        disabled={disabled}
        onChange={onPitch}
      />
      <VoiceTraitRadios
        legend="Gender"
        name={`gender-${id}`}
        value={gender}
        options={VOICE_GENDER_OPTIONS}
        disabled={disabled}
        onChange={onGender}
      />
      <VoiceTraitRadios
        legend="Accent"
        name={`accent-${id}`}
        value={accent}
        options={VOICE_ACCENT_OPTIONS}
        disabled={disabled}
        onChange={onAccent}
      />
    </fieldset>
  );
}
