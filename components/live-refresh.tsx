"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LiveBadge from "@/components/live-badge";
import { createClient } from "@/lib/supabase/client";

export default function LiveRefresh({
  table = "slots",
  filter,
  showStatus = true,
}: {
  table?: string;
  filter?: string;
  showStatus?: boolean;
}) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Several changes in a row cause one refresh, not many.
    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase
      .channel(`live-${table}-${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        refreshSoon,
      )
      .subscribe((status) => {
        liveRef.current = status === "SUBSCRIBED";
        setLive(liveRef.current);
      });

    // Safety net: if the live connection is down, still refresh now and then.
    const fallback = setInterval(() => {
      if (!liveRef.current) router.refresh();
    }, 30000);

    // Always close the channel when leaving the page, to stay under the connection limit.
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [router, table, filter]);

  return showStatus ? <LiveBadge live={live} /> : null;
}
