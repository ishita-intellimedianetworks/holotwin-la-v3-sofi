"use client";

interface ToggleProps {
  checked:   boolean;
  onChange?: () => void;
  disabled?: boolean;
  /** When true, renders as a non-interactive visual indicator (use inside another button) */
  passive?:  boolean;
}

const trackStyle = (checked: boolean) => ({
  position:     "relative" as const,
  flexShrink:   0,
  width:        36,
  height:       20,
  borderRadius: 10,
  border:       "none",
  padding:      0,
  background:   checked ? "var(--ui-accent-cyan)" : "rgba(255,255,255,0.18)",
  transition:   "background 0.2s",
});

const thumbStyle = (checked: boolean) => ({
  position:     "absolute" as const,
  top:          2,
  left:         checked ? 18 : 2,
  width:        16,
  height:       16,
  borderRadius: "50%",
  background:   "white",
  transition:   "left 0.18s ease",
});

export function Toggle({ checked, onChange, disabled, passive }: ToggleProps) {
  if (passive) {
    return (
      <div aria-hidden style={trackStyle(checked)}>
        <div style={thumbStyle(checked)} />
      </div>
    );
  }

  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{ cursor: disabled ? "not-allowed" : "pointer", ...trackStyle(checked) }}
    >
      <div style={thumbStyle(checked)} />
    </button>
  );
}
