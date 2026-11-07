<script lang="ts" setup>
import VPImage from '@theme/VPImage.vue'
import VPLink from '@theme/VPLink.vue'
import { computed } from 'vue'
import { useRouteLocale } from 'vuepress/client'
import { useData, useLayout, useSidebarControl } from 'vuepress-theme-plume/composables'

/**
 * 导航栏站标，经 `config.ts` 的 alias 替换主题的 VPNavBarTitle；模板与样式照搬主题，只改显示的文字。
 *
 * 站点标题带着游戏名（「M9A 文档站 · 重返未来：1999 小助手」），那是写给搜索结果和
 * 浏览器标签页看的。原样放进导航栏约 270px 宽：手机上会把菜单按钮挤出屏幕，文档页
 * 里又会压住搜索框。导航栏只显示「·」前面的品牌名。
 */
const { theme, site } = useData()
const { hasSidebar } = useLayout()
const routeLocale = useRouteLocale()
const { isSidebarCollapsed } = useSidebarControl()

const brand = computed(() => site.value.title.split(' · ')[0])
</script>

<template>
  <div class="vp-navbar-title" :class="{ 'has-sidebar': hasSidebar && !isSidebarCollapsed }">
    <VPLink class="title" :href="theme.home ?? routeLocale" no-icon>
      <slot name="nav-bar-title-before" />

      <VPImage
        v-if="theme.logo"
        class="logo"
        :image="{ light: theme.logo, dark: theme.logoDark || theme.logo }"
      />
      <span>{{ brand }}</span>

      <slot name="nav-bar-title-after" />
    </VPLink>
  </div>
</template>

<style scoped>
.title {
  display: flex;
  align-items: center;
  width: 100%;
  height: var(--vp-nav-height);
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  border-bottom: 1px solid transparent;
  transition: opacity var(--vp-t-color), color var(--vp-t-color), border-bottom var(--vp-t-color);
}

@media (min-width: 960px) {
  .title {
    flex-shrink: 0;
  }

  .vp-navbar-title.has-sidebar .title {
    border-bottom-color: var(--vp-c-divider);
  }
}

:deep(.logo) {
  height: min(var(--vp-nav-logo-height, 24px), 48px);
  margin-right: 8px;
}
</style>
