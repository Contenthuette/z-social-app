import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, spacing, radius, shadows } from "@/lib/theme";
import { SymbolView } from "@/components/Icon";
import { MiniLineChart, MiniBarChart, RevenueRow } from "@/components/admin/MiniChart";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvexAuth } from "convex/react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const ABO_PRICE = "5,99";

/* ─── Local types for dashboard data ───────────────────── */
interface DayStats { label: string; photos: number; videos: number }
interface GrowthDay { label: string; count: number }

interface AdminReport {
  _id: Id<"reports">;
  postId: string;
  reporterName: string;
  reason: string;
  status: "pending" | "reviewed" | "resolved";
  postCaption?: string;
  postAuthorName: string;
  postMediaUrl?: string;
  postType: "photo" | "video";
  createdAt: number;
}

interface AdminPartner {
  _id: Id<"partners">;
  businessName: string;
  city?: string;
  status: string;
}

interface AdminGroup {
  _id: Id<"groups">;
  name: string;
  memberCount: number;
  city?: string;
  visibility: "public" | "invite_only" | "request";
  creatorName: string;
  createdAt: number;
  pinnedAt?: number;
}

interface AdminMemberEvent {
  _id: Id<"memberEvents">;
  name: string;
  date: string;
  city: string;
  venue: string;
  attendeeCount: number;
  maxAttendees?: number;
  status: "upcoming" | "ongoing" | "completed" | "canceled";
  creatorName: string;
  groupId: Id<"groups">;
  createdAt: number;
}

interface AdminUser {
  _id: Id<"users">;
  name: string;
  email: string;
  role: "user" | "admin";
  subscriptionStatus: "none" | "active" | "canceled" | "expired";
  onboardingComplete: boolean;
  createdAt: number;
  lastActiveAt?: number;
}

interface AdminEvent {
  _id: Id<"events">;
  name: string;
  date: string;
  city: string;
  totalTickets: number;
  soldTickets: number;
  ticketPrice: number;
  currency: string;
  status: string;
  blurDate?: boolean;
  blurTime?: boolean;
  blurVenue?: boolean;
  blurCity?: boolean;
  blurPrice?: boolean;
  blurDescription?: boolean;
}

/* ─── KPI Card ───────────────────────────────────────────── */
function KPI({
  label,
  value,
  sub,
  icon,
  iconBg,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  iconBg?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: iconBg ?? colors.gray100 }]}> 
        <SymbolView name={icon} size={16} tintColor={iconBg ? colors.white : colors.gray600} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

/* ─── Section Card ─────────────────────────────────────── */
function Card({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <SymbolView name={icon} size={14} tintColor={colors.gray400} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/* ─── Event Row ──────────────────────────────────────── */
function EventRow({
  event,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onToggleHidden,
}: {
  event: AdminEvent;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const isHidden = !!(event.blurDate || event.blurTime || event.blurVenue || event.blurCity || event.blurPrice || event.blurDescription);

  return (
    <View style={styles.eventCard}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.eventHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventMeta}>
            {event.date} · {event.city}
          </Text>
        </View>
        {isHidden && (
          <View style={styles.hiddenIndicator}>
            <SymbolView name="eye.slash" size={11} tintColor={colors.gray400} />
          </View>
        )}
        <View style={styles.eventBadge}>
          <Text style={styles.eventBadgeText}>
            {event.status === "active" ? "Live" : "Entwurf"}
          </Text>
        </View>
        <SymbolView
          name={expanded ? "chevron.up" : "chevron.down"}
          size={13}
          tintColor={colors.gray400}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.eventExpanded}>
          <View style={styles.eventActions}>
            <TouchableOpacity onPress={onEdit} style={styles.eventActionBtn}>
              <SymbolView name="pencil" size={13} tintColor={colors.gray600} />
              <Text style={styles.eventActionText}>Bearbeiten</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onToggleHidden}
              style={[styles.eventActionBtn, isHidden && styles.eventHiddenActiveBtn]}
            >
              <SymbolView name={isHidden ? "eye" : "eye.slash"} size={13} tintColor={isHidden ? colors.white : colors.gray600} />
              <Text style={[styles.eventActionText, isHidden && { color: colors.white }]}>
                {isHidden ? "Infos einblenden" : "Infos verbergen"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={[styles.eventActionBtn, styles.eventDeleteBtn]}>
              <SymbolView name="trash" size={13} tintColor={colors.danger} />
              <Text style={[styles.eventActionText, { color: colors.danger }]}>Löschen</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.eventInfoRow}>
            Preis: {event.ticketPrice.toFixed(2)} {event.currency}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ─── Main Dashboard ───────────────────────────────────── */
export default function AdminDashboard() {
  const { isAuthenticated } = useConvexAuth();
  const stats = useQuery(api.admin.getAdminDashboard, isAuthenticated ? {} : "skip");
  const events = useQuery(api.admin.listEventsAdmin, isAuthenticated ? {} : "skip");
  const deleteEvent = useMutation(api.admin.deleteEvent);
  const toggleEventInfoHidden = useMutation(api.admin.toggleEventInfoHidden);
  const refreshAnalyticsSnapshot = useMutation(api.admin.refreshAnalyticsSnapshot);
  const [expandedId, setExpandedId] = useState<Id<"events"> | null>(null);

  /* ── Groups ── */
  const groups = useQuery(api.admin.listGroups, isAuthenticated ? {} : "skip");
  const deleteGroupMut = useMutation(api.admin.deleteGroupAdmin);
  const pinGroupMut = useMutation(api.admin.pinGroup);
  const unpinGroupMut = useMutation(api.admin.unpinGroup);

  const handleTogglePin = async (group: AdminGroup) => {
    try {
      if (group.pinnedAt) {
        await unpinGroupMut({ groupId: group._id });
      } else {
        await pinGroupMut({ groupId: group._id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Aktion fehlgeschlagen.";
      if (Platform.OS !== "web") Alert.alert("Hinweis", msg.replace(/^\[.*?\]\s*/, ""));
    }
  };

  /* ── Member Events ── */
  const memberEvents = useQuery(api.admin.listMemberEventsAdmin, isAuthenticated ? {} : "skip");
  const deleteMemberEventMut = useMutation(api.admin.deleteMemberEventAdmin);
  const [expandedMemberEventId, setExpandedMemberEventId] = useState<Id<"memberEvents"> | null>(null);

  /* ── Nutzer ── */
  const users = useQuery(api.admin.listUsers, isAuthenticated ? {} : "skip");
  const deleteUserMut = useMutation(api.admin.deleteUserAdmin);
  const [userSearch, setUserSearch] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<Id<"users"> | null>(null);
  const [exportingCSV, setExportingCSV] = useState(false);

  /* ── Partners ── */
  const partners = useQuery(api.admin.listPartners, isAuthenticated ? {} : "skip");
  const deletePartnerMut = useMutation(api.admin.deletePartner);

  /* ── Announcements ── */
  const currentAnnouncement = useQuery(api.admin.getActiveAnnouncement, isAuthenticated ? {} : "skip");
  const createAnnouncement = useMutation(api.admin.createAnnouncement);
  const updateAnnouncement = useMutation(api.admin.updateAnnouncement);
  const deleteAnnouncement = useMutation(api.admin.deleteAnnouncement);
  const [announceDraft, setAnnounceDraft] = useState("");
  const [announceEditing, setAnnounceEditing] = useState(false);
  const [announceSaving, setAnnounceSaving] = useState(false);

  /* ── Reports ── */
  const reports = useQuery(api.posts.listReports, isAuthenticated ? {} : "skip");
  const resolveReport = useMutation(api.posts.resolveReport);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshAnalyticsSnapshot({}).catch(() => {
      // Keep the dashboard usable even if refresh fails.
    });
  }, [isAuthenticated, refreshAnalyticsSnapshot]);

  const handleAnnounceSave = useCallback(async () => {
    const text = announceDraft.trim();
    if (!text) return;
    setAnnounceSaving(true);
    try {
      if (currentAnnouncement && announceEditing) {
        await updateAnnouncement({ id: currentAnnouncement._id, text });
      } else {
        await createAnnouncement({ text });
      }
      setAnnounceDraft("");
      setAnnounceEditing(false);
    } catch {
      if (Platform.OS !== "web") Alert.alert("Fehler", "Announcement konnte nicht gespeichert werden");
    } finally {
      setAnnounceSaving(false);
    }
  }, [announceDraft, currentAnnouncement, announceEditing, createAnnouncement, updateAnnouncement]);

  const handleAnnounceDelete = useCallback(() => {
    if (!currentAnnouncement) return;
    const doDelete = async () => {
      try {
        await deleteAnnouncement({ id: currentAnnouncement._id });
        setAnnounceDraft("");
        setAnnounceEditing(false);
      } catch {
        if (Platform.OS !== "web") Alert.alert("Fehler", "Konnte nicht gelöscht werden");
      }
    };
    if (Platform.OS !== "web") {
      Alert.alert("Announcement löschen", "Wirklich löschen? Die Leiste verschwindet sofort.", [
        { text: "Abbrechen", style: "cancel" },
        { text: "Löschen", style: "destructive", onPress: doDelete },
      ]);
    } else {
      doDelete();
    }
  }, [currentAnnouncement, deleteAnnouncement]);

  const handleDelete = useCallback(
    (eventId: Id<"events">, name: string) => {
      const doDelete = async () => {
        try {
          await deleteEvent({ eventId });
        } catch {
          if (Platform.OS !== "web") Alert.alert("Fehler", "Event konnte nicht gelöscht werden");
        }
      };
      if (Platform.OS !== "web") {
        Alert.alert("Event löschen", `"${name}" wirklich löschen? Alle Tickets werden ebenfalls gelöscht.`, [
          { text: "Abbrechen", style: "cancel" },
          { text: "Löschen", style: "destructive", onPress: doDelete },
        ]);
      } else {
        doDelete();
      }
    },
    [deleteEvent],
  );

  const handleDeletePartner = useCallback(
    (partnerId: Id<"partners">, name: string) => {
      const doDelete = async () => {
        try {
          await deletePartnerMut({ partnerId });
        } catch {
          if (Platform.OS !== "web") Alert.alert("Fehler", "Partner konnte nicht gelöscht werden");
        }
      };
      if (Platform.OS !== "web") {
        Alert.alert("Partner löschen", `"${name}" wirklich löschen?`, [
          { text: "Abbrechen", style: "cancel" },
          { text: "Löschen", style: "destructive", onPress: doDelete },
        ]);
      } else {
        doDelete();
      }
    },
    [deletePartnerMut],
  );

  const handleDeleteGroup = useCallback(
    (groupId: Id<"groups">, groupName: string) => {
      const doDelete = async () => {
        try {
          await deleteGroupMut({ groupId });
        } catch {
          if (Platform.OS !== "web") Alert.alert("Fehler", "Gruppe konnte nicht gelöscht werden");
        }
      };
      if (Platform.OS !== "web") {
        Alert.alert("Gruppe löschen", `"${groupName}" wirklich löschen? Alle Mitglieder und Nachrichten werden gelöscht.`, [
          { text: "Abbrechen", style: "cancel" },
          { text: "Löschen", style: "destructive", onPress: doDelete },
        ]);
      } else {
        doDelete();
      }
    },
    [deleteGroupMut],
  );

  const handleDeleteMemberEvent = useCallback(
    (eventId: Id<"memberEvents">, name: string) => {
      const doDelete = async () => {
        try {
          await deleteMemberEventMut({ eventId });
        } catch {
          if (Platform.OS !== "web") Alert.alert("Fehler", "Member Event konnte nicht gelöscht werden");
        }
      };
      if (Platform.OS !== "web") {
        Alert.alert("Member Event löschen", `"${name}" wirklich löschen? Alle Teilnehmer und die Event-Gruppe werden gelöscht.`, [
          { text: "Abbrechen", style: "cancel" },
          { text: "Löschen", style: "destructive", onPress: doDelete },
        ]);
      } else {
        doDelete();
      }
    },
    [deleteMemberEventMut],
  );

  const handleDeleteUser = useCallback(
    (userId: Id<"users">, userName: string, email: string) => {
      const doDelete = async () => {
        setDeletingUserId(userId);
        try {
          await deleteUserMut({ userId });
        } catch {
          if (Platform.OS !== "web") Alert.alert("Fehler", "Nutzer konnte nicht gelöscht werden");
        } finally {
          setDeletingUserId(null);
        }
      };
      if (Platform.OS !== "web") {
        Alert.alert(
          "Profil löschen",
          `"${userName}" (${email}) wirklich löschen?\n\n• Alle Daten werden gelöscht\n• Stripe-Abo wird gekündigt\n• E-Mail-Benachrichtigung wird versendet`,
          [
            { text: "Abbrechen", style: "cancel" },
            { text: "Profil löschen", style: "destructive", onPress: doDelete },
          ],
        );
      } else {
        doDelete();
      }
    },
    [deleteUserMut],
  );

  const handleExportCSV = useCallback(async () => {
    if (!users || users.length === 0) return;
    setExportingCSV(true);
    try {
      const BOM = "\uFEFF";
      const header = "Name;E-Mail;Rolle;Abo-Status;Registriert;Zuletzt aktiv";
      const rows = users.map((u: AdminUser) => {
        const registered = new Date(u.createdAt).toLocaleDateString("de-DE");
        const lastActive = u.lastActiveAt
          ? new Date(u.lastActiveAt).toLocaleDateString("de-DE")
          : "\u2013";
        const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
        return [
          escapeCsv(u.name),
          escapeCsv(u.email),
          u.role === "admin" ? "Admin" : "Nutzer",
          u.subscriptionStatus === "active"
            ? "Aktiv"
            : u.subscriptionStatus === "canceled"
              ? "Gekündigt"
              : u.subscriptionStatus === "expired"
                ? "Abgelaufen"
                : "Kein Abo",
          registered,
          lastActive,
        ].join(";");
      });
      const csv = BOM + header + "\n" + rows.join("\n");

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `z-nutzer-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const fileUri =
          FileSystem.cacheDirectory +
          `z-nutzer-${new Date().toISOString().slice(0, 10)}.csv`;
        await FileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch {
      if (Platform.OS !== "web")
        Alert.alert("Fehler", "CSV konnte nicht exportiert werden.");
    } finally {
      setExportingCSV(false);
    }
  }, [users]);

  if (!stats) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.black} />
      </View>
    );
  }

  /* chart data */
  const postChartData = stats.postsByDay.map((d: DayStats) => d.photos + d.videos);
  const postChartLabels = stats.postsByDay.map((d: DayStats) => d.label);
  const userChartData = stats.userGrowthByDay.map((d: GrowthDay) => d.count);
  const userChartLabels = stats.userGrowthByDay.map((d: GrowthDay) => d.label);

  const barData = stats.postsByDay.map((d: DayStats) => ({
    label: d.label,
    value: d.photos + d.videos,
  }));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerLogo}>
            <Text style={styles.headerLogoText}>Z</Text>
          </View>
          <Text style={styles.headerTitle}>Admin</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Announcement Manager ────────────────── */}
        <Card title="Announcement" icon="exclamationmark.circle.fill">
          {currentAnnouncement ? (
            <View>
              <View style={styles.annLiveBanner}>
                <View style={styles.annLiveDot} />
                <Text style={styles.annLiveLabel}>LIVE</Text>
              </View>
              <Text style={styles.annCurrentText}>{currentAnnouncement.text}</Text>
              <View style={styles.annActions}>
                <TouchableOpacity
                  style={styles.annEditBtn}
                  onPress={() => {
                    setAnnounceDraft(currentAnnouncement.text);
                    setAnnounceEditing(true);
                  }}
                  activeOpacity={0.7}
                >
                  <SymbolView name="pencil" size={13} tintColor={colors.gray600} />
                  <Text style={styles.annEditText}>Bearbeiten</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.annEditBtn, styles.annDeleteBtn]}
                  onPress={handleAnnounceDelete}
                  activeOpacity={0.7}
                >
                  <SymbolView name="trash" size={13} tintColor={colors.danger} />
                  <Text style={[styles.annEditText, { color: colors.danger }]}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.annEmpty}>
              <SymbolView name="exclamationmark.circle" size={28} tintColor={colors.gray300} />
              <Text style={styles.annEmptyText}>Kein aktives Announcement</Text>
            </View>
          )}

          {(announceEditing || !currentAnnouncement) && (
            <View style={styles.annInputWrap}>
              <TextInput
                style={styles.annInput}
                value={announceDraft}
                onChangeText={setAnnounceDraft}
                placeholder="z.B. NEUES EVENT STEHT BEVOR!"
                placeholderTextColor={colors.gray300}
                multiline
                maxLength={120}
              />
              <View style={styles.annInputActions}>
                <Text style={styles.annCharCount}>{announceDraft.length}/120</Text>
                <TouchableOpacity
                  style={[
                    styles.annPostBtn,
                    (!announceDraft.trim() || announceSaving) && { opacity: 0.4 },
                  ]}
                  onPress={handleAnnounceSave}
                  disabled={!announceDraft.trim() || announceSaving}
                  activeOpacity={0.7}
                >
                  {announceSaving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.annPostBtnText}>
                      {announceEditing ? "Aktualisieren" : "Posten"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Card>

        {/* ── KPI Row ─────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll}>
          <KPI
            icon="person.2.fill"
            label="Mitglieder"
            value={stats.totalMembers}
            sub={`+${stats.newMembersWeek} diese Woche`}
            iconBg={colors.black}
          />
          <KPI
            icon="creditcard.fill"
            label="Aktive Abos"
            value={stats.activeSubscriptions}
            sub={`${stats.canceledSubscriptions} gekündigt`}
            iconBg="#6366F1"
          />
          <KPI
            icon="bolt.fill"
            label="Aktiv heute"
            value={stats.activeToday}
            sub={`${stats.activeWeek} diese Woche`}
            iconBg={colors.success}
          />
          <KPI
            icon="doc.text.fill"
            label="Beiträge"
            value={stats.totalPosts}
            iconBg="#F59E0B"
          />
          <KPI
            icon="person.3.fill"
            label="Gruppen"
            value={stats.totalGroups}
            iconBg="#EC4899"
          />
        </ScrollView>

        {/* ── Gemeldete Beitraege ─────────────────── */}
        <Card title="Gemeldete Beitraege" icon="exclamationmark.triangle.fill">
          {reports === undefined ? (
            <ActivityIndicator color={colors.gray300} />
          ) : reports.length === 0 ? (
            <View style={styles.emptyReports}>
              <SymbolView name="checkmark.shield" size={24} tintColor={colors.gray300} />
              <Text style={styles.emptyReportsText}>Keine offenen Meldungen</Text>
            </View>
          ) : (
            reports.map((r: AdminReport) => (
              <View key={r._id} style={styles.reportCard}>
                <View style={styles.reportCardHeader}>
                  <Text style={styles.reportCardAuthor}>{r.postAuthorName}</Text>
                  <Text style={styles.reportCardType}>{r.postType === "video" ? "Video" : "Foto"}</Text>
                </View>
                {r.postCaption ? (
                  <Text style={styles.reportCardCaption} numberOfLines={2}>{r.postCaption}</Text>
                ) : null}
                <View style={styles.reportCardReason}>
                  <SymbolView name="flag.fill" size={12} tintColor={"#FF3B30"} />
                  <Text style={styles.reportCardReasonText}>{r.reason}</Text>
                </View>
                <Text style={styles.reportCardReporter}>Gemeldet von: {r.reporterName}</Text>
                <View style={styles.reportCardActions}>
                  <TouchableOpacity
                    style={styles.reportDismissBtn}
                    onPress={() => resolveReport({ reportId: r._id, action: "dismiss" })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reportDismissText}>Ablehnen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.reportRemoveBtn}
                    onPress={() => {
                      Alert.alert(
                        "Beitrag loeschen?",
                        "Der Beitrag wird unwiderruflich geloescht.",
                        [
                          { text: "Abbrechen", style: "cancel" },
                          { text: "Loeschen", style: "destructive", onPress: () => resolveReport({ reportId: r._id, action: "remove" }) },
                        ],
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reportRemoveText}>Loeschen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* ── Abo-Einnahmen ───────────────────────── */}
        <Card title="Abo-Einnahmen" icon="creditcard">
          <View style={styles.revenueHighlight}>
            <Text style={styles.revenueAmount}>
              {stats.subscriptionRevenueMonthly.toFixed(2).replace(".", ",")} €
            </Text>
            <Text style={styles.revenuePeriod}>monatlich</Text>
          </View>
          <RevenueRow
            label="Abo-Preis"
            amount={`${ABO_PRICE} € / Monat`}
          />
          <RevenueRow
            label="Aktive Abonnenten"
            amount={`${stats.activeSubscriptions}`}
          />
          <RevenueRow
            label="Geschätzt gesamt"
            amount={`${stats.subscriptionRevenueTotal.toFixed(2).replace(".", ",")} €`}
            accent
          />
        </Card>

        {/* ── Nutzeraktivität Chart ───────────────── */}
        <Card title="Neue Nutzer (7 Tage)" icon="person.badge.plus">
          <MiniLineChart
            data={userChartData}
            labels={userChartLabels}
            color="#6366F1"
            height={140}
          />
          <View style={styles.chartLegend}>
            <Text style={styles.chartLegendText}>
              +{stats.newMembersWeek} diese Woche · +{stats.newMembersMonth} diesen Monat
            </Text>
          </View>
        </Card>

        {/* ── Beiträge Chart ─────────────────────── */}
        <Card title="Beiträge (7 Tage)" icon="chart.bar">
          <MiniBarChart data={barData} height={120} barColor={colors.black} />
          <View style={styles.chartLegend}>
            <View style={styles.legendDot} />
            <Text style={styles.chartLegendText}>
              Fotos + Videos pro Tag
            </Text>
          </View>
        </Card>

        {/* ── Aktivität Detail ───────────────────── */}
        <Card title="Content Übersicht" icon="photo.on.rectangle">
          <View style={styles.contentGrid}>
            <View style={styles.contentCell}>
              <Text style={styles.contentCellTitle}>Fotos</Text>
              <View style={styles.contentRow}>
                <Text style={styles.contentNum}>{stats.photosToday}</Text>
                <Text style={styles.contentPeriod}>heute</Text>
              </View>
              <View style={styles.contentRow}>
                <Text style={styles.contentNum}>{stats.photosWeek}</Text>
                <Text style={styles.contentPeriod}>Woche</Text>
              </View>
              <View style={styles.contentRow}>
                <Text style={styles.contentNum}>{stats.photosMonth}</Text>
                <Text style={styles.contentPeriod}>Monat</Text>
              </View>
            </View>
            <View style={styles.contentDivider} />
            <View style={styles.contentCell}>
              <Text style={styles.contentCellTitle}>Videos</Text>
              <View style={styles.contentRow}>
                <Text style={styles.contentNum}>{stats.videosToday}</Text>
                <Text style={styles.contentPeriod}>heute</Text>
              </View>
              <View style={styles.contentRow}>
                <Text style={styles.contentNum}>{stats.videosWeek}</Text>
                <Text style={styles.contentPeriod}>Woche</Text>
              </View>
              <View style={styles.contentRow}>
                <Text style={styles.contentNum}>{stats.videosMonth}</Text>
                <Text style={styles.contentPeriod}>Monat</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* ── Posts Trend Line ──────────────────── */}
        <Card title="Post-Trend (7 Tage)" icon="chart.xyaxis.line">
          <MiniLineChart
            data={postChartData}
            labels={postChartLabels}
            color={colors.black}
            height={140}
          />
        </Card>

        {/* ── Events ─────────────────────────────── */}
        <Card
          title="Events"
          icon="calendar"
          action={
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.navigate("/(main)/admin-event-form" as "/")}
              activeOpacity={0.7}
            >
              <SymbolView name="plus" size={14} tintColor={colors.white} />
            </TouchableOpacity>
          }
        >
          {!events ? (
            <ActivityIndicator size="small" color={colors.gray400} />
          ) : events.length === 0 ? (
            <View style={styles.emptyEvents}>
              <SymbolView name="calendar" size={28} tintColor={colors.gray300} />
              <Text style={styles.emptyText}>Noch keine Events</Text>
            </View>
          ) : (
            events.map((ev: AdminEvent) => (
              <EventRow
                key={ev._id}
                event={ev}
                expanded={expandedId === ev._id}
                onToggle={() => setExpandedId((prev: string | null) => (prev === ev._id ? null : ev._id))}
                onEdit={() => router.navigate(`/(main)/admin-event-form?eventId=${ev._id}` as "/")}
                onDelete={() => handleDelete(ev._id, ev.name)}
                onToggleHidden={() => {
                  toggleEventInfoHidden({ eventId: ev._id }).catch(() => {});
                }}
              />
            ))
          )}
        </Card>

        {/* ── Z Partner ──────────────────────────────────────── */}
        <Card
          title="Z Partner"
          icon="building.2"
          action={
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.navigate("/(main)/admin-partner-form" as "/")}
              activeOpacity={0.7}
            >
              <SymbolView name="plus" size={14} tintColor={colors.white} />
            </TouchableOpacity>
          }
        >
          {!partners ? (
            <ActivityIndicator size="small" color={colors.gray400} />
          ) : partners.length === 0 ? (
            <View style={styles.emptyEvents}>
              <SymbolView name="building.2" size={28} tintColor={colors.gray300} />
              <Text style={styles.emptyText}>Noch keine Partner</Text>
            </View>
          ) : (
            partners.map((p: AdminPartner) => (
              <View key={p._id} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventName}>{p.businessName}</Text>
                    <Text style={styles.eventMeta}>
                      {p.city || "Kein Ort"} · {p.status === "active" ? "Aktiv" : "Inaktiv"}
                    </Text>
                  </View>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>
                      {p.status === "active" ? "✓ Live" : "Inaktiv"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.eventExpanded, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray200 }]}>
                  <View style={styles.eventActions}>
                    <TouchableOpacity
                      onPress={() => router.navigate(`/(main)/admin-partner-form?partnerId=${p._id}` as "/")}
                      style={styles.eventActionBtn}
                    >
                      <SymbolView name="pencil" size={13} tintColor={colors.gray600} />
                      <Text style={styles.eventActionText}>Bearbeiten</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePartner(p._id, p.businessName)}
                      style={[styles.eventActionBtn, styles.eventDeleteBtn]}
                    >
                      <SymbolView name="trash" size={13} tintColor={colors.danger} />
                      <Text style={[styles.eventActionText, { color: colors.danger }]}>Löschen</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* ── Gruppen ──────────────────────────────────────────── */}
        <Card title="Gruppen" icon="person.3">
          {!groups ? (
            <ActivityIndicator size="small" color={colors.gray400} />
          ) : groups.length === 0 ? (
            <View style={styles.emptyEvents}>
              <SymbolView name="person.3" size={28} tintColor={colors.gray300} />
              <Text style={styles.emptyText}>Noch keine Gruppen</Text>
            </View>
          ) : (
            groups.map((g: AdminGroup) => (
              <View key={g._id} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventName}>{g.name}</Text>
                    <Text style={styles.eventMeta}>
                      {g.memberCount} Mitglieder · {g.city || "Kein Ort"} · von {g.creatorName}
                    </Text>
                  </View>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>
                      {g.visibility === "public" ? "Öffentlich" : g.visibility === "invite_only" ? "Einladung" : "Anfrage"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.eventExpanded, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray200 }]}>
                  <View style={styles.eventActions}>
                    <TouchableOpacity
                      onPress={() => handleTogglePin(g)}
                      style={[styles.eventActionBtn, g.pinnedAt ? { backgroundColor: colors.black } : null]}
                    >
                      <SymbolView name={g.pinnedAt ? "pin.slash" : "pin"} size={13} tintColor={g.pinnedAt ? colors.white : colors.gray600} />
                      <Text style={[styles.eventActionText, g.pinnedAt ? { color: colors.white } : null]}>
                        {g.pinnedAt ? "Angepinnt" : "Anpinnen"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => router.navigate(`/(main)/admin-group-form?groupId=${g._id}` as "/")}
                      style={styles.eventActionBtn}
                    >
                      <SymbolView name="pencil" size={13} tintColor={colors.gray600} />
                      <Text style={styles.eventActionText}>Bearbeiten</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteGroup(g._id, g.name)}
                      style={[styles.eventActionBtn, styles.eventDeleteBtn]}
                    >
                      <SymbolView name="trash" size={13} tintColor={colors.danger} />
                      <Text style={[styles.eventActionText, { color: colors.danger }]}>Löschen</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* ── Member Events ───────────────────────────────────────── */}
        <Card title="Member Events" icon="calendar.badge.plus">
          {!memberEvents ? (
            <ActivityIndicator size="small" color={colors.gray400} />
          ) : memberEvents.length === 0 ? (
            <View style={styles.emptyEvents}>
              <SymbolView name="calendar" size={28} tintColor={colors.gray300} />
              <Text style={styles.emptyText}>Noch keine Member Events</Text>
            </View>
          ) : (
            memberEvents.map((me: AdminMemberEvent) => (
              <View key={me._id} style={styles.eventCard}>
                <TouchableOpacity
                  onPress={() => setExpandedMemberEventId((prev: string | null) => (prev === me._id ? null : me._id))}
                  activeOpacity={0.7}
                  style={styles.eventHeader}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventName}>{me.name}</Text>
                    <Text style={styles.eventMeta}>
                      {me.date} · {me.city} · {me.venue} · von {me.creatorName}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {me.attendeeCount}{me.maxAttendees ? `/${me.maxAttendees}` : ""} Teilnehmer
                    </Text>
                  </View>
                  <View style={[styles.eventBadge, me.status === "canceled" && { backgroundColor: "rgba(255,59,48,0.06)" }]}>
                    <Text style={[styles.eventBadgeText, me.status === "canceled" && { color: colors.danger }]}>
                      {me.status === "upcoming" ? "Geplant" : me.status === "ongoing" ? "Laufend" : me.status === "canceled" ? "Abgesagt" : "Abgeschlossen"}
                    </Text>
                  </View>
                  <SymbolView
                    name={expandedMemberEventId === me._id ? "chevron.up" : "chevron.down"}
                    size={13}
                    tintColor={colors.gray400}
                  />
                </TouchableOpacity>
                {expandedMemberEventId === me._id && (
                  <View style={[styles.eventExpanded, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray200 }]}>
                    <View style={styles.eventActions}>
                      <TouchableOpacity
                        onPress={() => router.navigate(`/(main)/edit-member-event?id=${me._id}` as "/")}
                        style={styles.eventActionBtn}
                      >
                        <SymbolView name="pencil" size={13} tintColor={colors.gray600} />
                        <Text style={styles.eventActionText}>Bearbeiten</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteMemberEvent(me._id, me.name)}
                        style={[styles.eventActionBtn, styles.eventDeleteBtn]}
                      >
                        <SymbolView name="trash" size={13} tintColor={colors.danger} />
                        <Text style={[styles.eventActionText, { color: colors.danger }]}>Löschen</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </Card>

        {/* \u2500\u2500 Nutzer-Verwaltung \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <Card
          title="Nutzer"
          icon="person.2"
          action={
            <TouchableOpacity
              style={[styles.csvExportBtn, (exportingCSV || !users || users.length === 0) && { opacity: 0.4 }]}
              onPress={handleExportCSV}
              activeOpacity={0.7}
              disabled={exportingCSV || !users || users.length === 0}
            >
              {exportingCSV ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <SymbolView name="arrow.down.doc" size={13} tintColor={colors.white} />
                  <Text style={styles.csvExportText}>CSV</Text>
                </>
              )}
            </TouchableOpacity>
          }
        >
          {!users ? (
            <ActivityIndicator size="small" color={colors.gray400} />
          ) : (
            <>
              <View style={styles.userSearchWrap}>
                <SymbolView name="magnifyingglass" size={14} tintColor={colors.gray400} />
                <TextInput
                  style={styles.userSearchInput}
                  placeholder="Nutzer suchen..."
                  placeholderTextColor={colors.gray300}
                  value={userSearch}
                  onChangeText={setUserSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {userSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setUserSearch("")} hitSlop={8}>
                    <SymbolView name="xmark.circle.fill" size={16} tintColor={colors.gray300} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.userCountLabel}>{users.length} Nutzer insgesamt</Text>
              {users
                .filter((u: AdminUser) => {
                  if (!userSearch.trim()) return true;
                  const q = userSearch.toLowerCase();
                  return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                })
                .map((u: AdminUser) => (
                  <View key={u._id} style={styles.userRow}>
                    <View style={styles.userInfo}>
                      <View style={styles.userNameRow}>
                        <Text style={styles.userName}>{u.name}</Text>
                        {u.role === "admin" && (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>Admin</Text>
                          </View>
                        )}
                        <View style={[
                          styles.subBadge,
                          u.subscriptionStatus === "active" && styles.subBadgeActive,
                          u.subscriptionStatus === "canceled" && styles.subBadgeCanceled,
                        ]}>
                          <Text style={[
                            styles.subBadgeText,
                            u.subscriptionStatus === "active" && styles.subBadgeTextActive,
                            u.subscriptionStatus === "canceled" && styles.subBadgeTextCanceled,
                          ]}>
                            {u.subscriptionStatus === "active" ? "Abo aktiv" : u.subscriptionStatus === "canceled" ? "Gekündigt" : u.subscriptionStatus === "expired" ? "Abgelaufen" : "Kein Abo"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.userEmail}>{u.email}</Text>
                      <Text style={styles.userMeta}>
                        Registriert: {new Date(u.createdAt).toLocaleDateString("de-DE")}
                        {u.lastActiveAt ? ` \u00b7 Aktiv: ${new Date(u.lastActiveAt).toLocaleDateString("de-DE")}` : ""}
                      </Text>
                    </View>
                    {u.role !== "admin" && (
                      <TouchableOpacity
                        style={styles.userDeleteBtn}
                        onPress={() => handleDeleteUser(u._id, u.name, u.email)}
                        activeOpacity={0.7}
                        disabled={deletingUserId === u._id}
                      >
                        {deletingUserId === u._id ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <SymbolView name="trash" size={14} tintColor={colors.danger} />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
            </>
          )}
        </Card>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Styles ───────────────────────────────────────────── */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.gray50 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.gray50 },

  /* header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLogo: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  headerLogoText: { fontSize: 14, fontWeight: "800", color: colors.white },
  headerTitle: { fontSize: 17, fontWeight: "600", color: colors.black },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  /* KPI horizontal row */
  kpiScroll: { marginBottom: spacing.lg },
  kpiCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginRight: spacing.sm,
    width: 140,
    borderCurve: "continuous",
    ...shadows.sm,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderCurve: "continuous",
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.black,
    fontVariant: ["tabular-nums"],
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.gray500,
    fontWeight: "500",
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: colors.gray400,
    marginTop: 4,
  },

  /* card */
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderCurve: "continuous",
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.black,
  },

  /* revenue highlight */
  revenueHighlight: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  revenueAmount: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.black,
    fontVariant: ["tabular-nums"],
  },
  revenuePeriod: {
    fontSize: 13,
    color: colors.gray400,
    fontWeight: "500",
    marginTop: 4,
  },

  /* chart legend */
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.black,
  },
  chartLegendText: {
    fontSize: 12,
    color: colors.gray400,
    fontWeight: "500",
  },

  /* content grid */
  contentGrid: {
    flexDirection: "row",
    gap: 0,
  },
  contentCell: {
    flex: 1,
    paddingHorizontal: 8,
  },
  contentDivider: {
    width: 1,
    backgroundColor: colors.gray100,
  },
  contentCellTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  contentNum: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.black,
    fontVariant: ["tabular-nums"],
  },
  contentPeriod: {
    fontSize: 12,
    color: colors.gray400,
    fontWeight: "500",
  },

  /* events */
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  eventCard: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  eventName: { fontSize: 14, fontWeight: "600", color: colors.black },
  eventMeta: { fontSize: 12, color: colors.gray500, marginTop: 2 },
  eventBadge: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  eventBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray700,
    fontVariant: ["tabular-nums"],
  },
  eventExpanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray200,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  eventActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  eventActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.gray50,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  eventDeleteBtn: {
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  eventActionText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray600,
  },
  eventHiddenActiveBtn: {
    backgroundColor: colors.black,
  },
  hiddenIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  eventInfoRow: {
    fontSize: 13,
    color: colors.gray600,
    marginBottom: spacing.md,
  },

  emptyEvents: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray400,
  },

  /* announcement manager */
  annLiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  annLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  annLiveLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
    letterSpacing: 0.5,
  },
  annCurrentText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.black,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  annActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  annEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.gray50,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  annDeleteBtn: {
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  annEditText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray600,
  },
  annEmpty: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  annEmptyText: {
    fontSize: 14,
    color: colors.gray400,
  },
  annInputWrap: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray100,
    paddingTop: spacing.md,
  },
  annInput: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.black,
    minHeight: 60,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.gray100,
    borderCurve: "continuous",
  },
  annInputActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  annCharCount: {
    fontSize: 12,
    color: colors.gray400,
    fontVariant: ["tabular-nums"],
  },
  annPostBtn: {
    backgroundColor: colors.black,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderCurve: "continuous",
  },
  annPostBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.white,
  },
  loadMoreInlineBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  loadMoreInlineText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.black,
  },
  miniStatsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  },
  miniStat: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray500,
  },
  buyerBadges: {
    flexDirection: "row",
    gap: 4,
  },

  /* blur toggles */
  blurSection: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray200,
    paddingTop: spacing.md,
  },
  blurHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  blurTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray500,
  },
  blurRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  blurLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray700,
  },

  /* reports */
  emptyReports: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyReportsText: {
    fontSize: 14,
    color: colors.gray400,
  },
  /* user management */
  csvExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.black,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderCurve: "continuous",
  },
  csvExportText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 0.3,
  },
  userSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
    borderCurve: "continuous",
  },
  userSearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.black,
    padding: 0,
  },
  userCountLabel: {
    fontSize: 12,
    color: colors.gray400,
    fontWeight: "500",
    marginBottom: spacing.md,
    fontVariant: ["tabular-nums"],
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray100,
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.black,
  },
  userEmail: {
    fontSize: 13,
    color: colors.gray500,
    marginTop: 2,
  },
  userMeta: {
    fontSize: 12,
    color: colors.gray400,
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: colors.black,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.white,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subBadge: {
    backgroundColor: colors.gray100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subBadgeActive: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  subBadgeCanceled: {
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  subBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.gray500,
  },
  subBadgeTextActive: {
    color: colors.success,
  },
  subBadgeTextCanceled: {
    color: colors.danger,
  },
  userDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  reportCard: {
    backgroundColor: colors.gray100,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 8,
    borderCurve: "continuous",
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportCardAuthor: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.black,
  },
  reportCardType: {
    fontSize: 12,
    color: colors.gray400,
    fontWeight: "500",
  },
  reportCardCaption: {
    fontSize: 13,
    color: colors.gray600,
    lineHeight: 18,
  },
  reportCardReason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reportCardReasonText: {
    fontSize: 13,
    color: "#DC2626",
    flex: 1,
  },
  reportCardReporter: {
    fontSize: 12,
    color: colors.gray400,
  },
  reportCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  reportDismissBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray300,
  },
  reportDismissText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.black,
  },
  reportRemoveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FF3B30",
    alignItems: "center",
  },
  reportRemoveText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.white,
  },
});
