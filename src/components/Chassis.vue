<script setup>
defineProps({
  state: { type: String, default: 'off' },
  size: { type: String, default: 'sm' },
  chainHue: { type: [Number, String], default: undefined },
  large: { type: Boolean, default: false },
  label: { type: String, default: '' },
});
</script>
<template>
  <span
    class="chassis"
    :class="[state, 'sz-'+size, { lg: large }]"
    :style="chainHue !== undefined && chainHue !== null ? { '--chain-h': chainHue } : undefined"
    role="img"
    :aria-label="label || state"
  >
    <i class="ch-body" aria-hidden="true"></i>
    <i class="ch-led" aria-hidden="true"></i>
    <i class="ch-vent" aria-hidden="true"></i>
    <i class="ch-bolt tl" aria-hidden="true"></i>
    <i class="ch-bolt tr" aria-hidden="true"></i>
    <i class="ch-bolt bl" aria-hidden="true"></i>
    <i class="ch-bolt br" aria-hidden="true"></i>
  </span>
</template>
<style scoped>
/* High-fidelity industrial chassis — matches generated hardware art direction */
.chassis {
  flex: none;
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  overflow: hidden;
  background: linear-gradient(165deg, #2a2d35 0%, #14161c 45%, #0c0d11 100%);
  border: 1.5px solid #3a3e48;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 40%, transparent),
    0 1px 3px color-mix(in srgb, var(--ink) 20%, transparent);
}
.chassis.sz-md { width: 30px; height: 30px; }
.chassis.sz-lg { width: 32px; height: 32px; }
.chassis.lg { width: 42px; height: 42px; border-radius: 8px; }

.ch-body {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 6%, transparent) 0 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, #000 25%, transparent), transparent 30%, transparent 70%, color-mix(in srgb, #000 20%, transparent));
  pointer-events: none;
  z-index: 0;
}

/* Status LED bar across the top */
.ch-led {
  position: absolute;
  top: 3px;
  left: 14%;
  right: 14%;
  height: 3px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--ink-3) 40%, transparent);
  z-index: 3;
  box-shadow: none;
}
.chassis.lg .ch-led { top: 4px; height: 4px; left: 12%; right: 12%; }

/* Horizontal ventilation louvers */
.ch-vent {
  position: absolute;
  left: 4px;
  right: 4px;
  top: 9px;
  bottom: 5px;
  border-radius: 2px;
  z-index: 1;
  pointer-events: none;
  background: repeating-linear-gradient(
    180deg,
    #1a1c22 0px,
    #1a1c22 1.5px,
    #0e0f13 1.5px,
    #0e0f13 3.5px
  );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 50%, transparent);
  opacity: 0.95;
}
.chassis.lg .ch-vent { top: 12px; bottom: 7px; left: 5px; right: 5px; }

/* Corner bolts */
.ch-bolt {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #5a5e68, #2a2d35 70%);
  box-shadow: 0 0 0 0.5px #0a0b0e;
  z-index: 2;
  opacity: 0.85;
}
.ch-bolt.tl { top: 2px; left: 2px; }
.ch-bolt.tr { top: 2px; right: 2px; }
.ch-bolt.bl { bottom: 2px; left: 2px; }
.ch-bolt.br { bottom: 2px; right: 2px; }
.chassis.lg .ch-bolt { width: 4px; height: 4px; }
.chassis.lg .ch-bolt.tl { top: 3px; left: 3px; }
.chassis.lg .ch-bolt.tr { top: 3px; right: 3px; }
.chassis.lg .ch-bolt.bl { bottom: 3px; left: 3px; }
.chassis.lg .ch-bolt.br { bottom: 3px; right: 3px; }

/* State: running */
.chassis.run {
  border-color: color-mix(in srgb, var(--green) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent),
    0 0 12px color-mix(in srgb, var(--green) 40%, transparent),
    0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent);
  animation: dotPulse 2.4s ease-out infinite;
}
.chassis.run .ch-led {
  background: var(--green);
  box-shadow: 0 0 6px color-mix(in srgb, var(--green) 80%, transparent), 0 0 2px var(--green);
}
.chassis.run .ch-vent {
  background: repeating-linear-gradient(
    180deg,
    #12141a 0px,
    #12141a 1.5px,
    #0a0b0e 1.5px,
    #0a0b0e 3.5px
  );
}

/* State: off */
.chassis.off {
  border-color: #2a2d35;
  opacity: 0.78;
  filter: grayscale(0.45) brightness(0.85);
}
.chassis.off .ch-led {
  background: color-mix(in srgb, var(--card) 25%, transparent);
  box-shadow: none;
}

/* State: warn */
.chassis.warn {
  border-color: color-mix(in srgb, var(--amber) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
    0 0 12px color-mix(in srgb, var(--amber) 45%, transparent);
}
.chassis.warn .ch-led {
  background: var(--amber);
  box-shadow: 0 0 6px color-mix(in srgb, var(--amber) 80%, transparent);
}

/* State: bad */
.chassis.bad {
  border-color: color-mix(in srgb, var(--red) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
    0 0 12px color-mix(in srgb, var(--red) 50%, transparent);
}
.chassis.bad .ch-led {
  background: var(--red);
  box-shadow: 0 0 6px color-mix(in srgb, var(--red) 80%, transparent);
}

/* State: build */
.chassis.build {
  border-color: color-mix(in srgb, var(--blue) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
    0 0 12px color-mix(in srgb, var(--blue) 45%, transparent);
}
.chassis.build .ch-led {
  background: var(--blue);
  box-shadow: 0 0 6px color-mix(in srgb, var(--blue) 80%, transparent);
  animation: chBuildLed 1.2s ease-in-out infinite;
}
@keyframes chBuildLed {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

/* Chain-hue overrides the status LED when present */
.chassis[style*="--chain-h"] .ch-led {
  background: oklch(var(--chain-l) var(--chain-c) var(--chain-h));
  box-shadow: 0 0 6px oklch(var(--chain-l) var(--chain-c) var(--chain-h) / 0.6);
}
</style>
