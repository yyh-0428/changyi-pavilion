import './style.css';
import { createIcons, Feather, SunMedium, Moon, Rotate3d, ScanEye, Plus, Minus, Download, Maximize, Minimize, Mountain, Landmark, Lamp, Flower2, Fish, Image, Box, X, RotateCw } from 'lucide';

const icons = { Feather, SunMedium, Moon, Rotate3d, ScanEye, Plus, Minus, Download, Maximize, Minimize, Mountain, Landmark, Lamp, Flower2, Fish, Image, Box, X, RotateCw };
const $ = selector => document.querySelector(selector), experience = $('#experience');
const verses = [
  ['银汉低回傍霓裳，', '明月窥帘照玉珰。'],
  ['若教春色妒卿妆，', '桃李无言自敛芳。'],
  ['瑶台纵有月华凉，', '不及携卿看夕阳。'],
  ['此生相守鬓成霜，', '愿挽星河缀嫁裳。'],
];
let sceneActions, selectedView, toastTimer;
createIcons({ icons });

function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function setVerse(index) {
  $('#scene-verse').replaceChildren(document.createTextNode(verses[index][0]), document.createElement('br'), document.createTextNode(verses[index][1]));
  document.querySelectorAll('[data-stanza]').forEach(button => {
    const active = Number(button.dataset.stanza) === index;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}
function setTheme(value, changeVerse = true) {
  experience.dataset.theme = value;
  document.querySelectorAll('[data-light]').forEach(button => {
    const active = button.dataset.light === value;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#scene-time').textContent = value === 'moonlight' ? '月夜 · 亥时' : '夕照 · 酉时';
  if (changeVerse) setVerse(value === 'moonlight' ? 0 : 2);
}
function closeMenus() {
  for (const name of ['view', 'download']) { $(`#${name}-menu`).hidden = true; $(`#${name}-open`).setAttribute('aria-expanded', 'false'); }
}
const poem = $('#poem-dialog');
for (const id of ['#poem-open', '#poem-open-fallback']) $(id).addEventListener('click', () => {
  closeMenus(); if (!poem.open) poem.showModal();
});
$('#poem-close').addEventListener('click', () => poem.close());
poem.addEventListener('click', event => {
  const r = poem.getBoundingClientRect();
  if (event.target === poem && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) poem.close();
});
document.querySelectorAll('[data-stanza]').forEach(button => button.addEventListener('click', () => {
  const index = Number(button.dataset.stanza), theme = index === 0 || index === 3 ? 'moonlight' : 'sunset';
  setVerse(index); setTheme(theme, false);
  selectedView = ['inside', 'blossom', 'overview', 'architecture'][index];
  sceneActions?.setTheme(theme, false); sceneActions?.setView(selectedView);
  poem.close();
}));
document.querySelectorAll('[data-light]').forEach(button => button.addEventListener('click', () => {
  setTheme(button.dataset.light); sceneActions?.setTheme(button.dataset.light, false);
}));
$('#reload').addEventListener('click', () => location.reload());
$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (experience.requestFullscreen) await experience.requestFullscreen();
    else toast('当前浏览器暂不支持全屏');
  } catch { toast('当前浏览器暂不支持全屏'); }
});
document.addEventListener('fullscreenchange', () => {
  const full = Boolean(document.fullscreenElement), button = $('#fullscreen');
  button.innerHTML = `<i data-lucide="${full ? 'minimize' : 'maximize'}"></i>`;
  button.dataset.tip = full ? '退出全屏' : '全屏'; button.setAttribute('aria-label', button.dataset.tip); createIcons({ icons });
});
setVerse(2);

function showRenderError() {
  sceneActions = undefined; closeMenus();
  experience.classList.add('fallback'); experience.classList.remove('ready'); experience.dataset.view = 'overview';
  $('#render-error').hidden = false; $('#loading').hidden = true;
  $('.scene-controls').hidden = true; $('.view-shortcuts').hidden = true;
  $('#scene').querySelector('canvas')?.setAttribute('hidden', '');
}

const ui = {
  toast, setTheme, closeMenus, showRenderError,
  connectScene(actions) {
    sceneActions = actions;
    actions.setTheme(experience.dataset.theme, false);
    if (selectedView) actions.setView(selectedView, false);
    $('.scene-controls').inert = false; $('.view-shortcuts').inert = false;
  },
};

// The dedication and complete poem work before Three.js even downloads.
import('./main.js').then(({ start }) => start(ui)).catch(error => {
  console.error('Pavilion initialization failed', error); showRenderError();
});
