<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vuepress/client'
import {
  type ApkAbi,
  type ApkBuild,
  type Arch,
  type DesktopBuild,
  type Detected,
  type Os,
  type ReleaseInfo,
  availablePlatforms,
  detectPlatform,
  formatSize,
  orderApks,
  orderDesktopBuilds,
  parseAssets,
  preferredApk,
  preferredBuild,
} from '../utils/downloadPlatform'

const RELEASES_URL = 'https://github.com/MAA1999/M9A/releases'

/**
 * 聚合接口由 M9A-API 生成（见该仓库 tools/generate_version.py）。
 * 站点不把 api.github.com 当主数据源：它有 60 次/小时/IP 的匿名限流，
 * 且在国内网络下经常不可达。GitHub 只作为聚合文件上线前的回落。
 */
const API_ENDPOINTS = [
  'https://api.1999.fan/api/version/stable.json',
  'https://api.github.com/repos/MAA1999/M9A/releases/latest',
]

const CACHE_KEY = 'm9a-latest-release'
const CACHE_TTL = 10 * 60 * 1000
const REQUEST_TIMEOUT = 8000

const OS_LABEL: Record<Os, string> = {
  win: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
}
const ARCH_LABEL: Record<Arch, string> = { x86_64: 'x64', aarch64: 'ARM64' }
const FLAVOR_LABEL = { MFAA: 'MFAAvalonia', MXU: 'MXU' } as const
const ABI_LABEL: Record<ApkAbi, string> = {
  'arm64-v8a': 'ARM64',
  'universal': '通用包',
  'x86_64': 'x64',
}
const MIRROR_OS: Record<Os, string> = {
  win: 'windows',
  macos: 'macos',
  linux: 'linux',
  android: 'android',
}
const MIRROR_ARCH: Record<Arch, string> = { x86_64: 'x64', aarch64: 'arm64' }

/**
 * 首页是中英共享的语言选择页，所以只有短标签保留双语；
 * 成句的文案按浏览器语言二选一，不再并排。
 */
const STRINGS = {
  zh: {
    heading: '下载 M9A',
    releaseNotes: '查看该版本的更新日志',
    allReleases: '在 GitHub 查看全部发行版',
    platformLabel: '平台：',
    detected: '已匹配当前系统',
    allBuilds: '全部构建 / 直接下载其他版本',
    colBuild: '构建',
    colSize: '大小',
    colDownload: '下载',
    loading: '正在获取最新版本…',
    failed: '未取到版本信息，可先用下面的入口下载。',
    retry: '重试',
    fallbackCta: '前往下载页',
    fallbackCtaEn: 'Downloads',
    mirror: 'Mirror酱 高速下载',
    mirrorHint: '国内推荐',
    note: 'MFAAvalonia 与 MXU 只是界面不同，功能一致，默认提供 MFAAvalonia；需要 MXU 请展开下方「全部构建」。',
    macHint: '无法自动识别 Mac 芯片类型：在「关于本机」中查看，或点下面任一项。',
    macArm: '下载 macOS · Apple 芯片',
    macIntel: '下载 macOS · Intel',
    crossArch: '该构建与当前系统架构不一致，可能无法运行。',
    ctaDesktop: (os: string, arch: string) => `下载 ${os} ${arch} 版`,
    ctaAndroid: (abi: string) => `下载 Android APK · ${abi}`,
  },
  en: {
    heading: 'Download M9A',
    releaseNotes: 'Release notes for this version',
    allReleases: 'All releases on GitHub',
    platformLabel: 'Platform:',
    detected: 'matched to this device',
    allBuilds: 'All builds / other versions',
    colBuild: 'Build',
    colSize: 'Size',
    colDownload: 'Download',
    loading: 'Fetching the latest release…',
    failed: 'Release info unavailable — use the entry below for now.',
    retry: 'Retry',
    fallbackCta: 'Downloads',
    fallbackCtaEn: '',
    mirror: 'MirrorChyan (fast mirror)',
    mirrorHint: 'for China',
    note: 'MFAAvalonia and MXU differ only in UI; features are identical. MFAAvalonia is provided by default — expand “All builds” for MXU.',
    macHint: 'Could not detect your Mac chip. Check “About This Mac”, or pick one below.',
    macArm: 'Download macOS · Apple silicon',
    macIntel: 'Download macOS · Intel',
    crossArch: 'This build does not match your architecture and may not run.',
    ctaDesktop: (os: string, arch: string) => `Download for ${os} ${arch}`,
    ctaAndroid: (abi: string) => `Download Android APK · ${abi}`,
  },
} as const

type Phase = 'idle' | 'loading' | 'ready'

/**
 * 路由前缀优先：/zh_cn/、/en_us/ 是用户主动选择的语言，初始值在服务端渲染时就定下，
 * 英文首页不会先闪一下中文。只有语言中立的首页 `/` 在挂载后按浏览器语言猜测。
 */
const route = useRoute()
const lang = ref<'zh' | 'en'>(route.path.startsWith('/en_us/') ? 'en' : 'zh')

const phase = ref<Phase>('idle')
const release = ref<ReleaseInfo | null>(null)
const desktop = ref<DesktopBuild[]>([])
const apk = ref<ApkBuild[]>([])
const detected = ref<Detected>({ os: 'unknown', arch: 'unknown' })
const activeOs = ref<Os | null>(null)
const failed = ref(false)

const L = computed(() => STRINGS[lang.value])
const platforms = computed(() => availablePlatforms(desktop.value, apk.value))

const activeArch = computed<Arch | 'unknown'>(() => {
  const os = activeOs.value
  if (!os || os === 'android') return 'unknown'
  if (os === 'macos') {
    // 只有确知本机就是这台 Mac 时才采信检测结果；否则让用户在两个构建里
    // 自己选（Safari / Firefox 给不出架构信息，猜错就是下到一个跑不起来的包）。
    return detected.value.os === 'macos' && detected.value.arch !== 'unknown'
      ? detected.value.arch
      : 'unknown'
  }
  if (os === detected.value.os && detected.value.arch !== 'unknown') {
    return detected.value.arch
  }
  return 'x86_64'
})

const activeBuild = computed<DesktopBuild | null>(() => {
  const os = activeOs.value
  if (!os || os === 'android') return null
  const arch = activeArch.value
  if (arch === 'unknown') return null
  // 末尾的退回只在该平台仅有一个架构时生效，不会把 ARM 用户送去下 x64 包。
  const osBuilds = desktop.value.filter((build) => build.os === os)
  const singleArch = new Set(osBuilds.map((build) => build.arch)).size === 1
  return preferredBuild(desktop.value, os, arch)
    ?? (singleArch ? osBuilds[0] : null)
    ?? null
})

const needsArchChoice = computed(
  () => phase.value === 'ready' && activeOs.value === 'macos' && activeArch.value === 'unknown',
)
const macArmBuild = computed(() => preferredBuild(desktop.value, 'macos', 'aarch64'))
const macIntelBuild = computed(() => preferredBuild(desktop.value, 'macos', 'x86_64'))

interface Cta {
  url: string
  label: string
  size: string
  crossArch: boolean
}

const cta = computed<Cta | null>(() => {
  if (phase.value !== 'ready') return null
  const os = activeOs.value
  if (!os) return null

  if (os === 'android') {
    const abi: ApkAbi | undefined =
      detected.value.os === 'android' && detected.value.arch !== 'unknown'
        ? detected.value.arch === 'aarch64' ? 'arm64-v8a' : 'x86_64'
        : undefined
    const build = preferredApk(apk.value, abi)
    if (!build) return null
    return {
      url: build.url,
      label: L.value.ctaAndroid(ABI_LABEL[build.abi]),
      size: formatSize(build.size),
      crossArch: false,
    }
  }

  const build = activeBuild.value
  if (!build) return null
  return {
    url: build.url,
    label: L.value.ctaDesktop(OS_LABEL[build.os], ARCH_LABEL[build.arch]),
    size: formatSize(build.size),
    crossArch:
      detected.value.os === build.os
      && detected.value.arch !== 'unknown'
      && detected.value.arch !== build.arch,
  }
})

const mirrorUrl = computed(() => {
  const params = new URLSearchParams({ rid: 'M9A', source: 'm9aweb-home' })
  const os = activeOs.value
  if (os && os !== 'android') {
    params.set('os', MIRROR_OS[os])
    params.set('channel', 'stable')
    const arch = activeArch.value
    if (arch !== 'unknown') params.set('arch', MIRROR_ARCH[arch])
  }
  return `https://mirrorchyan.com/${lang.value}/projects?${params.toString()}`
})

const releasedDate = computed(() =>
  release.value?.published_at ? release.value.published_at.slice(0, 10) : '',
)

interface AssetRow {
  key: string
  os: string
  build: string
  size: string
  url: string
}

const assetRows = computed<AssetRow[]>(() => [
  ...orderDesktopBuilds(desktop.value).map((build) => ({
    key: `${build.os}-${build.arch}-${build.flavor}`,
    os: `${OS_LABEL[build.os]} ${ARCH_LABEL[build.arch]}`,
    build: FLAVOR_LABEL[build.flavor],
    size: formatSize(build.size),
    url: build.url,
  })),
  ...orderApks(apk.value).map((build) => ({
    key: `android-${build.abi}`,
    os: 'Android',
    build: `APK · ${ABI_LABEL[build.abi]}`,
    size: formatSize(build.size),
    url: build.url,
  })),
])

function selectOs(os: Os) {
  activeOs.value = os
}

interface RawAsset {
  name?: string
  size?: number
  url?: string
  browser_download_url?: string
}

/** 同时兼容聚合接口的裁剪 schema 与 GitHub 原生响应。 */
function normalize(raw: Record<string, unknown>): ReleaseInfo | null {
  const version = (raw.version ?? raw.tag_name) as string | undefined
  const rawAssets = raw.assets
  if (!version || !Array.isArray(rawAssets)) return null

  const assets = (rawAssets as RawAsset[])
    .map((asset) => ({
      name: asset.name ?? '',
      size: asset.size ?? 0,
      url: asset.browser_download_url ?? asset.url ?? '',
    }))
    .filter((asset) => asset.name && asset.url)

  if (!assets.length) return null

  return {
    version,
    published_at: (raw.published_at as string) ?? '',
    html_url: (raw.html_url as string) ?? RELEASES_URL,
    assets,
  }
}

function readCache(): ReleaseInfo | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (!cached) return null
    const { data, ts } = JSON.parse(cached) as { data: ReleaseInfo; ts: number }
    if (Date.now() - ts < CACHE_TTL) return data
    sessionStorage.removeItem(CACHE_KEY)
  }
  catch {
    try {
      sessionStorage.removeItem(CACHE_KEY)
    }
    catch {
      // 存储完全不可用时忽略缓存。
    }
  }
  return null
}

function writeCache(info: ReleaseInfo) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: info, ts: Date.now() }))
  }
  catch {
    // 隐私模式下 sessionStorage 可能不可写，缓存失败不影响功能。
  }
}

async function fetchRelease(): Promise<ReleaseInfo | null> {
  for (const endpoint of API_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    try {
      const response = await fetch(endpoint, { signal: controller.signal })
      if (!response.ok) continue
      const info = normalize((await response.json()) as Record<string, unknown>)
      if (info) return info
    }
    catch {
      // 换下一个端点
    }
    finally {
      clearTimeout(timer)
    }
  }
  return null
}

function apply(info: ReleaseInfo) {
  release.value = info
  const parsed = parseAssets(info.assets)
  desktop.value = parsed.desktop
  apk.value = parsed.apk

  const list = availablePlatforms(parsed.desktop, parsed.apk)
  const detectedOs = detected.value.os
  activeOs.value = list.includes(detectedOs as Os)
    ? (detectedOs as Os)
    : (list[0] ?? null)
  phase.value = 'ready'
}

async function load(force = false) {
  phase.value = 'loading'
  failed.value = false

  if (!force) {
    const cached = readCache()
    if (cached) {
      apply(cached)
      return
    }
  }

  const info = await fetchRelease()
  if (info) {
    writeCache(info)
    apply(info)
    return
  }

  failed.value = true
  phase.value = 'idle'
}

onMounted(async () => {
  if (!/^\/(?:en_us|zh_cn)\//.test(route.path)) {
    lang.value = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  detected.value = await detectPlatform()
  await load()
})
</script>

<template>
  <section class="hd" aria-labelledby="hd-title">
    <header class="hd-head">
      <h2 id="hd-title" class="hd-title">
        {{ L.heading }}
      </h2>
      <p v-if="release" class="hd-meta">
        <a
          class="hd-version"
          :href="release.html_url"
          :title="L.releaseNotes"
          target="_blank"
          rel="noopener noreferrer"
        >{{ release.version }}</a>
        <span v-if="releasedDate" class="hd-date">{{ releasedDate }}</span>
      </p>
    </header>

    <div class="hd-actions">
      <a v-if="cta" class="hd-cta" :href="cta.url" target="_blank" rel="noopener noreferrer">
        <svg class="hd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span class="hd-cta-text">
          <span class="hd-cta-label">{{ cta.label }}</span>
          <span class="hd-cta-size">{{ cta.size }}</span>
        </span>
      </a>

      <template v-else-if="needsArchChoice">
        <a
          v-if="macArmBuild"
          class="hd-cta"
          :href="macArmBuild.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg class="hd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span class="hd-cta-text">
            <span class="hd-cta-label">{{ L.macArm }}</span>
            <span class="hd-cta-size">{{ formatSize(macArmBuild.size) }}</span>
          </span>
        </a>
        <a
          v-if="macIntelBuild"
          class="hd-cta hd-cta-quiet"
          :href="macIntelBuild.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="hd-cta-text">
            <span class="hd-cta-label">{{ L.macIntel }}</span>
            <span class="hd-cta-size">{{ formatSize(macIntelBuild.size) }}</span>
          </span>
        </a>
      </template>

      <a v-else class="hd-cta" :href="RELEASES_URL" target="_blank" rel="noopener noreferrer">
        <svg class="hd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span class="hd-cta-label">
          {{ L.fallbackCta }}<span v-if="L.fallbackCtaEn" class="hd-cta-label-en">{{ L.fallbackCtaEn }}</span>
        </span>
      </a>

      <a class="hd-mirror" :href="mirrorUrl" target="_blank" rel="noopener noreferrer">
        <span class="hd-mirror-label">{{ L.mirror }}</span>
        <span class="hd-mirror-hint">{{ L.mirrorHint }}</span>
      </a>
    </div>

    <p v-if="phase === 'loading'" class="hd-status" role="status" aria-live="polite">
      <span class="hd-spinner" aria-hidden="true" />{{ L.loading }}
    </p>
    <p v-else-if="failed" class="hd-status hd-status-failed">
      <span role="status" aria-live="polite">{{ L.failed }}</span>
      <button type="button" class="hd-retry" @click="load(true)">{{ L.retry }}</button>
    </p>

    <p v-if="needsArchChoice" class="hd-mac-hint">
      {{ L.macHint }}
    </p>
    <p v-else-if="cta && cta.crossArch" class="hd-cross-arch">
      {{ L.crossArch }}
    </p>

    <!-- 平台切换：普通按钮组（aria-pressed），外观是分段控件，不假装成 tablist -->
    <div v-if="platforms.length" class="hd-platforms">
      <span id="hd-platforms-label" class="hd-platforms-label">{{ L.platformLabel }}</span>
      <div class="hd-segmented" role="group" aria-labelledby="hd-platforms-label">
        <button
          v-for="os in platforms"
          :key="os"
          type="button"
          class="hd-platform"
          :aria-pressed="activeOs === os"
          @click="selectOs(os)"
        >
          {{ OS_LABEL[os] }}
        </button>
      </div>
      <span v-if="activeOs && activeOs === detected.os" class="hd-detected">{{ L.detected }}</span>
    </div>

    <p v-if="phase === 'ready'" class="hd-note">
      {{ L.note }}
    </p>

    <details v-if="assetRows.length" class="hd-details">
      <summary>{{ L.allBuilds }}</summary>
      <table class="hd-table">
        <thead>
          <tr>
            <th scope="col">{{ L.colBuild }}</th>
            <th scope="col" class="hd-col-size">{{ L.colSize }}</th>
            <th scope="col" class="hd-col-download"><span class="hd-visually-hidden">{{ L.colDownload }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in assetRows" :key="row.key">
            <td>
              <span class="hd-row-os">{{ row.os }}</span>
              <span class="hd-row-build">· {{ row.build }}</span>
            </td>
            <td class="hd-col-size hd-num">{{ row.size }}</td>
            <td class="hd-col-download">
              <a :href="row.url" target="_blank" rel="noopener noreferrer">{{ L.colDownload }}</a>
            </td>
          </tr>
        </tbody>
      </table>
      <a class="hd-all-releases" :href="RELEASES_URL" target="_blank" rel="noopener noreferrer">{{ L.allReleases }} →</a>
    </details>
  </section>
</template>

<!--
  组件渲染在首页的 .vp-doc 里，主题的 .vp-doc h2 / p / a / table / summary 规则都会作用到这里，
  其中 .vp-doc h2:first-of-type、.vp-doc tr:nth-child(2n) 的特异性不低于单个 scoped 类。
  下面与它们冲突的规则统一加 .hd 前缀，确保生效。
-->
<style scoped>
/* 版本号、「国内推荐」这类小标签的配色。卡片底色是浅灰，主题的 brand-soft 叠在上面
   配品牌色文字不到 4.5:1，这里单独取值：浅色 5.6:1，暗色 6.2:1。 */
.hd {
  --hd-accent-text: #2f6077;
  --hd-accent-bg: rgb(80 134 161 / 0.12);
}

[data-theme='dark'] .hd {
  --hd-accent-text: var(--vp-c-brand-1);
  --hd-accent-bg: rgb(131 208 218 / 0.16);
}

.hd {
  margin: 0;
  padding: 24px 28px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background-color: var(--vp-c-bg-soft);
  transition: background-color var(--vp-t-color), border-color var(--vp-t-color);
}

.hd-head {
  display: flex;
  align-items: center;
  gap: 6px 12px;
  flex-wrap: wrap;
}

.hd .hd-title {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
  color: var(--vp-c-text-1);
}

.hd .hd-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--vp-c-text-2);
}

.hd .hd-version {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--hd-accent-text);
  background-color: var(--hd-accent-bg);
  text-decoration: none;
}

.hd .hd-version:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hd-date {
  font-variant-numeric: tabular-nums;
}

/* 主行动区：主按钮是当前系统的安装包，Mirror酱是同高的次按钮 */
.hd-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.hd .hd-cta,
.hd .hd-mirror {
  display: inline-flex;
  align-items: center;
  min-height: 52px;
  border-radius: 12px;
  text-decoration: none;
  transition:
    color var(--vp-t-color),
    background-color var(--vp-t-color),
    border-color var(--vp-t-color),
    box-shadow 0.2s ease,
    transform 0.1s ease;
}

.hd .hd-cta {
  gap: 12px;
  padding: 0 24px;
  border: 1px solid var(--vp-button-brand-border);
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-button-brand-text);
  background-color: var(--vp-button-brand-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

.hd .hd-cta:hover {
  color: var(--vp-button-brand-hover-text);
  background-color: var(--vp-button-brand-hover-bg);
  border-color: var(--vp-button-brand-hover-border);
  box-shadow: 0 6px 16px -6px var(--vp-c-brand-1);
}

.hd .hd-cta:active,
.hd .hd-mirror:active {
  transform: translateY(1px);
}

.hd .hd-cta-quiet {
  color: var(--vp-button-alt-text);
  background-color: var(--vp-button-alt-bg);
  border-color: var(--vp-button-alt-border);
  box-shadow: none;
}

.hd .hd-cta-quiet:hover {
  color: var(--vp-button-alt-hover-text);
  background-color: var(--vp-button-alt-hover-bg);
  border-color: var(--vp-button-alt-hover-border);
  box-shadow: none;
}

.hd .hd-cta:focus-visible,
.hd .hd-mirror:focus-visible,
.hd .hd-platform:focus-visible,
.hd .hd-details summary:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.hd-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.hd-cta-label-en {
  margin-left: 6px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0.8;
}

/* 桌面端标签与大小并排，窄屏改为上下两行（见下方 ≤640 档） */
.hd-cta-text {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.hd-cta-label,
.hd-cta-size {
  white-space: nowrap;
}

/* 分隔线跟随按钮文字色：浅色模式按钮是白字，暗色模式是深字 */
.hd-cta-size {
  padding-left: 12px;
  border-left: 1px solid rgb(128 128 128 / 40%);
  border-left-color: color-mix(in srgb, currentcolor 35%, transparent);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.hd .hd-cta-quiet .hd-cta-size {
  border-left-color: var(--vp-c-divider);
  opacity: 1;
  color: var(--vp-c-text-2);
}

.hd .hd-mirror {
  gap: 8px;
  padding: 0 20px;
  border: 1px solid var(--vp-c-divider);
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg);
}

.hd .hd-mirror:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.hd-mirror-hint {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--hd-accent-text);
  background-color: var(--hd-accent-bg);
}

/* 状态 */
.hd .hd-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.hd .hd-status-failed {
  color: var(--vp-c-text-1);
}

.hd-spinner {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  border: 2px solid var(--vp-c-brand-soft);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: hd-spin 0.8s linear infinite;
}

@keyframes hd-spin {
  to {
    transform: rotate(360deg);
  }
}

.hd-retry {
  padding: 0;
  border: 0;
  font: inherit;
  color: var(--vp-c-brand-1);
  background: none;
  text-decoration: underline;
  cursor: pointer;
}

.hd .hd-mac-hint,
.hd .hd-cross-arch {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.hd .hd-cross-arch {
  color: var(--vp-c-warning-1);
}

/* 平台切换 */
.hd-platforms {
  display: flex;
  align-items: center;
  gap: 8px 12px;
  flex-wrap: wrap;
  margin-top: 18px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.hd-segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background-color: var(--vp-c-default-soft);
}

.hd .hd-platform {
  padding: 4px 12px;
  border: 0;
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  background-color: transparent;
  cursor: pointer;
  transition: color var(--vp-t-color), background-color var(--vp-t-color);
}

.hd .hd-platform:hover {
  color: var(--vp-c-text-1);
}

.hd .hd-platform[aria-pressed='true'] {
  font-weight: 600;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-1);
  cursor: default;
}

.hd-detected {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.hd-detected::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--vp-c-success-1);
  content: '';
}

.hd .hd-note {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

/* 全部构建 */
.hd-details {
  margin-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.hd .hd-details summary {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 0;
  padding: 12px 0 0;
  list-style: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
}

.hd .hd-details summary::-webkit-details-marker {
  display: none;
}

.hd .hd-details summary::before {
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentcolor;
  border-bottom: 1.5px solid currentcolor;
  content: '';
  transform: rotate(-45deg);
  transition: transform 0.2s ease;
}

.hd .hd-details[open] summary::before {
  transform: rotate(45deg);
}

.hd .hd-details summary:hover {
  color: var(--vp-c-brand-1);
}

.hd .hd-table {
  display: table;
  width: 100%;
  margin: 10px 0 0;
  border-collapse: collapse;
  font-size: 13px;
}

.hd .hd-table tr {
  border: 0;
  background-color: transparent;
}

.hd .hd-table th,
.hd .hd-table td {
  min-width: 0;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  word-break: normal;
  background-color: transparent;
  vertical-align: middle;
}

.hd .hd-table th {
  padding: 6px 10px 6px 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  text-align: left;
}

.hd .hd-table td {
  padding: 9px 10px 9px 0;
  color: var(--vp-c-text-2);
}

.hd .hd-table tbody tr:last-child td {
  border-bottom: 0;
}

.hd-row-os {
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.hd-row-build {
  margin-left: 6px;
}

.hd .hd-table .hd-col-size {
  width: 110px;
  padding-right: 0;
}

.hd .hd-table .hd-col-download {
  width: 72px;
  padding-right: 0;
  text-align: right;
}

.hd-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.hd .hd-table a,
.hd .hd-all-releases {
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  white-space: nowrap;
}

.hd .hd-table a:hover,
.hd .hd-all-releases:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hd .hd-all-releases {
  display: inline-block;
  margin-top: 10px;
  font-size: 13px;
}

.hd-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .hd .hd-cta,
  .hd .hd-mirror,
  .hd .hd-details summary::before {
    transition: none;
  }
}

@media (max-width: 640px) {
  .hd {
    padding: 20px 16px 16px;
    border-radius: 14px;
  }

  .hd .hd-cta,
  .hd .hd-mirror {
    width: 100%;
    justify-content: center;
  }

  /* 「下载 Android APK · ARM64」加上大小在 360px 宽的手机上放不进一行，
     折行会把「版」「MB」单独甩到第二行。大小改为标签下方的第二行。 */
  .hd .hd-cta {
    min-height: 58px;
    padding: 8px 16px;
  }

  .hd-cta-text {
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }

  .hd .hd-cta-size,
  .hd .hd-cta-quiet .hd-cta-size {
    padding-left: 0;
    border-left: 0;
    font-size: 12px;
    line-height: 1.4;
  }

  .hd .hd-mirror {
    min-height: 46px;
  }

  /* 标签仍经 aria-labelledby 读给读屏器，只是不占窄屏的一行 */
  .hd-platforms-label {
    display: none;
  }

  .hd .hd-table .hd-col-size {
    width: 84px;
  }

  .hd .hd-table .hd-col-download {
    width: 60px;
  }
}

/* 大屏整页放大一档（配合 theme/styles/custom.css 的 ≥1920 档），
   大视口靠内容变大填满，而不是原尺寸留大片空白 */
@media (min-width: 1920px) {
  .hd {
    padding: 30px 36px 24px;
  }

  .hd .hd-title {
    font-size: 24px;
  }

  .hd .hd-meta {
    font-size: 14px;
  }

  .hd .hd-cta,
  .hd .hd-mirror {
    min-height: 58px;
  }

  .hd .hd-cta {
    padding: 0 30px;
    font-size: 17px;
  }

  .hd .hd-mirror {
    font-size: 16px;
  }

  .hd-icon {
    width: 22px;
    height: 22px;
  }

  .hd-cta-size {
    font-size: 14px;
  }

  .hd .hd-status,
  .hd .hd-note,
  .hd .hd-mac-hint,
  .hd .hd-cross-arch,
  .hd-platforms,
  .hd .hd-platform,
  .hd .hd-details summary,
  .hd .hd-table,
  .hd .hd-all-releases {
    font-size: 14px;
  }
}
</style>
