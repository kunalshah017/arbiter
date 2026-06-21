import { useEffect, useRef } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface FlickeringGridProps {
    squareSize?: number;
    gridGap?: number;
    flickerChance?: number;
    color?: string;
    width?: number;
    height?: number;
    className?: string;
    maxOpacity?: number;
}

export function FlickeringGrid({
    squareSize = 4,
    gridGap = 6,
    flickerChance = 0.3,
    color = "rgb(0, 0, 0)",
    width,
    height,
    className,
    maxOpacity = 0.3,
}: FlickeringGridProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let pWidth = width || canvas.parentElement?.clientWidth || 0;
        let pHeight = height || canvas.parentElement?.clientHeight || 0;

        canvas.width = pWidth;
        canvas.height = pHeight;

        const cols = Math.floor(pWidth / (squareSize + gridGap));
        const rows = Math.floor(pHeight / (squareSize + gridGap));

        const squares = new Float32Array(cols * rows);
        for (let i = 0; i < squares.length; i++) {
            squares[i] = Math.random() * maxOpacity;
        }

        let lastTime = 0;
        const draw = (time: number) => {
            if (time - lastTime > 50) { // ~20fps flicker
                ctx.clearRect(0, 0, pWidth, pHeight);
                for (let i = 0; i < squares.length; i++) {
                    if (Math.random() < flickerChance) {
                        squares[i] = Math.max(0, Math.min(maxOpacity, squares[i] + (Math.random() - 0.5) * 0.15));
                    }
                    const x = (i % cols) * (squareSize + gridGap);
                    const y = Math.floor(i / cols) * (squareSize + gridGap);

                    ctx.fillStyle = color.replace("rgb", "rgba").replace(")", `, ${squares[i]})`);
                    ctx.fillRect(x, y, squareSize, squareSize);
                }
                lastTime = time;
            }
            animationFrameId = requestAnimationFrame(draw);
        };
        animationFrameId = requestAnimationFrame(draw);

        const handleResize = () => {
            if (!width || !height) {
                pWidth = canvas.parentElement?.clientWidth || 0;
                pHeight = canvas.parentElement?.clientHeight || 0;
                canvas.width = pWidth;
                canvas.height = pHeight;
            }
        };

        window.addEventListener("resize", handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener("resize", handleResize);
        };
    }, [squareSize, gridGap, flickerChance, color, width, height, maxOpacity]);

    return (
        <canvas
            ref={canvasRef}
            className={cn("pointer-events-none block", className)}
            style={{ width: width || "100%", height: height || "100%" }}
        />
    );
}