"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/** The one container for everything that isn't the primary focus:
 *  a single slide-over, one topic at a time, Esc or backdrop to dismiss. */
export function Drawer({
  title,
  open,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "tween", duration: 0.18 }}
            className={`fixed inset-y-0 right-0 z-50 flex ${wide ? "w-full max-w-2xl" : "w-full max-w-md"} flex-col border-l border-edge bg-surface`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
              <span className="text-sm font-semibold text-slate-200">{title}</span>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
