"use client";

import { useEffect, useRef } from "react";
import { useJobStore } from "@/store/useJobStore";

export function LocationHydrator() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const match = document.cookie.match(new RegExp('(^| )user-location=([^;]+)'));
    if (match && match[2]) {
      const savedLocation = decodeURIComponent(match[2]);
      const current = useJobStore.getState().location;
      if (current !== savedLocation) {
        // Update store without rewriting the cookie (since it already exists)
        useJobStore.setState({ location: savedLocation });
      }
    } else {
      // Brand new user: Default to United States and save it
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      document.cookie = `user-location=${encodeURIComponent("United States")};path=/;expires=${d.toUTCString()}`;
    }
  }, []);

  return null;
}
