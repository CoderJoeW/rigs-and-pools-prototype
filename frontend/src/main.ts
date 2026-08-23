import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { armUnlock } from './services/audio.js';
import './assets/main.css';

// A player who turned sound on in an earlier session still cannot have an
// AudioContext until they touch something — autoplay policy, not preference.
// One disposable listener bridges that gap; see services/audio.ts.
armUnlock();

createApp(App).use(createPinia()).mount('#app');
