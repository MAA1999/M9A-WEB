const MessageList = [
  "这里的和别处的一切，最终都会回到纯粹的数式之中。只是我还没能算出这个指向未来的式子……唔，目前的假设是……",
  "Everything in here and out there always leads to pure numbers and mathematics. It's only a matter of time until I work out the equation which foretells the future ... Hmm, the current assumption is ...",
];
const tooltipEle = document.querySelector(".tooltip");
const charEle = document.querySelector(".char");
const charContainerEle = document.querySelector(".char-container");
const charBgEle = document.querySelector(".char-bg");
const containerEle = document.querySelector(".container");

function throttle(func, delay) {
  let lastTime = 0;

  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      lastTime = now;
      func.apply(this, args);
    }
  };
}

let isTouchDevice = window.outerWidth < 768;
const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);

charContainerEle.addEventListener("click", onCharClick);
charContainerEle.addEventListener("mousemove", mousemove);
charContainerEle.addEventListener("mouseleave", mouseleave);
charEle.addEventListener("load", onloadToolTip);

const hash = window.location.hash;
if (hash) {
  containerEle.src = `${hash.substring(1)}?iframe`;
  // 自动展开面板
  onCharClick()
}
function onCharClick() {
  document.body.classList.toggle("click");
  if (isIos) {
    // 跳转README页面，避免IOS无法滚动
    window.location.href = "/README.html?iframe";
  } else if (isTouchDevice) {
    // 关闭tooltip
    mouseleave();
  }
}

const throttledUpdateTooltip = throttle(() => {
  tooltipEle.innerHTML =
    MessageList[Math.floor(Math.random() * MessageList.length)];
}, 300);
function onloadToolTip() {
  if (isTouchDevice) {
    throttledUpdateTooltip();
    tooltipEle.removeAttribute("style");
    tooltipEle.style.opacity = "1";
    const charRect = charEle.getBoundingClientRect();
    const charWidth = charEle.offsetWidth;
    const tooltipWidth = tooltipEle.offsetWidth;
    const tooltipHeight = tooltipEle.offsetHeight;
    tooltipEle.style.left = `${
      charRect.left - (tooltipWidth - charWidth) / 2
    }px`;
    tooltipEle.style.top = `${charRect.bottom - tooltipHeight}px`;
  } else {
    tooltipEle.style.display = "none";
    tooltipEle.style.opacity = "0";
  }
}

function mousemove(event) {
  tooltipEle.style.removeProperty("display");
  throttledUpdateTooltip();
  let tooltipX, tooltipY;
  const tooltipWidth = tooltipEle.offsetWidth;
  const tooltipHeight = tooltipEle.offsetHeight;

  const rect = charContainerEle.getBoundingClientRect();
  const charRect = charEle.getBoundingClientRect();

  const mouseX = event.pageX;
  const mouseY = event.pageY;

  tooltipX = mouseX + 20;
  tooltipY = mouseY + 20;

  // 超出左半边
  if (event.pageX > rect.left + rect.width / 2) {
    tooltipX = mouseX - tooltipWidth - 10;
  }

  // 鼠标超出上半边
  if (event.pageY > rect.top + rect.height / 2) {
    tooltipY = mouseY - tooltipHeight - 10;
  }

  tooltipEle.style.left = `${tooltipX}px`;
  tooltipEle.style.top = `${tooltipY}px`;

  tooltipEle.style.opacity = "1";
}
function mouseleave(e) {
  tooltipEle.style.opacity = "0";
}

function calcLinePos(angle) {
  const radian = (angle * Math.PI) / 180;

  const segmentLength1 = 20;
  const segmentLength2 = 60;
  const segmentLength3 = 30;
  const spacing = 10;

  const compareX = Math.cos(radian);
  const compareY = Math.sin(radian);

  const spacingX = spacing * compareX;
  const spacingY = spacing * compareY;

  const deltaX1 = segmentLength1 * compareX;
  const deltaY1 = segmentLength1 * compareY;
  const deltaX2 = segmentLength2 * compareX;
  const deltaY2 = segmentLength2 * compareY;
  const deltaX3 = segmentLength3 * compareX;
  const deltaY3 = segmentLength3 * compareY;
  return {
    spacingX,
    spacingY,
    deltaX1,
    deltaY1,
    deltaX2,
    deltaY2,
    deltaX3,
    deltaY3,
    x: deltaX1 + deltaX2 + deltaX3,
    y: deltaY1 + deltaY2 + deltaY3,
  };
}

// 绘制回溯雨
function drawLine(startX, startY, linePos) {
  Ctx.beginPath();

  startX -= linePos.x;
  startY += linePos.y;
  Ctx.moveTo(startX, startY);
  startX += linePos.deltaX1;
  startY -= linePos.deltaY1;
  Ctx.lineTo(startX, startY);

  startX += linePos.spacingX;
  startY -= linePos.spacingY;
  Ctx.moveTo(startX, startY);
  startX += linePos.deltaX2;
  startY -= linePos.deltaY2;
  Ctx.lineTo(startX, startY);

  startX += linePos.spacingX;
  startY -= linePos.spacingY;
  Ctx.moveTo(startX, startY);
  startX += linePos.deltaX3;
  startY -= linePos.deltaY3;
  Ctx.lineTo(startX, startY);

  Ctx.stroke();
}

/**
 * 计算绘制时间
 * @param {number} speed 像素/秒
 * @param {number} angle
 * @param {number} deltaTime 间隔时间
 */
function calcDrawTime(speed, angle, deltaTime) {
  const radian = (angle * Math.PI) / 180;

  const compareX = Math.cos(radian);
  const compareY = Math.sin(radian);

  const spacingX = ((speed * deltaTime) / 1000) * compareX;
  const spacingY = ((speed * deltaTime) / 1000) * compareY;
  return [spacingX, spacingY];
}

// 绘制回溯雨动画
function startDraw(posList, angle, timestamp, linePos) {
  const deltaTime = timestamp - LastTime;
  LastTime = timestamp;
  let newPosList = [];
  Ctx.clearRect(0, 0, Canvas.width, Canvas.height);

  const [spacingX, spacingY] = calcDrawTime(100, angle, deltaTime);

  posList.forEach((pos) => {
    let startX = pos.new[0];
    let startY = pos.new[1];

    startX = startX + spacingX;
    startY = startY - spacingY;

    if (startX > Canvas.width + linePos.x || startY < 0 - linePos.y) {
      pos.new = [pos.default[0], pos.default[1]];
    } else {
      pos.new[0] = startX;
      pos.new[1] = startY;
    }
    drawLine(pos.new[0], pos.new[1], linePos);
    newPosList.push(pos);
  });

  requestAnimationFrame((t) => {
    startDraw(newPosList, angle, t, linePos);
  });
}

/**
 * 生成随机点
 * @param {number} length
 * @param {number} spacing
 * @param {number} num
 * @param {number} expand length(x)向左扩展的大小
 * @returns 返回的x坐标列表，改列表减去了expand
 */
function randomPoints(length, spacing, num, expand) {
  let points = [];
  const legalNum = (length + expand) / spacing;
  if (legalNum < num) {
    num = legalNum;
  }

  // 按间距生成分割点
  for (let i = 0; i < legalNum; i++) {
    points.push(i * spacing - expand);
  }

  // 随机取点
  let selectedPoints = [];
  while (selectedPoints.length < num) {
    const randomIndex = Math.floor(Math.random() * points.length);
    const point = points[randomIndex];

    if (!selectedPoints.includes(point)) {
      selectedPoints.push(point);
    }
  }
  return selectedPoints;
}

let Canvas = document.getElementById("bgCanvas");
let Ctx = Canvas.getContext("2d");
let LastTime = 0;

function initDraw() {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  Canvas.width = width;
  Canvas.height = height;
  Ctx.strokeStyle = "#383838";
  Ctx.lineWidth = 2;
  const angle = 70;
  const linePos = calcLinePos(angle);
  const selectedPoints = randomPoints(width, 100, 10, 200);
  requestAnimationFrame((t) => {
    startDraw(
      selectedPoints.map((x) => {
        return {
          default: [x, height + Math.floor(Math.random() * 201)],
          new: [x, height + Math.floor(Math.random() * 201)],
        };
      }),
      angle,
      t,
      linePos
    );
  });
}
initDraw();
window.addEventListener("resize", function () {
  initDraw();
  isTouchDevice = window.outerWidth < 768;
  onloadToolTip();
});
