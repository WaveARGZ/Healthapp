import { useEffect, useRef, useState } from "react";
import { changeRestPushSchedule, prepareRestPush, type RestPushChannel } from "@/lib/workouts/workout-timer-notifications";

export function useWorkoutRestPush() {
  const [channel, setChannel] = useState<RestPushChannel | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "scheduled" | "error">("idle");
  const subscription = useRef<PushSubscription | null>(null);
  const update = useRef(0);

  useEffect(() => {
    let active = true;
    void prepareRestPush().then(async (setup) => {
      if (!active || !setup) return;
      const existing = await setup.manager.getSubscription();
      if (!active) return;
      subscription.current = existing;
      setSubscribed(Boolean(existing));
      setChannel(setup);
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);

  async function enable() {
    if (!channel) return false;
    try {
      // Call subscribe directly from the button's user activation.
      subscription.current = await channel.manager.subscribe({ userVisibleOnly: true, applicationServerKey: channel.applicationServerKey });
      setSubscribed(true);
      setStatus("idle");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }

  function schedule(startedAt: number, endsAt: number) {
    if (!subscription.current || Notification.permission !== "granted") return;
    const revision = ++update.current;
    setStatus("pending");
    void changeRestPushSchedule(startedAt, { endsAt, subscription: subscription.current }).then(
      () => { if (revision === update.current) setStatus("scheduled"); },
      () => { if (revision === update.current) setStatus("error"); },
    );
  }

  function cancel(startedAt: number) {
    if (!subscription.current) return;
    const revision = ++update.current;
    setStatus("idle");
    void changeRestPushSchedule(startedAt).catch(() => { if (revision === update.current) setStatus("error"); });
  }

  return { available: Boolean(channel), subscribed, status, enable, schedule, cancel };
}
