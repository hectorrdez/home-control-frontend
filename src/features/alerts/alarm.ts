// Feature 129: looped Web Audio beep for HIGH alerts (no asset). The context comes from a user gesture
// (the ENABLE ALERT SOUND control); the loop stops on stop() or after ALARM_MAX_MS, whichever comes first.
export const ALARM_MAX_MS = 30_000;
export const BEEP_PERIOD_MS = 700;
export const BEEP_MS = 250;
const BEEP_HZ = 880;
const BEEP_GAIN = 0.2;

export interface Alarm {
  start: () => void;
  stop: () => void;
}

export type AlarmContext = Pick<AudioContext, "currentTime" | "destination" | "createOscillator" | "createGain">;

export function createAlarm(ctx: AlarmContext): Alarm {
  let beeper: ReturnType<typeof setInterval> | undefined;
  let limit: ReturnType<typeof setTimeout> | undefined;

  function beep() {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    osc.type = "square";
    osc.frequency.value = BEEP_HZ;
    gain.gain.setValueAtTime(BEEP_GAIN, start);
    gain.gain.setValueAtTime(0, start + BEEP_MS / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + BEEP_MS / 1000);
  }

  function stop() {
    if (beeper !== undefined) clearInterval(beeper);
    if (limit !== undefined) clearTimeout(limit);
    beeper = undefined;
    limit = undefined;
  }

  return {
    start() {
      if (beeper !== undefined) return;
      beep();
      beeper = setInterval(beep, BEEP_PERIOD_MS);
      limit = setTimeout(stop, ALARM_MAX_MS);
    },
    stop,
  };
}
