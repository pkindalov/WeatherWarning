/* ============================================================
   notify.ts — notifications, vibration, alarm sound, service worker
   Ported from the original vanilla `Notify` namespace.
   ============================================================ */
import type { Level } from "../../shared/types";

let swReg: ServiceWorkerRegistration | null = null;
let audioCtx: AudioContext | null = null;

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register("/sw.js");
    return swReg;
  } catch {
    return null;
  }
}

export function permission(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function show(title: string, body: string, tag?: string) {
  if (permission() !== "granted") return;
  const opts: NotificationOptions = {
    body,
    tag: tag || "ww-alert",
    badge: "/icon.png",
    icon: "/icon.png",
    requireInteraction: true,
    // `renotify` is valid for SW notifications but not in the lib's base type
    ...({ renotify: true } as object),
  };
  try {
    if (swReg && swReg.showNotification) {
      await swReg.showNotification(title, opts);
    } else {
      new Notification(title, opts);
    }
  } catch {
    try {
      new Notification(title, opts);
    } catch {
      /* ignore */
    }
  }
}

export function vibrate(pattern?: number[]) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern || [220, 90, 220, 90, 400]);
    } catch {
      /* ignore */
    }
  }
}

/* ---------- alarm sound via WebAudio (no asset needed) ---------- */
function ensureAudio(): AudioContext | null {
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

export function unlockAudio() {
  ensureAudio();
}

export function alarm(level: Level) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const beeps = level === "danger" ? 4 : 2;
  const freq = level === "danger" ? 880 : 660;
  for (let i = 0; i < beeps; i++) {
    const t = now + i * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.setValueAtTime(freq * 1.18, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }
}
