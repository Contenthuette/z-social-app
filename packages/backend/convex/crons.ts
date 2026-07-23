import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh analytics snapshots",
  { hours: 6 },
  internal.admin.refreshAnalyticsSnapshotInternal,
  {},
);

crons.interval(
  "cleanup stale calls",
  { minutes: 2 },
  internal.calls.cleanupStaleCalls,
  {},
);

crons.interval(
  "cleanup stale livestreams",
  { minutes: 1 },
  internal.livestreams.cleanupStaleLivestreams,
  {},
);

crons.interval(
  "delete expired polls",
  { hours: 1 },
  internal.polls.deleteExpiredPolls,
  {},
);

crons.interval(
  "gdpr cleanup old operational data",
  { hours: 6 },
  internal.retention.cleanupOldOperationalData,
  {},
);

crons.interval(
  "gdpr cleanup old notifications",
  { hours: 12 },
  internal.retention.cleanupOldNotifications,
  {},
);

crons.interval(
  "gdpr purge expired moderation data",
  { hours: 24 },
  internal.retention.purgeExpiredModerationData,
  {},
);

crons.interval(
  "gdpr cleanup inactive accounts",
  { hours: 24 },
  internal.retention.cleanupInactiveAccounts,
  {},
);

export default crons;
