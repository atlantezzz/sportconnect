"use client";

import { useEffect, useState } from "react";

// With cacheComponents, Next.js hides a page you navigate away from (React
// <Activity>) instead of unmounting it, and re-runs its effects when you come
// back. react-leaflet can't handle that: it removes the map on hide but keeps
// using the removed map afterwards ("Map container is being reused",
// "reading 'appendChild'"). Render the map only while this is true, so it is
// unmounted while hidden and built fresh when the page is shown again.
export function useIsShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the effect itself is the "page is shown" signal
    setShown(true);
    return () => setShown(false);
  }, []);
  return shown;
}
