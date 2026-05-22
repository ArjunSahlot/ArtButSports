"use client";

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  from?: string;
  to?: string;
  "aria-label"?: string;
};

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
  from,
  to,
  ...rest
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      style={
        {
          "--pct": `${pct}%`,
          "--slider-from": from,
          "--slider-to": to
        } as React.CSSProperties
      }
      onChange={(event) => onChange(Number(event.target.value))}
      {...rest}
    />
  );
}
