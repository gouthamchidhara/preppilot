// Badge + daily reminder, via expo-notifications. The web app decides the
// numbers and the words; this module only talks to the OS. The nudge copy
// lives in web/content/nudges.json and is bundled with the web app — the
// native side receives the already-rotated title and body from the bridge.
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export async function notificationsGranted(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).status === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
}

export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
}

const DAILY_ID = 'preppilot-daily';
let lastDaily: { title: string; body: string } | null = null;

// One daily notification, ~8 AM local. Replaces (never stacks) the previous
// one. Only schedules when permission is already granted — this never
// prompts on its own; the prompt comes from promptDailyReminder().
export async function scheduleDailyReminder(title: string, body: string): Promise<void> {
  lastDaily = { title, body };
  if (!(await notificationsGranted())) return;
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 8, minute: 0 },
  });
}

// Ask once, at a sensible moment (the web side calls this after the first
// finished flashcard round). If granted, schedules the latest daily
// reminder right away so tomorrow morning is covered.
export async function promptDailyReminder(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (granted && lastDaily) await scheduleDailyReminder(lastDaily.title, lastDaily.body);
  return granted;
}

// A week of different reminders at fixed times (one-off triggers). Replaces the single repeating
// daily reminder, so mornings never show the same line twice.
const WEEK_PREFIX = 'preppilot-week-';
export async function scheduleWeek(items: { at: number; title: string; body: string }[]): Promise<void> {
  if (!(await notificationsGranted())) return;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(all.filter(n => n.identifier.startsWith(WEEK_PREFIX) || n.identifier === DAILY_ID)
    .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  for (const [i, it] of items.slice(0, 10).entries()) {
    if (!(it.at > Date.now())) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: WEEK_PREFIX + i,
      content: { title: it.title, body: it.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(it.at) },
    }).catch(() => {});
  }
}
