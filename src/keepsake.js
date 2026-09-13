// Copy the rendered view synchronously, before the WebGL backbuffer is cleared.
export function keepsakeCanvas(scene, verse, night = false) {
  const canvas = document.createElement('canvas'), scale = scene.width / 1200;
  canvas.width = scene.width; canvas.height = scene.height + Math.round(210 * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(scene, 0, 0);
  ctx.save(); ctx.translate(0, scene.height); ctx.scale(scale, scale);
  ctx.fillStyle = night ? '#293e39' : '#f0f2e9'; ctx.fillRect(0, 0, 1200, 210);
  ctx.fillStyle = night ? '#e0e8dd' : '#3c5047';
  ctx.textBaseline = 'middle'; ctx.font = '38px "Songti SC", "STSong", serif';
  ctx.fillText('长衣亭', 56, 76);
  ctx.font = '19px "Songti SC", "STSong", serif';
  ctx.fillText('予 · 张依婷', 58, 125);
  ctx.font = '28px "Songti SC", "STSong", serif';
  verse.forEach((line, i) => ctx.fillText(line, 638, 73 + i * 49, 476));
  ctx.fillStyle = night ? '#c5bba5' : '#697c6c'; ctx.font = '16px "Songti SC", "STSong", serif';
  ctx.fillText('予你，一处朝暮。', 58, 171);
  ctx.fillStyle = '#97584d'; ctx.fillRect(291, 53, 39, 45);
  ctx.fillStyle = '#f0e7d9'; ctx.font = '28px "Songti SC", "STSong", serif'; ctx.fillText('依', 296, 76);
  ctx.restore(); return canvas;
}
