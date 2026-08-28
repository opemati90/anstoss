const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const root = __dirname
const sourceDir = path.join(root, 'source')
const appStoreDir = path.join(root, 'app-store', 'en-US')
const playStoreDir = path.join(root, 'play-store', 'en-US')
const sharedDir = path.join(root, 'shared')

for (const directory of [appStoreDir, playStoreDir, sharedDir]) {
  fs.mkdirSync(directory, { recursive: true })
}

const palette = {
  ink: '#121511',
  paper: '#F5F2EA',
  green: '#173F2C',
  grass: '#2D7B3B',
  mint: '#DCE9DE',
  line: '#D8D8D0',
  white: '#FFFFFF',
}

const screens = [
  {
    source: 'launch.png',
    eyebrow: 'ANSTOSS',
    title: ['YOUR CLUB.', 'ONE PLACE.'],
    note: 'Football operations without the noise.',
    background: palette.green,
    foreground: palette.white,
    cropTop: 0,
  },
  {
    source: 'current-after-user.png',
    eyebrow: 'CLUB HOME',
    title: ['RUN MATCHDAY', 'WITHOUT CHAOS.'],
    note: 'The next fixture and every key action, up front.',
    background: palette.paper,
    foreground: palette.ink,
    cropTop: 0,
  },
  {
    source: 'events.png',
    eyebrow: 'EVENTS & RSVP',
    title: ['AVAILABILITY,', 'AT A GLANCE.'],
    note: 'Training, matches and attendance in one timeline.',
    background: palette.mint,
    foreground: palette.ink,
    cropTop: 0,
  },
  {
    source: 'chat.png',
    eyebrow: 'TEAM CHAT',
    title: ['KEEP EVERYONE', 'IN THE LOOP.'],
    note: 'Channels, announcements and staff coordination.',
    background: '#EFEDE5',
    foreground: palette.ink,
    cropTop: 0,
  },
  {
    source: 'squad.png',
    eyebrow: 'SQUAD',
    title: ['BUILD A SQUAD', 'THAT IS READY.'],
    note: 'Invites, trials and roster health made visible.',
    background: '#E8EEE8',
    foreground: palette.ink,
    cropTop: 0,
  },
  {
    source: 'contributions.png',
    eyebrow: 'CONTRIBUTIONS',
    title: ['LESS CHASING.', 'MORE CLARITY.'],
    note: 'Track club dues and report bank transfers clearly.',
    background: '#F2ECE6',
    foreground: palette.ink,
    cropTop: 0,
  },
]

function esc(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textSvg({ width, height, eyebrow, title, note, color, large = false }) {
  const titleSize = large ? 88 : 72
  const lineHeight = large ? 92 : 76
  const x = large ? 82 : 70
  const titleY = large ? 116 : 98
  const noteY = titleY + lineHeight * title.length + (large ? 25 : 18)
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${x}" y="44" fill="${color}" opacity="0.72"
        font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="5">${esc(eyebrow)}</text>
      <text x="${x}" y="${titleY}" fill="${color}"
        font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="900" letter-spacing="-3">
        ${title.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join('')}
      </text>
      <text x="${x}" y="${noteY}" fill="${color}" opacity="0.72"
        font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="500">${esc(note)}</text>
    </svg>
  `)
}

function roundedMask(width, height, radius) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`)
}

async function preparedScreen(item, width, height, platform) {
  const sourcePath = path.join(sourceDir, item.source)
  let pipeline = sharp(sourcePath)
  const isAppleLaunch = platform === 'app-store' && item.source === 'launch.png'
  if (!isAppleLaunch) {
    const metadata = await pipeline.metadata()
    const top = item.source === 'launch.png'
      ? 220
      : item.source === 'current-after-user.png'
        ? 465
        : 560
    // Keep the complete tab labels while excluding the simulator home indicator.
    const bottom = item.source === 'current-after-user.png' ? 600 : 60
    pipeline = pipeline.extract({
      left: 0,
      top,
      width: metadata.width,
      height: metadata.height - top - bottom,
    })
    if (item.source === 'current-after-user.png') {
      // Preserve breathing room above the first complete fixture card after
      // excluding the simulator-only developer control from the source crop.
      pipeline = pipeline.extend({ top: 72, bottom: 0, left: 0, right: 0, background: '#FFFFFF' })
    }
  }
  return pipeline
    .resize(width, height, {
      fit: isAppleLaunch ? 'cover' : 'contain',
      position: 'top',
      background: '#FFFFFF',
    })
    .composite([{ input: roundedMask(width, height, 58), blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function buildPortrait(item, index, platform) {
  const isApple = platform === 'app-store'
  const isLaunch = item.source === 'launch.png'
  const canvas = isApple ? { width: 1290, height: 2796 } : { width: 1080, height: 1920 }
  const headerHeight = isApple ? 540 : 400
  const frame = isApple
    ? { left: 130, top: 535, width: 1030, height: isLaunch ? 2225 : 1690 }
    : { left: 120, top: 390, width: 840, height: isLaunch ? 1500 : 1450 }
  const screen = await preparedScreen(item, frame.width, frame.height, platform)
  const shadow = Buffer.from(`<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#0B150F" flood-opacity="0.20"/></filter></defs>
    <rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="${frame.height}" rx="58" fill="#fff" filter="url(#s)"/>
  </svg>`)
  const text = textSvg({
    width: canvas.width,
    height: headerHeight,
    eyebrow: item.eyebrow,
    title: item.title,
    note: item.note,
    color: item.foreground,
    large: isApple,
  })
  const outputDir = isApple ? appStoreDir : playStoreDir
  const filename = `${String(index + 1).padStart(2, '0')}-${item.eyebrow.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`

  await sharp({
    create: { width: canvas.width, height: canvas.height, channels: 4, background: item.background },
  })
    .composite([
      { input: text, left: 0, top: isApple ? 55 : 36 },
      { input: shadow, left: 0, top: 0 },
      { input: screen, left: frame.left, top: frame.top },
    ])
    .flatten({ background: item.background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, filename))
}

async function buildIcons() {
  const icon = path.join(root, '..', 'apps', 'mobile', 'assets', 'icon.png')
  await sharp(icon).resize(1024, 1024, { fit: 'cover' }).flatten({ background: '#FFFFFF' }).png().toFile(path.join(appStoreDir, 'app-icon-1024.png'))
  await sharp(icon)
    .resize(512, 512, { fit: 'cover' })
    .flatten({ background: '#FFFFFF' })
    .ensureAlpha(1)
    .png()
    .toFile(path.join(playStoreDir, 'play-icon-512.png'))
}

async function buildFeatureGraphic() {
  const icon = await sharp(path.join(root, '..', 'apps', 'mobile', 'assets', 'icon.png'))
    .resize(112, 112)
    .composite([{ input: roundedMask(112, 112, 25), blend: 'dest-in' }])
    .png()
    .toBuffer()
  const eventCard = await preparedScreen(screens[2], 310, 480, 'play-store')
  const chatCard = await preparedScreen(screens[3], 260, 428, 'play-store')
  const stadium = await sharp(path.join(sourceDir, 'launch.png'))
    .resize(1024, 500, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.54, saturation: 0.72 })
    .toBuffer()
  const copy = Buffer.from(`<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10271D" stop-opacity="0.98"/><stop offset="0.62" stop-color="#10271D" stop-opacity="0.90"/><stop offset="1" stop-color="#10271D" stop-opacity="0.52"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#g)"/>
    <text x="195" y="122" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="43" font-weight="900">Anstoss</text>
    <text x="62" y="204" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="900">YOUR CLUB.</text>
    <text x="62" y="260" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="900">ONE PLACE.</text>
    <text x="62" y="320" fill="#fff" opacity="0.76" font-family="Arial, Helvetica, sans-serif" font-size="22">Fixtures, squads, chat and contributions.</text>
    <rect x="62" y="367" width="174" height="54" rx="27" fill="#fff"/>
    <text x="149" y="402" text-anchor="middle" fill="#14291F" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700">Built for clubs</text>
  </svg>`)

  await sharp(stadium)
    .composite([
      { input: copy, left: 0, top: 0 },
      { input: icon, left: 62, top: 52 },
      { input: chatCard, left: 748, top: 72 },
      { input: eventCard, left: 585, top: 20 },
    ])
    .flatten({ background: palette.green })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(playStoreDir, 'feature-graphic-1024x500.png'))
}

async function buildPreview() {
  const files = fs.readdirSync(appStoreDir).filter((file) => /^\d\d-.*\.png$/.test(file)).sort()
  const thumbs = []
  for (const file of files) {
    thumbs.push(
      await sharp(path.join(appStoreDir, file))
        .resize({ width: 270, height: 585, fit: 'contain', background: '#E8E5DD' })
        .toBuffer(),
    )
  }
  const width = thumbs.length * 300 + 60
  await sharp({ create: { width, height: 645, channels: 4, background: '#E8E5DD' } })
    .composite(thumbs.map((input, index) => ({ input, left: 30 + index * 300, top: 30 })))
    .png()
    .toFile(path.join(sharedDir, 'store-screenshot-preview.png'))
}

async function main() {
  await buildIcons()
  for (let index = 0; index < screens.length; index += 1) {
    await buildPortrait(screens[index], index, 'app-store')
    await buildPortrait(screens[index], index, 'play-store')
  }
  await buildFeatureGraphic()
  await buildPreview()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
