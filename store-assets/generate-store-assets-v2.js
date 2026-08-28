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

const colors = {
  forest: '#102A1F',
  pine: '#173B2B',
  ink: '#151A17',
  paper: '#F2EFE7',
  chalk: '#FAF8F2',
  sage: '#DDE7DE',
  silver: '#E8EBE7',
  clay: '#EFE3DA',
  oxblood: '#A93428',
  white: '#FFFFFF',
}

const slides = [
  {
    filename: '01-anstoss.png',
    source: 'launch.png',
    kicker: 'THE CLUB, TOGETHER',
    title: ['Your club.', 'One place.'],
    note: 'Matchday, messages, squads and dues—together.',
    background: 'photo',
    foreground: colors.chalk,
    accent: '#D9E8D8',
  },
  {
    filename: '02-club-home.png',
    source: 'current-after-user.png',
    kicker: 'CLUB HOME',
    title: ['Matchday,', 'under control.'],
    note: 'The fixture and every action that matters, up front.',
    background: colors.paper,
    foreground: colors.forest,
    accent: colors.oxblood,
  },
  {
    filename: '03-events-rsvp.png',
    source: 'events.png',
    kicker: 'EVENTS + RSVP',
    title: ['Availability,', 'without chasing.'],
    note: 'Training, matches and attendance in one quiet timeline.',
    background: colors.sage,
    foreground: colors.forest,
    accent: '#2F6B45',
  },
  {
    filename: '04-team-chat.png',
    source: 'chat.png',
    kicker: 'TEAM CHAT',
    title: ['One room.', 'Everyone aligned.'],
    note: 'Channels for players, coaches and club staff.',
    background: colors.forest,
    foreground: colors.chalk,
    accent: '#BED3C2',
  },
  {
    filename: '05-squad.png',
    source: 'squad.png',
    kicker: 'SQUAD',
    title: ['Know your', 'squad.'],
    note: 'Invites, availability and roster health at a glance.',
    background: colors.silver,
    foreground: colors.ink,
    accent: '#536F5D',
  },
  {
    filename: '06-contributions.png',
    source: 'contributions.png',
    kicker: 'CONTRIBUTIONS',
    title: ['Dues,', 'made clear.'],
    note: 'See what is settled, overdue and still outstanding.',
    background: colors.clay,
    foreground: '#3B211C',
    accent: colors.oxblood,
  },
]

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function roundedMask(width, height, radius) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`,
  )
}

function grain(width, height, opacity = 0.035) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" seed="17"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" opacity="${opacity}"/>
    </svg>
  `)
}

function headerSvg({ canvas, slide, index, platform }) {
  const apple = platform === 'app-store'
  const x = apple ? (index % 2 === 0 ? 102 : 142) : index % 2 === 0 ? 70 : 96
  const top = apple ? 102 : 62
  const brandSize = apple ? 19 : 15
  const titleSize = apple ? 104 : 75
  const titleLine = apple ? 108 : 78
  const noteSize = apple ? 27 : 20
  const sequenceX = canvas.width - (apple ? 104 : 70)
  const titleY = top + (apple ? 150 : 108)
  const noteY = titleY + titleLine * slide.title.length + (apple ? 36 : 25)
  const pillW = apple ? 236 : 190
  const pillH = apple ? 48 : 38

  return Buffer.from(`
    <svg width="${canvas.width}" height="${apple ? 720 : 440}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${top}" width="${pillW}" height="${pillH}" rx="${pillH / 2}"
        fill="${slide.accent}" fill-opacity="${slide.background === 'photo' ? 0.18 : 0.13}"/>
      <circle cx="${x + (apple ? 24 : 20)}" cy="${top + pillH / 2}" r="${apple ? 5 : 4}" fill="${slide.accent}"/>
      <text x="${x + (apple ? 43 : 35)}" y="${top + pillH / 2 + (apple ? 7 : 5)}"
        fill="${slide.foreground}" font-family="Avenir Next" font-size="${brandSize}" font-weight="600" letter-spacing="3.3">${escapeXml(slide.kicker)}</text>
      <text x="${sequenceX}" y="${top + pillH / 2 + (apple ? 7 : 5)}" text-anchor="end"
        fill="${slide.foreground}" fill-opacity="0.58" font-family="Avenir Next" font-size="${brandSize}" letter-spacing="2">0${index + 1} / 06</text>
      <text x="${x}" y="${titleY}" fill="${slide.foreground}"
        font-family="Didot" font-size="${titleSize}" font-weight="700" letter-spacing="-3.5">
        ${slide.title.map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex === 0 ? 0 : titleLine}">${escapeXml(line)}</tspan>`).join('')}
      </text>
      <text x="${x}" y="${noteY}" fill="${slide.foreground}" fill-opacity="0.70"
        font-family="Avenir Next" font-size="${noteSize}" font-weight="500">${escapeXml(slide.note)}</text>
    </svg>
  `)
}

function bezelSvg(canvas, frame, dark) {
  const outer = dark ? '#294438' : '#D9D8D1'
  const middle = dark ? '#385448' : '#ECEAE4'
  const highlight = dark ? '#FFFFFF' : '#FFFFFF'
  return Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="ambient" x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="34" stdDeviation="45" flood-color="#07140E" flood-opacity="${dark ? 0.32 : 0.17}"/>
        </filter>
      </defs>
      <rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${frame.radius}"
        fill="${outer}" fill-opacity="0.94" filter="url(#ambient)"/>
      <rect x="${frame.x + 8}" y="${frame.y + 8}" width="${frame.width - 16}" height="${frame.height - 16}" rx="${frame.radius - 8}"
        fill="${middle}"/>
      <rect x="${frame.x + 16}" y="${frame.y + 16}" width="${frame.width - 32}" height="${frame.height - 32}" rx="${frame.radius - 16}"
        fill="#FFFFFF"/>
      <path d="M ${frame.x + frame.radius} ${frame.y + 8} H ${frame.x + frame.width - frame.radius}"
        stroke="${highlight}" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `)
}

async function preparedProduct(slide, width, height) {
  const sourcePath = path.join(sourceDir, slide.source)
  const metadata = await sharp(sourcePath).metadata()
  let top
  let bottom

  if (slide.source === 'launch.png') {
    top = 220
    bottom = 60
  } else if (slide.source === 'current-after-user.png') {
    top = 465
    bottom = 600
  } else {
    top = 560
    bottom = 60
  }

  let pipeline = sharp(sourcePath).extract({
    left: 0,
    top,
    width: metadata.width,
    height: metadata.height - top - bottom,
  })

  if (slide.source === 'current-after-user.png') {
    pipeline = pipeline.extend({ top: 72, bottom: 0, left: 0, right: 0, background: '#FFFFFF' })
  }

  return pipeline
    .resize(width, height, { fit: 'contain', position: 'top', background: '#FFFFFF' })
    .composite([{ input: roundedMask(width, height, 54), blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function photoBackground(canvas) {
  const photo = path.join(sourceDir, 'amateur-pitch-editorial-v2.png')
  const image = await sharp(photo)
    .resize(canvas.width, canvas.height, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.76, saturation: 0.78 })
    .png()
    .toBuffer()
  const wash = Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#071A12" stop-opacity="0.65"/>
          <stop offset="0.52" stop-color="#071A12" stop-opacity="0.32"/>
          <stop offset="1" stop-color="#071A12" stop-opacity="0.72"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#wash)"/>
    </svg>
  `)
  return { image, wash }
}

async function buildPortrait(slide, index, platform) {
  const apple = platform === 'app-store'
  const canvas = apple ? { width: 1290, height: 2796 } : { width: 1080, height: 1920 }
  const frame = slide.source === 'launch.png'
    ? apple
      ? { x: 210, y: 835, width: 870, height: 1700, radius: 78 }
      : { x: 190, y: 475, width: 700, height: 1345, radius: 64 }
    : apple
      ? { x: index % 2 === 0 ? 112 : 148, y: 795, width: 1058, height: 1800, radius: 78 }
      : { x: index % 2 === 0 ? 104 : 134, y: 475, width: 872, height: 1345, radius: 64 }
  const inset = apple ? 21 : 18
  const product = await preparedProduct(slide, frame.width - inset * 2, frame.height - inset * 2)
  const dark = slide.background === 'photo' || slide.background === colors.forest
  const composites = []

  if (slide.background === 'photo') {
    const photo = await photoBackground(canvas)
    composites.push({ input: photo.image, left: 0, top: 0 })
    composites.push({ input: photo.wash, left: 0, top: 0 })
  }

  composites.push({ input: grain(canvas.width, canvas.height, dark ? 0.026 : 0.032), left: 0, top: 0, blend: 'soft-light' })
  composites.push({ input: headerSvg({ canvas, slide, index, platform }), left: 0, top: 0 })
  composites.push({ input: bezelSvg(canvas, frame, dark), left: 0, top: 0 })
  composites.push({ input: product, left: frame.x + inset, top: frame.y + inset })

  const destination = platform === 'app-store' ? appStoreDir : playStoreDir
  await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: slide.background === 'photo' ? colors.forest : slide.background,
    },
  })
    .composite(composites)
    .flatten({ background: slide.background === 'photo' ? colors.forest : slide.background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(destination, slide.filename))
}

async function buildIcons() {
  const iconPath = path.join(root, '..', 'apps', 'mobile', 'assets', 'icon.png')
  await sharp(iconPath)
    .resize(1024, 1024, { fit: 'cover' })
    .flatten({ background: colors.white })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(appStoreDir, 'app-icon-1024.png'))
  await sharp(iconPath)
    .resize(512, 512, { fit: 'cover' })
    .flatten({ background: colors.white })
    .ensureAlpha(1)
    .png({ compressionLevel: 9 })
    .toFile(path.join(playStoreDir, 'play-icon-512.png'))
}

async function buildFeatureGraphic() {
  const canvas = { width: 1024, height: 500 }
  const photo = await photoBackground(canvas)
  const event = await preparedProduct(slides[2], 274, 434)
  const chat = await preparedProduct(slides[3], 232, 368)
  const icon = await sharp(path.join(root, '..', 'apps', 'mobile', 'assets', 'icon.png'))
    .resize(66, 66)
    .composite([{ input: roundedMask(66, 66, 18), blend: 'dest-in' }])
    .png()
    .toBuffer()
  const shell = Buffer.from(`
    <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="s" x="-30%" y="-30%" width="160%" height="190%"><feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#03100A" flood-opacity="0.38"/></filter>
      </defs>
      <rect x="589" y="18" width="294" height="470" rx="42" fill="#345043" filter="url(#s)"/>
      <rect x="599" y="28" width="274" height="450" rx="34" fill="#fff"/>
      <rect x="805" y="78" width="252" height="408" rx="38" fill="#DCE3DD" filter="url(#s)"/>
      <rect x="815" y="88" width="232" height="388" rx="30" fill="#fff"/>
    </svg>
  `)
  const copy = Buffer.from(`
    <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
      <text x="145" y="66" fill="#FAF8F2" font-family="Avenir Next" font-size="17" font-weight="600" letter-spacing="3.5">ANSTOSS · CLUB OPERATIONS</text>
      <text x="60" y="177" fill="#FAF8F2" font-family="Didot" font-size="58" font-weight="700" letter-spacing="-2">Made for the people</text>
      <text x="60" y="237" fill="#FAF8F2" font-family="Didot" font-size="58" font-weight="700" letter-spacing="-2">who run the club.</text>
      <text x="60" y="302" fill="#FAF8F2" fill-opacity="0.72" font-family="Avenir Next" font-size="21">Fixtures · squads · chat · contributions</text>
      <rect x="60" y="363" width="205" height="56" rx="28" fill="#FAF8F2"/>
      <circle cx="90" cy="391" r="6" fill="#A93428"/>
      <text x="108" y="399" fill="#102A1F" font-family="Avenir Next" font-size="18" font-weight="600">One club. In sync.</text>
    </svg>
  `)

  await sharp(photo.image)
    .composite([
      { input: photo.wash, left: 0, top: 0 },
      { input: grain(canvas.width, canvas.height, 0.025), left: 0, top: 0, blend: 'soft-light' },
      { input: shell, left: 0, top: 0 },
      { input: event, left: 599, top: 28 },
      { input: chat, left: 815, top: 88 },
      { input: icon, left: 60, top: 24 },
      { input: copy, left: 0, top: 0 },
    ])
    .flatten({ background: colors.forest })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(playStoreDir, 'feature-graphic-1024x500.png'))
}

async function buildPreview() {
  const files = slides.map((slide) => slide.filename)
  const thumbs = []
  for (const file of files) {
    thumbs.push(
      await sharp(path.join(appStoreDir, file))
        .resize({ width: 270, height: 585, fit: 'contain', background: '#DCD9D0' })
        .toBuffer(),
    )
  }
  const width = thumbs.length * 300 + 60
  await sharp({ create: { width, height: 645, channels: 4, background: '#DCD9D0' } })
    .composite(thumbs.map((input, index) => ({ input, left: 30 + index * 300, top: 30 })))
    .flatten({ background: '#DCD9D0' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(sharedDir, 'store-screenshot-preview.png'))
}

async function main() {
  await buildIcons()
  for (let index = 0; index < slides.length; index += 1) {
    await buildPortrait(slides[index], index, 'app-store')
    await buildPortrait(slides[index], index, 'play-store')
  }
  await buildFeatureGraphic()
  await buildPreview()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
