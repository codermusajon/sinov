# Claude reel — "Topshiriq"

Talaba va Claude o'rtasidagi 27 soniyalik vertikal (1080×1920, 30 fps) 3D video, o'zbek tilida.
Ovozlar: ElevenLabs `eleven_v4` — talaba: **Sardor**, Claude: **Jahongir**.

## Fayllar
| Fayl | Vazifasi |
|---|---|
| `timeline.mjs` | Replikalar, pauzalar, kamera kadrlari — yagona vaqt manbasi |
| `vo/` | Ovoz yozuvlari (`*.wav` git'da emas) va so'z vaqtlari `words.json` |
| `build-film.mjs` | Ovoz shinalari + og'iz harakati konvertlari + subtitrlar → `film.json` |
| `scene.js`, `film.html` | three.js sahna, `window.setT(t)` vaqtning sof funksiyasi |
| `cdp.mjs`, `render.mjs` | Headless Chrome orqali kadrma-kadr render |
| `mix.mjs` | Ovoz miksi (-14 LUFS) |
| `check.mjs` | Harakat/yerga tegish tekshiruvi |
| `make.mjs` | Hammasini ketma-ket ishga tushiradi va mp4 yig'adi |

## O'z kompyuteringizda (RTX 4060) qayta render qilish
1. Node.js 22+, Google Chrome va ffmpeg o'rnatilgan bo'lsin.
2. `cd reel && npm i` (three.js o'rnatiladi).
3. Ovoz fayllari (`vo/*.wav`) repoda bor, qo'shimcha ish kerak emas.
4. `node make.mjs render` — Windows'da Chrome avtomatik ravishda GPU (ANGLE d3d11) bilan ishlaydi.
   Render ~830 kadr, RTX 4060'da bir necha daqiqa.

Bulutli konteynerda GPU yo'q, u yerda `REEL_CPU=1` bilan SwiftShader (protsessor) ishlatilgan (~3,5 s/kadr).
