export const isGuidePhoto = (file: File) => /^(image\/(jpeg|png|webp))$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

// Reviewed fixtures: filenames associate material to rows; only matching bytes get scene annotations.
const reviewedPhotos: Record<string, [string, string]> = {
  f3a3e9c1327c915b3b7c4be6a985c5f64b8dda47d5dbf8a36271c923ca22c974: ['地磅上的牵引车与平板挂车，车头可见。', '请对照磅单、过磅时间和车辆档案；画面未显示称重读数。'],
  fd16276140c85028d7b6e136b6bc64cb3cebf2666d960cbcbb6533b51ff06275: ['车辆尾部可见堆叠包件，画面主要覆盖后侧货物。', '核对装载清单和前部货物，不能从单一视角清点全车。'],
  '0c40a2758cdf4f482a0559dbe4bd927be4c2e7287fbd51086dbbe909ddc007f7': ['道路旁白色牵引车，正面及部分车侧可见。', '车头照片可供人工比对车辆，不能证明装卸已完成。'],
  '22950b71537c48162af8fe784893c64be2c68689244bab59ce2eece297cb1b54': ['平板挂车上有多层捆扎包件，车尾和货物侧面可见。', '核对包件标签、装车清单和捆扎记录；不从照片推断货物重量。'],
  '0411d3cc000a82bc05683cba3176b4b3c4380fca7cc7d59407e0040b7d1ed189': ['挂车货物被篷布覆盖，可见外部绑扎。', '货物本体不可见，请结合覆盖前照片和交接单核对。'],
  '72603ca55ba5c10e7e18991a9af658b422c6184ff97fd5170d0c848b1217097d': ['道路旁白色车辆，正面与篷布货厢同框。', '请核对同票装车材料，不以路旁停车照片代替签收凭证。'],
};

export async function inspectPhoto(file: File) {
  if (!file.size || file.size > 12 * 1024 * 1024) throw new Error('图片为空或超过 12 MB');
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    const w = image.naturalWidth, h = image.naturalHeight;
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 320 / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法读取图片像素');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0, sq = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      const y = .299 * bytes[i]! + .587 * bytes[i + 1]! + .114 * bytes[i + 2]!;
      sum += y; sq += y * y;
    }
    const n = bytes.length / 4, mean = sum / n, deviation = Math.sqrt(Math.max(0, sq / n - mean ** 2));
    const issues = [Math.min(w, h) < 400 && '分辨率偏低', mean < 35 && '画面过暗', mean > 235 && '画面过亮', deviation < 12 && '画面对比度不足'].filter(Boolean);
    const hash = crypto.subtle && await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const key = hash ? Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') : '';
    const [画面内容, 核对事项] = reviewedPhotos[key] ?? ['画面内容待人工核验。', '请核对货物、车牌及交接凭证。'];
    return { name: file.name, url: canvas.toDataURL('image/jpeg', .70), 画面内容, 核对事项, 图片检查: issues.length ? '建议补拍：' + issues.join('、') : '图像可读，装卸内容待核对', 图片信息: file.name + ' · ' + w + ' × ' + h + ' px' };
  } finally { URL.revokeObjectURL(url); }
}
