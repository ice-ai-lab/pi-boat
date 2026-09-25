import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 页内通知 + 完成提示音（F5；ADR-0016：**不做** Web Push，只做页面存活期的通知）。
 * 声音默认关（首次用户手势后解锁 AudioContext；播放失败静默）。
 */
const SOUND_KEY = 'piboat:sound-enabled';

export function useCompletionSignal() {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(SOUND_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const audioRef = useRef<AudioContext | null>(null);

  const toggleSound = useCallback(() => {
    setSoundEnabled((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SOUND_KEY, String(next));
      } catch {
        // best-effort
      }
      return next;
    });
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission().catch(() => 'denied' as const);
    setPermission(result);
  }, []);

  /** 一轮跑完（agent_settled）时调用：响铃 + （页面在后台时）系统通知 */
  const notifyDone = useCallback(
    (title: string, body: string) => {
      if (soundEnabled) {
        try {
          audioRef.current ??= new AudioContext();
          const context = audioRef.current;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 660;
          gain.gain.value = 0.04;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.12);
        } catch {
          // 音频不可用：静默
        }
      }
      if (permission === 'granted' && document.visibilityState === 'hidden') {
        try {
          new Notification(title, { body });
        } catch {
          // 通知构造失败（权限/平台差异）：静默
        }
      }
    },
    [soundEnabled, permission],
  );

  return { soundEnabled, toggleSound, notifyDone, permission, requestNotificationPermission };
}

/** 页面标题反映运行中状态（后台标签页也能看出结束） */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
