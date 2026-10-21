"use client";
import { useEffect } from "react";
import { motion } from "framer-motion";

/** Re-mounts on every navigation: fades the page in and returns to the top (unless a #hash is targeted). */
export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, []);
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}
