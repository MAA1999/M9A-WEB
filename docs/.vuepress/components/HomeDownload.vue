<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const phase = ref<Phase>('idle')
const lang = ref<'zh' | 'en'>('zh')
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
  lang.value = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  detected.value = await detectPlatform()
  await load()
})
</script>

<template>
  <section class="hd">
    <header class="hd-head">
      <h2 class="hd-title">
        {{ L.heading }}
      </h2>
      <p v-if="release" class="hd-version">
        <a :href="release.html_url" target="_blank" rel="noopener noreferrer">{{ release.version }}</a>
        <span v-if="releasedDate">&nbsp;· {{ releasedDate }}</span>
      </p>
    </header>

    <div class="hd-actions">
      <a v-if="cta" class="hd-cta" :href="cta.url" target="_blank" rel="noopener noreferrer">
        <svg class="hd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span class="hd-cta-label">{{ cta.label }}</span>
        <span class="hd-cta-size">{{ cta.size }}</span>
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
          <span class="hd-cta-label">{{ L.macArm }}</span>
          <span class="hd-cta-size">{{ formatSize(macArmBuild.size) }}</span>
        </a>
        <a
          v-if="macIntelBuild"
          class="hd-cta hd-cta-quiet"
          :href="macIntelBuild.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="hd-cta-label">{{ L.macIntel }}</span>
          <span class="hd-cta-size">{{ formatSize(macIntelBuild.size) }}</span>
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
        {{ L.mirror }}<span class="hd-mirror-hint">{{ L.mirrorHint }}</span>
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

    <div v-if="platforms.length" class="hd-platforms">
      <span class="hd-platforms-label">{{ L.platformLabel }}</span>
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
    </details>
  </section>
</template>

<style scoped>
.hd {
  margin: 0;
}

.hd-head {
  display: flex;
  align-items: baseline;
  gap: 4px 12px;
  flex-wrap: wrap;
}

.hd-title {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}

.hd-version {
  margin: 0;
  font-size: 13px;
  color: var(--vp-c-text-3);
}

.hd-version a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dashed currentcolor;
}

/* 主行动区 */
.hd-actions {
  display: flex;
  align-items: center;
  gap: 12px 24px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.hd-cta {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 0 26px;
  border: 1px solid var(--vp-button-brand-border);
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  color: var(--vp-button-brand-text);
  background-color: var(--vp-button-brand-bg);
  transition: background-color var(--vp-t-color), border-color var(--vp-t-color);
}

.hd-cta:hover {
  color: var(--vp-button-brand-hover-text);
  background-color: var(--vp-button-brand-hover-bg);
  border-color: var(--vp-button-brand-hover-border);
}

.hd-cta-quiet {
  color: var(--vp-button-alt-text);
  background-color: var(--vp-button-alt-bg);
  border-color: var(--vp-button-alt-border);
}

.hd-cta-quiet:hover {
  color: var(--vp-button-alt-hover-text);
  background-color: var(--vp-button-alt-hover-bg);
  border-color: var(--vp-button-alt-hover-border);
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

.hd-cta-size {
  padding-left: 12px;
  border-left: 1px solid rgb(255 255 255 / 30%);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.hd-cta-quiet .hd-cta-size {
  border-left-color: var(--vp-c-divider);
  opacity: 1;
  color: var(--vp-c-text-3);
}

.hd-mirror {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.hd-mirror:hover {
  text-decoration: underline;
}

.hd-mirror-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--vp-c-text-3);
}

/* 状态 */
.hd-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.hd-status-failed {
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

.hd-mac-hint,
.hd-cross-arch {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

/* 平台切换：普通按钮组，不假装成 tablist */
.hd-platforms {
  display: flex;
  align-items: center;
  gap: 6px 14px;
  flex-wrap: wrap;
  margin-top: 20px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.hd-platform {
  padding: 0;
  border: 0;
  font: inherit;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  background: none;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.hd-platform[aria-pressed='true'] {
  color: var(--vp-c-text-1);
  font-weight: 600;
  text-decoration: none;
  cursor: default;
}

.hd-detected {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.hd-note {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

/* 全部构建 */
.hd-details {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--vp-c-divider);
}

.hd-details summary {
  font-size: 13px;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.hd-details summary:hover {
  color: var(--vp-c-brand-1);
}

.hd-table {
  display: table;
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 13px;
}

.hd-table th {
  padding: 6px 10px 6px 0;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  text-align: left;
}

.hd-table td {
  padding: 9px 10px 9px 0;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  vertical-align: middle;
}

.hd-table tr:last-child td {
  border-bottom: 0;
}

.hd-row-os {
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.hd-row-build {
  margin-left: 6px;
  color: var(--vp-c-text-3);
}

.hd-table .hd-col-size {
  width: 110px;
  padding-right: 0;
}

.hd-table .hd-col-download {
  width: 72px;
  padding-right: 0;
  text-align: right;
}

.hd-num {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.hd-table a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  white-space: nowrap;
}

.hd-table a:hover {
  text-decoration: underline;
}

.hd-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .hd-cta {
    width: 100%;
    justify-content: center;
  }

  .hd-mirror {
    width: 100%;
    justify-content: center;
  }

  .hd-detected {
    display: none;
  }

  .hd-table .hd-col-size {
    width: 84px;
  }

  .hd-table .hd-col-download {
    width: 60px;
  }
}
</style>
