import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions,
  TouchableOpacity, Pressable, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withTiming,
  withSequence, Easing,
} from "react-native-reanimated";
import { colors, spacing, radius } from "@/lib/theme";
import { Button } from "@/components/Button";
import { SymbolView } from "@/components/Icon";
import { ZLogo } from "@/components/ZLogo";
import { LEGAL_URLS } from "@/lib/legal-links";

const VIDEO_THUMBNAIL = require("../../../../assets/images/video-thumbnail.jpg");

const VIDEO_URL =
  "https://glad-canary-992.convex.cloud/api/storage/d660c790-7509-42a7-877d-434fd7f82efc";

const FEATURES = [
  {
    icon: "mappin.and.ellipse" as const,
    label: "Nur Leute\naus MV",
  },
  {
    icon: "hands.sparkles" as const,
    label: "Gemeinsam\nbewegen",
  },
  {
    icon: "sparkles" as const,
    label: "Exklusive\nEvents",
  },
  {
    icon: "person.2" as const,
    label: "Finde Leute\nwie dich",
  },
];

// Design baseline: 390pt (iPhone 12/13 width used in preview)
const BASE_WIDTH = 390;

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const s = width / BASE_WIDTH; // scale factor
  const videoWidth = width - spacing.xl * 2;
  const videoHeight = videoWidth * (9 / 16);
  const featureSize = (width - spacing.xl * 2 - spacing.sm * 3) / 4;

  const [agbAccepted, setAgbAccepted] = useState(false);
  const [showAgbError, setShowAgbError] = useState(false);

  const openLegalUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("Failed to open legal URL", error);
    }
  }, []);

  // Pulse animation for play button
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const player = useVideoPlayer(VIDEO_URL, (p) => {
    p.loop = false;
    p.muted = false;
    p.pause();
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  const [hasStarted, setHasStarted] = useState(false);

  const togglePlay = useCallback(() => {
    if (!hasStarted) {
      setHasStarted(true);
    }
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player, hasStarted]);

  const handleJoin = useCallback(() => {
    // Button reagiert immer: ohne akzeptierte AGB/Datenschutz keine Weiterleitung,
    // sondern ein sichtbarer Hinweis (statt eines "toten" Buttons).
    if (!agbAccepted) {
      setShowAgbError(true);
      return;
    }
    router.navigate("/(auth)/signup");
  }, [agbAccepted]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header */}
        <View style={styles.logoRow}>
          <ZLogo size={72} />
        </View>

        <Text style={[styles.title, { fontSize: 34 * s, lineHeight: 38 * s }]}>We are Z</Text>
        <Text style={[styles.subtitle, { fontSize: 15 * s }]}>{"Social Media. Nur für MV."}</Text>

        {/* Video */}
        <View style={[styles.videoWrap, { width: videoWidth, height: videoHeight }]}>
          {/* Thumbnail shown before play */}
          {!hasStarted && (
            <View style={StyleSheet.absoluteFill}>
              <Image
                source={VIDEO_THUMBNAIL}
                style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
                contentFit="cover"
              />
              <BlurView
                intensity={30}
                tint="default"
                style={[StyleSheet.absoluteFill, { borderRadius: radius.xl, overflow: "hidden" }]}
              />
            </View>
          )}
          <VideoView
            player={player}
            style={[
              { width: videoWidth, height: videoHeight },
              !hasStarted && { opacity: 0 },
            ]}
            contentFit="contain"
            nativeControls={hasStarted}
            allowsPictureInPicture={false}
          />
          {!hasStarted && (
            <Pressable onPress={togglePlay} style={styles.playOverlay}>
              <Animated.View style={[styles.playButton, pulseStyle, { width: 60 * s, height: 60 * s, borderRadius: 30 * s }]}>
                <SymbolView name="play.fill" size={28 * s} tintColor={colors.white} />
              </Animated.View>
            </Pressable>
          )}
        </View>

        {/* Compact Feature Chips */}
        <View style={styles.featureRow}>
          {FEATURES.map((feature, index) => (
            <View
              key={index}
              style={[styles.featureChip, { width: featureSize }]}
            >
              <View style={[styles.chipIcon, { width: 36 * s, height: 36 * s, borderRadius: 18 * s }]}>
                <SymbolView name={feature.icon} size={18 * s} tintColor={colors.gray500} />
              </View>
              <Text style={[styles.chipLabel, { fontSize: 10 * s, lineHeight: 13 * s }]}>{feature.label}</Text>
            </View>
          ))}
        </View>

        {/* Bottom Statement */}
        <View style={styles.bottomText}>
          <Text style={[styles.statement, { fontSize: 22 * s, lineHeight: 28 * s }]}>{"Social Media ist\nnicht mehr social."}</Text>
          <Text style={[styles.punchline, { fontSize: 15 * s }]}>{"Wir ändern das."}</Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.ctaWrap}>
        <Button
          title="Join the Movement"
          onPress={handleJoin}
          fullWidth
        />

        {showAgbError && !agbAccepted && (
          <Text style={styles.agbError}>
            Bitte akzeptiere die AGB und Datenschutzerklärung.
          </Text>
        )}

        <TouchableOpacity
          style={styles.agbRow}
          onPress={() => {
            setAgbAccepted(!agbAccepted);
            setShowAgbError(false);
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agbAccepted && styles.checkboxChecked]}>
            {agbAccepted && (
              <SymbolView name="checkmark" size={10} tintColor={colors.white} />
            )}
          </View>
          <Text style={styles.agbText}>
            Ich habe die{" "}
            <Text
              style={styles.agbLink}
              onPress={(e) => {
                e.stopPropagation();
                void openLegalUrl(LEGAL_URLS.terms);
              }}
            >
              AGB
            </Text>
            {" "}und{" "}
            <Text
              style={styles.agbLink}
              onPress={(e) => {
                e.stopPropagation();
                void openLegalUrl(LEGAL_URLS.privacy);
              }}
            >
              Datenschutzerklärung
            </Text>
            {" "}gelesen und akzeptiere diese.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.navigate("/(auth)/login")}
          style={styles.loginLink}
        >
          <Text style={styles.loginText}>
            {"Bereits Mitglied? "}<Text style={styles.loginBold}>Anmelden</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  logoRow: {
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: colors.black,
    letterSpacing: -1,
    lineHeight: 38,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.gray400,
    marginTop: spacing.xs,
    letterSpacing: -0.2,
    textAlign: "center",
  },

  /* Video */
  videoWrap: {
    marginTop: spacing.lg,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: colors.black,
    alignSelf: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
    boxShadow: "0px 4px 20px rgba(0,0,0,0.3)",
  },

  /* Compact Feature Chips */
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  featureChip: {
    alignItems: "center",
    gap: spacing.xs,
  },
  chipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.gray500,
    lineHeight: 13,
    letterSpacing: -0.1,
    textAlign: "center",
  },

  /* Bottom */
  bottomText: {
    marginTop: spacing.xl * 2,
    gap: spacing.xs,
  },
  statement: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.black,
    letterSpacing: -0.8,
    lineHeight: 28,
    textAlign: "center",
  },
  punchline: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.gray400,
    letterSpacing: -0.2,
    marginTop: spacing.xs,
    textAlign: "center",
  },

  /* CTA */
  ctaWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
    backgroundColor: colors.white,
    gap: spacing.md,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  loginText: {
    fontSize: 15,
    color: colors.gray500,
  },
  loginBold: {
    fontWeight: "600",
    color: colors.black,
  },
  agbError: {
    fontSize: 12,
    color: "#D92D20",
    textAlign: "center",
    fontWeight: "600",
  },
  agbRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    borderCurve: "continuous",
  },
  checkboxChecked: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  agbText: {
    flex: 1,
    fontSize: 11,
    color: colors.gray400,
    lineHeight: 16,
  },
  agbLink: {
    color: colors.gray600,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
