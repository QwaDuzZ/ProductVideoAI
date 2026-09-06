import { useState, useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = "info", onClose, duration = 5000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const borderColor = {
    success: "border-success/30",
    error: "border-danger/30",
    info: "border-edge",
  }[type];

  const iconColor = {
    success: "text-success",
    error: "text-danger",
    info: "text-queue",
  }[type];

  return (
    <div
      className={`toast ${borderColor} transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`text-lg ${iconColor}`}>
          {type === "success" && "✓"}
          {type === "error" && "✕"}
          {type === "info" && "ℹ"}
        </span>
        <span className="text-sm text-fog">{message}</span>
      </div>
    </div>
  );
}
