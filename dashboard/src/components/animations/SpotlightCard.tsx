import { useRef, useState } from "react";
import { motion, useMotionTemplate, useSpring } from "framer-motion";

export function SpotlightCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const mouseX = useSpring(0, { stiffness: 500, damping: 100 });
    const mouseY = useSpring(0, { stiffness: 500, damping: 100 });
    const [isHovered, setIsHovered] = useState(false);

    function onMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <div
            ref={ref}
            className={`neo-card relative overflow-hidden group ${className}`}
            onMouseMove={onMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Spotlight gradient effect */}
            <motion.div
                className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-0"
                style={{
                    background: useMotionTemplate`
                        radial-gradient(
                            300px circle at ${mouseX}px ${mouseY}px,
                            var(--color-primary) 0%,
                            transparent 80%
                        )
                    `,
                    opacity: isHovered ? 0.15 : 0
                }}
            />
            {/* Content, placed above the gradient */}
            <div className="relative z-10 h-full w-full">
                {children}
            </div>

            {/* Interactive translation on hover for neo-brutalism */}
            <div className="absolute inset-0 border-2 border-transparent transition-colors duration-300 group-hover:border-primary/20 rounded z-20 pointer-events-none" />
        </div>
    );
}