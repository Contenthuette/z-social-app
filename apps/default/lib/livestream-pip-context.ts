import { createContext, useContext } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export interface LivestreamPipContextType {
  /** Livestream currently minimized into the floating PiP window (null = none) */
  minimizedLivestreamId: Id<"livestreams"> | null;
  /** Minimize a livestream into the draggable PiP window */
  minimizeLivestream: (livestreamId: Id<"livestreams">) => void;
  /** Close the PiP window entirely (stop watching) */
  closeLivestreamPip: () => void;
}

export const LivestreamPipContext = createContext<LivestreamPipContextType>({
  minimizedLivestreamId: null,
  minimizeLivestream: () => {},
  closeLivestreamPip: () => {},
});

export function useLivestreamPip() {
  return useContext(LivestreamPipContext);
}
