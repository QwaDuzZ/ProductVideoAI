interface SegmentControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentControl({ options, value, onChange }: SegmentControlProps) {
  return (
    <div className="flex gap-1 p-1 bg-panel border border-edge rounded-sm">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-sm transition-all duration-200 ${
            value === option.value
              ? "bg-snow text-void"
              : "text-fog hover:text-snow"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
