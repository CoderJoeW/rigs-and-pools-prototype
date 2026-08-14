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
  <span class="chassis" :class="[state, 'sz-'+size, {lg: large}]"
        :style="chainHue!==undefined&&chainHue!==null?{'--chain-h':chainHue}:undefined"
        role="img" :aria-label="label||state">
    <i class="ch-led" aria-hidden="true"></i>
    <i class="ch-vent" aria-hidden="true"></i>
  </span>
</template>
<style scoped>
.chassis{flex:none;position:relative;width:28px;height:28px;border-radius:6px;border:1.5px solid var(--line);background:var(--line-2);overflow:hidden;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent),0 1px 2px color-mix(in srgb,var(--ink) 8%,transparent)}
.chassis.sz-md{width:30px;height:30px}.chassis.sz-lg{width:32px;height:32px}
.chassis .ch-led{position:absolute;top:0;left:14%;right:14%;height:3px;border-radius:0 0 2px 2px;background:color-mix(in srgb,var(--ink-3) 35%,transparent);z-index:2}
.chassis[style*="--chain-h"] .ch-led{background:oklch(var(--chain-l) var(--chain-c) var(--chain-h));box-shadow:0 0 6px oklch(var(--chain-l) var(--chain-c) var(--chain-h)/.55)}
.chassis .ch-vent{position:absolute;inset:7px 5px 5px;border-radius:2px;z-index:1;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 2px,color-mix(in srgb,var(--ink) 10%,transparent) 2px 3px);opacity:.55}
.chassis.sz-lg .ch-vent{opacity:.8}
.chassis.run{background:var(--green);border-color:var(--green);animation:dotPulse 2.4s ease-out infinite}
.chassis.run .ch-vent{background:repeating-linear-gradient(90deg,transparent 0 2px,color-mix(in srgb,#000 20%,transparent) 2px 3px);opacity:.4}
.chassis.off{background:var(--ink-3);border-color:var(--ink-3)}
.chassis.off .ch-led{background:color-mix(in srgb,var(--card) 25%,transparent);box-shadow:none}
.chassis.bad{background:var(--red);border-color:var(--red);box-shadow:0 0 8px color-mix(in srgb,var(--red) 55%,transparent)}
.chassis.warn{background:var(--amber);border-color:var(--amber);box-shadow:0 0 8px color-mix(in srgb,var(--amber) 50%,transparent)}
.chassis.build{background:var(--blue);border-color:var(--blue);box-shadow:0 0 8px color-mix(in srgb,var(--blue) 50%,transparent)}
.chassis.build .ch-led{animation:chBuildLed 1.2s ease-in-out infinite}
@keyframes chBuildLed{0%,100%{opacity:.35}50%{opacity:1}}
.chassis.lg{width:40px;height:40px;border-radius:8px}
.chassis.lg .ch-led{height:4px;left:12%;right:12%}
.chassis.lg .ch-vent{inset:10px 7px 7px}
</style>
