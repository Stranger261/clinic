import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, 30000);
  return () => clearInterval(timer);
};
const snapshot = () => Math.floor(Date.now() / 30000) * 30000;

export const useNow = () => useSyncExternalStore(subscribe, snapshot, () => 0);
