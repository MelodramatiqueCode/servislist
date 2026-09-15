export const COOLING_ARM_FREQ_KEY = "BALENA_HOST_CONFIG_arm_freq";
export const COOLING_GPU_FREQ_KEY = "BALENA_HOST_CONFIG_gpu_freq";

export const COOLING_CONFIG_KEYS = [
  COOLING_ARM_FREQ_KEY,
  COOLING_GPU_FREQ_KEY,
] as const;

export type CoolingProfile = {
  armFreq: string;
  gpuFreq: string;
  label: string;
};

export type CoolingConfigVar = {
  name: string;
  value: string;
};

export function coolingProfileForDeviceType(
  deviceType: string,
): CoolingProfile | null {
  const type = deviceType.toLowerCase();
  if (type.includes("raspberrypi4") || type.includes("raspberry-pi4")) {
    return { armFreq: "1200", gpuFreq: "500", label: "Raspberry Pi 4" };
  }
  if (type.includes("raspberrypi3") || type.includes("raspberry-pi3")) {
    return { armFreq: "900", gpuFreq: "300", label: "Raspberry Pi 3" };
  }
  return null;
}

export function coolingConfigEntries(
  profile: CoolingProfile,
): Record<string, string> {
  return {
    [COOLING_ARM_FREQ_KEY]: profile.armFreq,
    [COOLING_GPU_FREQ_KEY]: profile.gpuFreq,
  };
}

export function isCoolingModeActive(
  vars: CoolingConfigVar[],
  profile: CoolingProfile,
): boolean {
  const byName = new Map(vars.map((item) => [item.name, item.value]));
  return (
    byName.get(COOLING_ARM_FREQ_KEY) === profile.armFreq &&
    byName.get(COOLING_GPU_FREQ_KEY) === profile.gpuFreq
  );
}

export function hasCoolingOverrides(vars: CoolingConfigVar[]): boolean {
  return vars.some(
    (item) =>
      item.name === COOLING_ARM_FREQ_KEY || item.name === COOLING_GPU_FREQ_KEY,
  );
}
