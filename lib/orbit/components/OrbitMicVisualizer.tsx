import React, { useEffect, useRef } from 'react';
import styles from '@/styles/OrbitMic.module.css';

interface OrbitMicVisualizerProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
}

export function OrbitMicVisualizer({ analyser, isRecording }: OrbitMicVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isRecording || !analyser || !canvasRef.current) {
      if (canvasRef.current) {
         const ctx = canvasRef.current.getContext('2d');
         ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match parent button size (74px roughly from user request, but we'll adapt to canvas size)
    // The CSS sets w/h to 100% of parent, but we need resolution.
    // Let's assume the parent button size is around 40-50px in the control bar, 
    // or we use the explicit 74px if we are overriding.
    // For integration in ControlBar usage, we will rely on layout.
    // Setting internal resolution:
    canvas.width = 74; 
    canvas.height = 74;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let animationFrameId: number;

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const centerX = w / 2;
      const centerY = h / 2;
      const radius = 20; // Slightly smaller than 25 to fit inside button
      const bars = 30;

      for (let i = 0; i < bars; i++) {
        const angle = (i * Math.PI * 2) / bars;
        const v = dataArray[i] / 255;
        const bHeight = v * 12;

        const xStart = centerX + Math.cos(angle) * radius;
        const yStart = centerY + Math.sin(angle) * radius;
        const xEnd = centerX + Math.cos(angle) * (radius + bHeight);
        const yEnd = centerY + Math.sin(angle) * (radius + bHeight);

        // Updated color to match request context or theme? 
        // User snippet had `rgba(56, 189, 248, ${0.3 + v})` (light blue)
        // Control bar usually has green theme. Sticking to user snippet color or green?
        // User snippet: rgba(56, 189, 248) is sky-ish blue.
        // Let's us Orbit Green if branding implies, but user code specifically had that color.
        // I will use the code from snippet.
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.3 + v})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
      }
    };

    draw();

    return () => cancelAnimationFrame(animationFrameId);
  }, [analyser, isRecording]);

  return <canvas ref={canvasRef} className={styles.orbitMicVisualizer} />;
}
