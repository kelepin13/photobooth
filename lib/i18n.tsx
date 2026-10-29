'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'id' | 'en' | 'zh';

const STORAGE_KEY = 'photobooth-lang';

const dict = {
  home: {
    title: { id: 'Online Photobooth', en: 'Online Photobooth', zh: '在线照相馆' },
    subtitle: {
      id: 'Bikin room, share QR-nya, terus foto bareng temanmu real-time — langsung jadi satu photo strip lucu.',
      en: 'Create a room, share the QR code, and capture a photo strip together with friends in real time.',
      zh: '创建房间,分享二维码,和朋友实时一起拍照,直接合成一张有趣的照片条。',
    },
    layoutLabel: { id: 'Pilih layout strip', en: 'Choose strip layout', zh: '选择照片条布局' },
    layout2x2: { id: '2×2 Kotak', en: '2×2 Grid', zh: '2×2 方格' },
    layout1x4: { id: '1×4 Vertikal', en: '1×4 Vertical', zh: '1×4 竖排' },
    layout1x2: { id: '1×2 Mini', en: '1×2 Mini', zh: '1×2 迷你' },
    layout2x3: { id: '2×3 Party', en: '2×3 Party', zh: '2×3 派对' },
    button: { id: 'Bikin Room Yuk! 🎉', en: 'Create a Room! 🎉', zh: '创建房间吧!🎉' },
    buttonLoading: { id: 'Lagi bikin room…', en: 'Creating room…', zh: '正在创建房间…' },
    pinToggle: { id: 'Pakai PIN biar lebih private', en: 'Add a PIN for privacy', zh: '添加 PIN 码以保护隐私' },
    pinPlaceholder: { id: 'PIN 4-6 digit', en: '4-6 digit PIN', zh: '4-6 位 PIN 码' },
    pinInvalid: { id: 'PIN harus 4-6 angka', en: 'PIN must be 4-6 digits', zh: 'PIN 码必须是 4-6 位数字' },
  },
  join: {
    title: { id: 'Yuk, gabung foto bareng!', en: 'Join the photo session!', zh: '快来一起拍照吧!' },
    subtitle: { id: 'Isi nama kamu buat mulai ambil foto di room ini', en: 'Enter your name to start taking photos in this room', zh: '输入你的名字,开始在此房间拍照' },
    placeholder: { id: 'Nama kamu...', en: 'Your name...', zh: '你的名字...' },
    button: { id: 'Masuk & Cekrek! 🎉', en: 'Join & Shoot! 🎉', zh: '加入并拍照!🎉' },
    participants: { id: 'teman sudah gabung', en: 'friends have joined', zh: '位朋友已加入' },
    pinPlaceholder: { id: 'PIN room', en: 'Room PIN', zh: '房间 PIN 码' },
    pinRequired: { id: 'Room ini pakai PIN, masukin dulu ya', en: 'This room needs a PIN to join', zh: '此房间需要 PIN 码才能加入' },
    notFoundTitle: { id: 'Room tidak ditemukan 😢', en: 'Room not found 😢', zh: '未找到房间 😢' },
    notFoundSub: { id: 'Kode room mungkin salah atau sudah kadaluarsa.', en: 'The room code may be wrong or has expired.', zh: '房间代码可能错误或已过期。' },
    notFoundButton: { id: 'Balik ke Home', en: 'Back to Home', zh: '返回首页' },
    loading: { id: 'Lagi nyiapin room…', en: 'Setting up the room…', zh: '正在准备房间…' },
  },
  room: {
    title: { id: 'Foto bareng yuk!', en: "Let's take photos!", zh: '一起拍照吧!' },
    shareQr: { id: 'Ajak teman scan QR ini', en: 'Ask friends to scan this QR', zh: '邀请朋友扫描此二维码' },
    friendsJoined: { id: 'orang di room ini:', en: 'people in this room:', zh: '位在此房间:' },
    camera: { id: 'Kamera', en: 'Camera', zh: '摄像头' },
    cameraError: {
      id: 'Kamera tidak bisa diakses. Izinkan akses kamera di browser kamu ya.',
      en: "Can't access the camera. Please allow camera access in your browser.",
      zh: '无法访问摄像头,请在浏览器中允许摄像头权限。',
    },
    captureButton: { id: 'Jepret slot', en: 'Shoot slot', zh: '拍摄第' },
    captureSuffix: { id: '', en: '', zh: '格' },
    processing: { id: 'Diproses…', en: 'Processing…', zh: '处理中…' },
    slotsFilled: { id: 'slot terisi', en: 'slots filled', zh: '格已拍' },
    stripTitle: { id: 'Photo strip', en: 'Photo strip', zh: '照片条' },
    compose: { id: 'Gabungin jadi strip ✨', en: 'Combine into strip ✨', zh: '合成照片条 ✨' },
    download: { id: 'Simpan ke device 💾', en: 'Save to device 💾', zh: '保存到设备 💾' },
    roomNotFound: { id: 'Room tidak ditemukan', en: 'Room not found', zh: '未找到房间' },
    captionLabel: { id: 'Teks buat strip (opsional)', en: 'Caption for the strip (optional)', zh: '照片条文字(可选)' },
    captionPlaceholder: { id: 'mis. Malam Minggu Seru', en: 'e.g. Friday Night Out', zh: '例如 周五聚会' },
    lockedByOther: { id: 'lagi difoto sama', en: 'is currently shooting —', zh: '正在拍摄 —' },
    lockedWait: { id: 'tunggu sebentar ya', en: 'please wait', zh: '请稍候' },
    reconnecting: { id: 'Menyambungkan ulang…', en: 'Reconnecting…', zh: '正在重新连接…' },
    keep: { id: 'Simpan foto ini ✅', en: 'Keep this photo ✅', zh: '保留这张 ✅' },
    retake: { id: 'Foto ulang 🔄', en: 'Retake 🔄', zh: '重拍 🔄' },
    previewTitle: { id: 'Gimana hasilnya?', en: 'How does it look?', zh: '效果怎么样?' },
    publishLink: { id: 'Bikin link publik', en: 'Get a public link', zh: '生成公开链接' },
    boomerang: { id: 'Boomerang 🔁', en: 'Boomerang 🔁', zh: '回旋短片 🔁' },
    boomerangBusy: { id: 'Lagi merekam…', en: 'Recording…', zh: '正在录制…' },
    boomerangTitle: { id: 'Boomerang terakhir', en: 'Latest boomerang', zh: '最新回旋短片' },
    share: { id: '📤 Bagikan', en: '📤 Share', zh: '📤 分享' },
    mirror: { id: 'Cermin', en: 'Mirror', zh: '镜像' },
    switchCamera: { id: 'Ganti kamera', en: 'Switch camera', zh: '切换摄像头' },
    actionFailed: { id: 'Ada yang gagal, coba lagi ya.', en: 'Something went wrong, please try again.', zh: '出错了,请再试一次。' },
    dismiss: { id: 'Tutup', en: 'Dismiss', zh: '关闭' },
  },
  filters: {
    none: { id: 'Normal', en: 'None', zh: '原图' },
    grayscale: { id: 'Hitam Putih', en: 'B&W', zh: '黑白' },
    sepia: { id: 'Sepia', en: 'Sepia', zh: '复古棕' },
    vintage: { id: 'Vintage', en: 'Vintage', zh: '复古' },
    cool: { id: 'Dingin', en: 'Cool', zh: '冷色调' },
    warm: { id: 'Hangat', en: 'Warm', zh: '暖色调' },
    highContrast: { id: 'Kontras Tinggi', en: 'High Contrast', zh: '高对比度' },
  },
  aiEffects: {
    title: { id: 'Efek AI (background)', en: 'AI Effects (background)', zh: 'AI 特效(背景)' },
    loading: { id: 'Lagi nyiapin model AI…', en: 'Loading the AI model…', zh: '正在加载 AI 模型…' },
    none: { id: 'Normal', en: 'None', zh: '原图' },
    blur: { id: 'Blur Background', en: 'Blur Background', zh: '背景虚化' },
    'replace-pink': { id: 'Studio Pink', en: 'Studio Pink', zh: '粉色影棚' },
    'replace-mint': { id: 'Studio Mint', en: 'Studio Mint', zh: '薄荷影棚' },
    'replace-custom': { id: 'Upload Sendiri', en: 'Custom Photo', zh: '自定义背景' },
    uploadPrompt: { id: 'Pilih foto background', en: 'Choose a background photo', zh: '选择背景图片' },
  },
  faceProps: {
    title: { id: 'Face Props', en: 'Face Props', zh: '脸部特效道具' },
    none: { id: 'Normal', en: 'None', zh: '无' },
    glasses: { id: 'Kacamata 🕶️', en: 'Glasses 🕶️', zh: '墨镜 🕶️' },
    ears: { id: 'Telinga 🐰', en: 'Bunny Ears 🐰', zh: '兔耳朵 🐰' },
    hat: { id: 'Topi 🎩', en: 'Top Hat 🎩', zh: '礼帽 🎩' },
  },
} as const;

function get(path: string, lang: Lang): string {
  let node: unknown = dict;
  for (const part of path.split('.')) {
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }
  const text = node && typeof node === 'object' ? (node as Record<string, unknown>)[lang] : undefined;
  return typeof text === 'string' ? text : path;
}

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (path: string) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('id');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === 'id' || saved === 'en' || saved === 'zh') setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: (path: string) => get(path, lang) }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
