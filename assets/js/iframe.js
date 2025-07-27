const urlParams = new URLSearchParams(window.location.search);
const hasIframeParam = urlParams.has('iframe');
if (!hasIframeParam) {
  window.location.href = `/#${window.location.pathname}`;
}