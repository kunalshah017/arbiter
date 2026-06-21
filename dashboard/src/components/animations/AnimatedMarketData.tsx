import { motion } from "framer-motion";

export function AnimatedMarketData() {
    const bars = Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        // Math to make a pseudo wave / trend
        height: Math.sin(i * 0.5) * 40 + 60,
        isUp: Math.sin(i * 0.5) > Math.sin((i - 1) * 0.5)
    }));

    return (
        <div className="relative w-full h-[250px] bg-white border-[2.5px] border-border rounded-lg p-4 flex items-end gap-2 overflow-hidden" style={{ boxShadow: '4px 4px 0px var(--color-border)' }}>
            {/* Background horizontal lines mimicking a chart */}
            <div className="absolute inset-0 flex flex-col justify-between p-4 px-2 opacity-10 pointer-events-none">
                <div className="w-full h-px bg-border" />
                <div className="w-full h-px bg-border" />
                <div className="w-full h-px bg-border" />
                <div className="w-full h-px bg-border" />
            </div>

            {/* Simulated Agent scanning the chart */}
            <motion.div
                className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-primary/20 to-transparent z-10"
                animate={{ x: [-100, 500, -100] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />

            {bars.map((bar, i) => (
                <div key={bar.id} className="relative flex-1 flex flex-col items-center justify-end h-full">
                    {/* Wick */}
                    <motion.div
                        className="w-px bg-border absolute bottom-0 origin-bottom"
                        initial={{ height: 0 }}
                        animate={{ height: bar.height + (Math.random() * 30 + 10) }}
                        transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                    />
                    {/* Body */}
                    <motion.div
                        className={`w-full max-w-[12px] md:max-w-[20px] ${bar.isUp ? 'bg-success' : 'bg-danger'} border-2 border-border z-10 origin-bottom relative`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: bar.height, opacity: 1 }}
                        transition={{ duration: 0.6, delay: i * 0.05 + 0.2, ease: "easeOut" }}
                    >
                        {/* Little scanning indicator on top of recent bars */}
                        {i > 10 && (
                            <motion.div
                                className="absolute -top-3 -right-2 w-2 h-2 rounded-full bg-primary border border-border"
                                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                transition={{ repeat: Infinity, duration: 1 }}
                            />
                        )}
                    </motion.div>
                </div>
            ))}

            {/* Floating analysis badges */}
            <motion.div
                className="absolute top-4 left-4 bg-white border-2 border-border px-3 py-1 font-mono text-xs font-bold neo-shadow rounded-sm z-20"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 }}
                style={{ boxShadow: '2px 2px 0px var(--color-border)' }}
            >
                AI MODEL: ANALYZING
            </motion.div>

            <motion.div
                className="absolute bottom-4 right-4 bg-primary text-text border-2 border-border px-3 py-1 font-mono text-xs font-bold rounded-sm z-20"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2, type: "spring" }}
                style={{ boxShadow: '2px 2px 0px var(--color-border)' }}
            >
                ACTION: EXECUTE (RUST &lt;50ms)
            </motion.div>
        </div>
    );
}