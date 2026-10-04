/* scripts/gen-android-icons.js — generate Android mipmap launcher icons
   from the existing FLOUSY icon (assets/icons/icon-1024.png) only.
   No overlays, no badges, no external assets: pure resizes of the current icon. */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'icons', 'icon-1024.png');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
if (!existsSync(src)) throw new Error('source icon missing: assets/icons/icon-1024.png');
if (!existsSync(res)) throw new Error('android res missing — run npx cap add android first');

// density -> launcher png size (standard Android launcher icon sizes)
const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};
// adaptive foreground safe zone: full 108dp canvas, icon content in inner ~66%
const FG_SCALE = 0.66;

const magick = (() => {
  for (const c of ['magick', 'C:\\Program Files\\ImageMagick-7\\magick.exe']) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch { /* next */ }
  }
  return null;
})();

function resizePS(srcPng, dstPng, size, padTo = null) {
  const scale = (i) => `source=Math.Round(${i}*$($img.Width/$($img.Width)))`;
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${srcPng.replace(/\\/g, '\\\\')}')
$out = ${size}
$canvas = ${padTo || size}
$bmp = New-Object System.Drawing.Bitmap($canvas, $canvas)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
if (${padTo ? '$true' : '$false'}) {
  $draw = [int]($canvas * $out / $canvas)
}
$w = if (${padTo ? '$true' : '$false'}) { [int]($canvas * ${FG_SCALE}) } else { $canvas }
$off = [int](($canvas - $w) / 2)
$g.DrawImage($img, $off, $off, $w, $w)
$g.Dispose()
$bmp.Save('${dstPng.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $img.Dispose()
`;
  execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
}

for (const [dir, size] of Object.entries(SIZES)) {
  const d = join(res, dir);
  mkdirSync(d, { recursive: true });
  resizePS(src, join(d, 'ic_launcher.png'), size);
  resizePS(src, join(d, 'ic_launcher_round.png'), size);
  // adaptive foreground: 108dp canvas at density, icon scaled to safe zone
  const canvas = Math.round(size * 108 / 48);
  resizePS(src, join(d, 'ic_launcher_foreground.png'), size, canvas);
  console.log(`${dir}: ic_launcher/round/foreground @ ${size}px`);
}
console.log('android mipmaps generated from assets/icons/icon-1024.png');
