import type { ChangeEvent, Ref } from "react";

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  inputClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  "aria-label": ariaLabel,
  className = "",
  inputClassName = "",
  inputRef,
}: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  return (
    <div className={`relative ${className}`.trim()}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
        <IconSearch />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={`app-search-input w-full rounded-xl border border-border py-2.5 pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/50 ${
          /\bbg-/.test(inputClassName) ? "" : "bg-background"
        } ${inputClassName}`.trim()}
      />
      {value.trim() ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[#A39C8C] text-[#1E2530] transition-colors hover:bg-[#8A8478]"
        >
          <svg
            viewBox="0 0 12 12"
            width="8"
            height="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M3 3l6 6M9 3L3 9" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
