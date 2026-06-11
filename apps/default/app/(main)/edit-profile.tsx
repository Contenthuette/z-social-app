import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Modal,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConvexAuth } from "convex/react";
import { Image } from "expo-image";
import Icon from "@/components/Icon";
import { colors, spacing, radius } from "@/lib/theme";
import { safeBack } from "@/lib/navigation";
import { pickImage, uploadToConvex } from "@/lib/media-picker";
import * as Haptics from "expo-haptics";
import { INTERESTS } from "@/lib/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";
import { router } from "expo-router";

export default function EditProfileScreen() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? undefined : "skip");
  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [county, setCounty] = useState("");
  const [city, setCity] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<{ uri: string; mimeType: string } | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<{ uri: string; mimeType: string } | null>(null);

  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [pickingBanner, setPickingBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customInterest, setCustomInterest] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteMyAccount = useMutation(api.accountDeletion.deleteMyAccount);
  const removePushToken = useMutation(api.pushNotifications.removeToken);

  useEffect(() => {
    if (me) {
      setName(me.name ?? "");
      setBio(me.bio ?? "");
      setCounty(me.county ?? "");
      setCity(me.city ?? "");
      setSelectedInterests(me.interests ?? []);
      if (me.avatarUrl) setAvatarPreview(me.avatarUrl);
      if (me.bannerUrl) setBannerPreview(me.bannerUrl);
    }
  }, [me]);

  const handlePickAvatar = async () => {
    setPickingAvatar(true);
    try {
      const result = await pickImage({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (result) {
        setAvatarPreview(result.uri);
        setAvatarFile({ uri: result.uri, mimeType: result.mimeType });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } finally {
      setPickingAvatar(false);
    }
  };

  const handlePickBanner = async () => {
    setPickingBanner(true);
    try {
      const result = await pickImage({ quality: 0.8, allowsEditing: true, aspect: [16, 9] });
      if (result) {
        setBannerPreview(result.uri);
        setBannerFile({ uri: result.uri, mimeType: result.mimeType });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } finally {
      setPickingBanner(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let avatarStorageId: string | undefined;
      let bannerStorageId: string | undefined;

      if (avatarFile) {
        const url = await generateUploadUrl();
        avatarStorageId = await uploadToConvex(url, avatarFile.uri, avatarFile.mimeType);
      }
      if (bannerFile) {
        const url = await generateUploadUrl();
        bannerStorageId = await uploadToConvex(url, bannerFile.uri, bannerFile.mimeType);
      }

      await updateProfile({
        name: name.trim() || undefined,
        bio: bio.trim() || undefined,
        county: county.trim() || undefined,
        city: city.trim() || undefined,
        interests: selectedInterests.length > 0 ? selectedInterests : undefined,
        ...(avatarStorageId ? { avatarStorageId: avatarStorageId as never } : {}),
        ...(bannerStorageId ? { bannerStorageId: bannerStorageId as never } : {}),
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setSaved(true);
      setTimeout(() => {
        safeBack("edit-profile");
      }, 600);
    } catch (error) {
      console.error("Profile update failed:", error);
      if (Platform.OS !== "web") {
        Alert.alert("Fehler", "Profil konnte nicht aktualisiert werden.");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const handleAddCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (trimmed && !selectedInterests.includes(trimmed) && !(INTERESTS as readonly string[]).includes(trimmed)) {
      setSelectedInterests(prev => [...prev, trimmed]);
      setCustomInterest("");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await removePushToken().catch(() => undefined);
      await deleteMyAccount();
      await authClient.deleteUser().catch((error: unknown) => {
        console.warn("Auth account deletion failed after app data deletion:", error);
      });
      await authClient.signOut();
      setShowDeleteModal(false);
      router.replace("/");
    } catch (error) {
      console.error("Account deletion failed:", error);
      if (Platform.OS !== "web") {
        Alert.alert("Fehler", "Account konnte nicht gelöscht werden. Bitte versuche es erneut.");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (me === undefined) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.gray400} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => safeBack("edit-profile")}
          style={styles.headerBtn}
        >
          <Icon name="chevron.left" size={20} tintColor={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil bearbeiten</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : saved ? (
            <Text style={styles.saveBtnText}>Gespeichert!</Text>
          ) : (
            <Text style={styles.saveBtnText}>Speichern</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Bannerbild</Text>
          <TouchableOpacity
            style={styles.bannerArea}
            onPress={handlePickBanner}
            disabled={pickingBanner || saving}
            activeOpacity={0.7}
          >
            {bannerPreview ? (
              <View style={styles.bannerPreviewWrap}>
                <Image
                  source={{ uri: bannerPreview }}
                  style={styles.bannerImage}
                  contentFit="cover"
                />
                <View style={styles.bannerOverlay}>
                  {pickingBanner ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <View style={styles.editBadge}>
                      <Icon name="camera" size={14} tintColor={colors.white} />
                      <Text style={styles.editBadgeText}>Ändern</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : pickingBanner ? (
              <View style={styles.bannerEmpty}>
                <ActivityIndicator size="large" color={colors.gray400} />
              </View>
            ) : (
              <View style={styles.bannerEmpty}>
                <Icon name="photo" size={28} tintColor={colors.gray400} />
                <Text style={styles.bannerEmptyText}>Bannerbild auswaehlen</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Profilbild</Text>
          <TouchableOpacity
            style={styles.avatarArea}
            onPress={handlePickAvatar}
            disabled={pickingAvatar || saving}
            activeOpacity={0.7}
          >
            {avatarPreview ? (
              <View style={styles.avatarWrap}>
                <Image
                  source={{ uri: avatarPreview }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
                <View style={styles.avatarOverlay}>
                  {pickingAvatar ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Icon name="camera" size={16} tintColor={colors.white} />
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="person.fill" size={32} tintColor={colors.gray400} />
                <View style={styles.avatarOverlaySmall}>
                  {pickingAvatar ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Icon name="camera" size={12} tintColor={colors.white} />
                  )}
                </View>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Fields */}
        <View style={styles.section}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="Dein Name"
              placeholderTextColor={colors.gray400}
              editable={!saving}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMultiline]}
              value={bio}
              onChangeText={setBio}
              placeholder="Erzähl was über dich..."
              placeholderTextColor={colors.gray400}
              multiline
              maxLength={300}
              editable={!saving}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Landkreis</Text>
            <TextInput
              style={styles.fieldInput}
              value={county}
              onChangeText={setCounty}
              placeholder="z.B. Rostock"
              placeholderTextColor={colors.gray400}
              editable={!saving}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Stadt</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="z.B. Stralsund"
              placeholderTextColor={colors.gray400}
              editable={!saving}
            />
          </View>
        </View>

        {/* Interests */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Interessen</Text>
          <Text style={styles.interestHint}>
            Wähle Interessen aus, die dich beschreiben
          </Text>
          <View style={styles.interestChips}>
            {INTERESTS.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <TouchableOpacity
                  key={interest}
                  style={[styles.interestChip, isSelected && styles.interestChipActive]}
                  onPress={() => toggleInterest(interest)}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.interestChipText, isSelected && styles.interestChipTextActive]}>
                    {interest}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {selectedInterests
              .filter(i => !(INTERESTS as readonly string[]).includes(i))
              .map((interest) => (
                <TouchableOpacity
                  key={interest}
                  style={[styles.interestChip, styles.interestChipActive, styles.customChip]}
                  onPress={() => toggleInterest(interest)}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.interestChipText, styles.interestChipTextActive]}>
                    {interest}
                  </Text>
                  <Icon name="xmark" size={10} tintColor={colors.white} />
                </TouchableOpacity>
              ))}
          </View>
          <View style={styles.customInterestRow}>
            <TextInput
              style={styles.customInterestInput}
              value={customInterest}
              onChangeText={setCustomInterest}
              placeholder="Eigenes Interesse eingeben..."
              placeholderTextColor={colors.gray400}
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={handleAddCustomInterest}
            />
            <TouchableOpacity
              style={[styles.customInterestBtn, !customInterest.trim() && styles.customInterestBtnDisabled]}
              onPress={handleAddCustomInterest}
              disabled={!customInterest.trim() || saving}
              activeOpacity={0.7}
            >
              <Icon name="plus" size={16} tintColor={!customInterest.trim() ? colors.gray400 : colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Delete Account Button */}
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={() => setShowDeleteModal(true)}
          disabled={saving}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteAccountBtnText}>Account löschen</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Icon name="exclamationmark.triangle.fill" size={28} tintColor="#E53935" />
            </View>
            <Text style={styles.modalTitle}>Account löschen?</Text>
            <Text style={styles.modalBody}>
              Bist du sicher, dass du deinen Account löschen willst? Alle deine
              {"\n"}
              Posts, Fotos, Videos und Profildaten werden unwiderruflich gelöscht.
              {"\n"}
              Nachrichten, die du gesendet hast, bleiben erhalten.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Nicht löschen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnDelete}
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalBtnDeleteText}>Löschen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  loadingWrap: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "600", color: colors.black },
  saveBtn: {
    backgroundColor: colors.black,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 100,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: colors.gray300 },
  saveBtnText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bannerArea: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderStyle: "dashed",
    minHeight: 140,
  },
  bannerPreviewWrap: { position: "relative", minHeight: 140 },
  bannerImage: { width: "100%", height: 160, borderRadius: radius.md },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: radius.md,
  },
  bannerEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  bannerEmptyText: { fontSize: 14, color: colors.gray500 },
  editBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  editBadgeText: { color: colors.white, fontSize: 13, fontWeight: "600" },
  avatarArea: { alignSelf: "center" },
  avatarWrap: { position: "relative", width: 100, height: 100 },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.gray200,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarOverlaySmall: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldInput: {
    backgroundColor: colors.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.black,
  },
  fieldInputMultiline: { minHeight: 80, textAlignVertical: "top" },
  interestHint: {
    fontSize: 13,
    color: colors.gray400,
    marginBottom: spacing.sm,
  },
  interestChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  interestChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gray300,
    backgroundColor: colors.white,
  },
  interestChipActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  interestChipText: {
    fontSize: 13,
    color: colors.gray700,
  },
  interestChipTextActive: {
    color: colors.white,
    fontWeight: "600",
  },
  customChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  customInterestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  customInterestInput: {
    flex: 1,
    height: 42,
    backgroundColor: colors.gray100,
    borderRadius: 21,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.black,
  },
  customInterestBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  customInterestBtnDisabled: {
    backgroundColor: colors.gray200,
  },
  deleteAccountBtn: {
    backgroundColor: "#E53935",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  deleteAccountBtnText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.white,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: spacing.xl,
    alignItems: "center",
    gap: 12,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FDECEA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.black,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray500,
    textAlign: "center",
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: colors.gray100,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancelText: { color: colors.black, fontSize: 15, fontWeight: "600" },
  modalBtnDelete: {
    flex: 1,
    backgroundColor: "#E53935",
    paddingVertical: 14,
    borderRadius: radius.full,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnDeleteText: { color: colors.white, fontSize: 15, fontWeight: "600" },
});
