import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

/**
 * Native call ringtone/ringback via expo-audio. Unlike the WebView WebAudio
 * tones, this plays reliably even when the phone is on silent (playsInSilentMode)
 * and for incoming calls where there's no user gesture to unlock audio.
 */
let player: AudioPlayer | null = null;
let playing = false;

export async function startRingtone(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "duckOthers",
      allowsRecording: false,
    });
    if (!player) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      player = createAudioPlayer(require("../assets/sounds/ringtone.wav"));
      player.loop = true;
      player.volume = 1.0;
    }
    player.seekTo(0);
    player.play();
    playing = true;
  } catch (e) {
    console.warn("[ringtone] start failed:", e);
  }
}

export function stopRingtone(): void {
  if (!playing) return;
  playing = false;
  try {
    player?.pause();
  } catch {
    /* ignore */
  }
}
