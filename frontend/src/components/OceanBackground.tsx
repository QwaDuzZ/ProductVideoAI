import { useEffect, useRef } from "react";

export function OceanBackground({ opacity = 0.12 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = opacity;

      const waveCount = 12;
      const spacing = canvas.height / waveCount;

      for (let i = 0; i < waveCount; i++) {
        const y = i * spacing;
        const hue = 320 + (i / waveCount) * 80;

        ctx.beginPath();
        ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.3 + (i / waveCount) * 0.4})`;
        ctx.lineWidth = 1;

        for (let x = 0; x <= canvas.width; x += 4) {
          const waveY =
            y + Math.sin((x / 200) + phase + (i * 0.5)) * 8 +
            Math.sin((x / 100) + phase * 0.7) * 4;

          if (x === 0) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }

        ctx.stroke();
      }

      phase += 0.003;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, [opacity]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
