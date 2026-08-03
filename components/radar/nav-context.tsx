"use client";

import { createContext, useContext } from "react";

interface RadarNavState {
  /** Opens the off-canvas navigation drawer (below the lg breakpoint). */
  openNav: () => void;
}

/**
 * Lets the header open the mobile drawer without threading props through every
 * page. Defaults to a no-op so the header still renders outside the shell.
 */
export const RadarNavContext = createContext<RadarNavState>({
  openNav: () => {},
});

export function useRadarNav(): RadarNavState {
  return useContext(RadarNavContext);
}
