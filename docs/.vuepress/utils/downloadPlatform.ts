/**
 * 平台识别与 Release 资产匹配。
 *
 * 这里只做纯逻辑，不渲染任何东西，便于单独验证。
 */

export type Os = 'win' | 'macos' | 'linux' | 'android'
export type Arch = 'x86_64' | 'aarch64'
export type Flavor = 'MFAA' | 'MXU'
export type ApkAbi = 'arm64-v8a' | 'universal' | 'x86_64'

export interface ReleaseAsset {
  name: string
  size: number
  url: string
}

export interface ReleaseInfo {
  version: string
  published_at: string
  html_url: string
  assets: ReleaseAsset[]
}

export interface DesktopBuild {
  os: Os
  arch: Arch
  flavor: Flavor
  url: string
  size: number
}

export interface ApkBuild {
  abi: ApkAbi
  url: string
  size: number
}

export interface Detected {
  os: Os | 'unknown'
  /**
   * `unknown` 主要出现在 macOS：Safari / Firefox 不提供 userAgentData，
   * 而 UA 字符串也不区分 Apple 芯片与 Intel。此时交给用户选，不做猜测。
   */
  arch: Arch | 'unknown'
}

const DESKTOP_PATTERN = /^M9A-(win|macos|linux)-(x86_64|aarch64)-v[\d.]+-(MFAA|MXU)\./i
const APK_PATTERN = /^M9A-v[\d.]+-(arm64-v8a|x86_64|universal)\.apk$/i

export function parseAssets(assets: ReleaseAsset[]): {
  desktop: DesktopBuild[]
  apk: ApkBuild[]
} {
  const desktop: DesktopBuild[] = []
  const apk: ApkBuild[] = []

  for (const asset of assets) {
    const desktopMatch = asset.name.match(DESKTOP_PATTERN)
    if (desktopMatch) {
      desktop.push({
        os: desktopMatch[1].toLowerCase() as Os,
        arch: desktopMatch[2].toLowerCase() as Arch,
        flavor: desktopMatch[3].toUpperCase() as Flavor,
        url: asset.url,
        size: asset.size,
      })
      continue
    }

    const apkMatch = asset.name.match(APK_PATTERN)
    if (apkMatch) {
      apk.push({
        abi: apkMatch[1].toLowerCase() as ApkAbi,
        url: asset.url,
        size: asset.size,
      })
    }
  }

  return { desktop, apk }
}

/** 同一架构下的全部构建。刻意不做跨架构回退：上游并没有 Linux aarch64 的
 *  MXU 构建，回退会让 ARM 用户拿到跑不起来的 x64 包。 */
export function buildsFor(
  desktop: DesktopBuild[],
  os: Os,
  arch: Arch,
): DesktopBuild[] {
  return desktop.filter((build) => build.os === os && build.arch === arch)
}

/** 主推构建：优先 MFAAvalonia，缺失时退到同架构的另一个，绝不换架构。 */
export function preferredBuild(
  desktop: DesktopBuild[],
  os: Os,
  arch: Arch,
): DesktopBuild | undefined {
  const builds = buildsFor(desktop, os, arch)
  return builds.find((build) => build.flavor === 'MFAA') ?? builds[0]
}

/** 优先与设备 ABI 一致的 APK；ABI 未知时按 arm64 → universal 的覆盖面排序。 */
export function preferredApk(apk: ApkBuild[], abi?: ApkAbi): ApkBuild | undefined {
  if (abi) {
    const exact = apk.find((item) => item.abi === abi)
    if (exact) return exact
  }
  if (abi !== 'x86_64') {
    const arm = apk.find((item) => item.abi === 'arm64-v8a')
    if (arm) return arm
  }
  return (
    apk.find((item) => item.abi === 'universal')
    ?? apk[0]
  )
}

/** 发布顺序固定，避免资产顺序随上游变化而抖动。 */
export function orderDesktopBuilds(desktop: DesktopBuild[]): DesktopBuild[] {
  const osOrder: Os[] = ['win', 'macos', 'linux']
  const archOrder: Arch[] = ['x86_64', 'aarch64']
  const flavorOrder: Flavor[] = ['MFAA', 'MXU']
  return [...desktop].sort(
    (a, b) =>
      osOrder.indexOf(a.os) - osOrder.indexOf(b.os)
      || archOrder.indexOf(a.arch) - archOrder.indexOf(b.arch)
      || flavorOrder.indexOf(a.flavor) - flavorOrder.indexOf(b.flavor),
  )
}

export function orderApks(apk: ApkBuild[]): ApkBuild[] {
  const abiOrder: ApkAbi[] = ['arm64-v8a', 'universal', 'x86_64']
  return [...apk].sort((a, b) => abiOrder.indexOf(a.abi) - abiOrder.indexOf(b.abi))
}

export function availablePlatforms(
  desktop: DesktopBuild[],
  apk: ApkBuild[],
): Os[] {
  const platforms: Os[] = []
  for (const os of ['win', 'macos', 'linux'] as Os[]) {
    if (desktop.some((build) => build.os === os)) platforms.push(os)
  }
  if (apk.length) platforms.push('android')
  return platforms
}

interface UserAgentDataLike {
  platform?: string
  architecture?: string
}

const PLATFORM_FROM_USER_AGENT_DATA: Record<string, Os> = {
  Windows: 'win',
  macOS: 'macos',
  Linux: 'linux',
  Android: 'android',
}

function archFrom(architecture: string | undefined): Arch | 'unknown' {
  if (architecture === 'arm') return 'aarch64'
  if (architecture === 'x86') return 'x86_64'
  return 'unknown'
}

/**
 * UA 字符串解析，作为 userAgentData 缺失时的回落。
 *
 * 注意 Windows 的 UA 恒为 `Win64; x64`（Windows on ARM 也一样），所以这里
 * 报出的 x86_64 不代表「一定是 Intel」；在 Windows 上 x64 包本来也能靠
 * 模拟运行，属于安全默认值。macOS 的 UA 则完全不区分芯片，因此返回 unknown。
 */
function detectFromUserAgent(): Detected {
  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes('android')) return { os: 'android', arch: 'unknown' }
  if (/iphone|ipad|ipod/.test(ua)) return { os: 'unknown', arch: 'unknown' }
  if (/mac os x|macintosh/.test(ua)) return { os: 'macos', arch: 'unknown' }
  if (ua.includes('windows')) {
    return { os: 'win', arch: /arm64|aarch64/.test(ua) ? 'aarch64' : 'x86_64' }
  }
  if (ua.includes('linux')) {
    return { os: 'linux', arch: /aarch64|arm64|armv8/.test(ua) ? 'aarch64' : 'x86_64' }
  }
  return { os: 'unknown', arch: 'unknown' }
}

/**
 * 识别当前系统。
 *
 * 优先用 userAgentData 的高熵提示，它能给出真实的 CPU 架构；浏览器拒绝或
 * 不支持时退回 UA 解析，而不是抛错卡在「检测中」。
 */
export async function detectPlatform(): Promise<Detected> {
  if (typeof navigator === 'undefined') return { os: 'unknown', arch: 'unknown' }

  const userAgentData = (
    navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues: (hints: string[]) => Promise<UserAgentDataLike>
      }
    }
  ).userAgentData

  if (userAgentData?.getHighEntropyValues) {
    try {
      const hints = await userAgentData.getHighEntropyValues([
        'platform',
        'architecture',
      ])
      const os = hints.platform ? PLATFORM_FROM_USER_AGENT_DATA[hints.platform] : undefined
      if (os) return { os, arch: archFrom(hints.architecture) }
    }
    catch {
      // 有的浏览器暴露了 userAgentData 却拒绝高熵提示，继续走 UA 回落。
    }
  }

  return detectFromUserAgent()
}

export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}
