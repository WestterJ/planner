'use strict';
/* Planner Escolar Familiar — configuração e versão. Ver ARQUITETURA.md */
const APP_VERSION='v2.1.0';
const PDF_WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc=PDF_WORKER_URL;
const cfg=window.NUTRI_SUPABASE_CONFIG||window.SUPABASE_CONFIG||{};
const supabaseConfig={url:cfg.url||'https://ytsabhbkywymtevkeokg.supabase.co',key:cfg.key||cfg.anonKey||'sb_publishable_cyIolmmdF5zKN0rAOJQOXg_ECcSq7z6'};
const ROLE_LABEL={leitor:'Leitor',editor:'Editor',admin:'Admin'};
const TABS=['home','records','import','users','settings'];
document.getElementById('version').textContent=APP_VERSION;
document.getElementById('version-top').textContent='APP '+APP_VERSION;
