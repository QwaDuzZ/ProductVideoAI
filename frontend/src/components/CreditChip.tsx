interface CreditChipProps {
  amount: number;
  showSign?: boolean;
}

export function CreditChip({ amount, showSign = false }: CreditChipProps) {
  const sign = showSign && amount > 0 ? "+" : "";
  return (
    <span className="credit-chip">
      <span className="text-orange">{sign}{amount}</span>
      <span>cr</span>
    </span>
  );
}
