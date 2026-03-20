const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");
const tickerEl = document.getElementById("ticker");
const warpTransition = document.getElementById("warpTransition");
const noiseTransition = document.getElementById("noiseTransition");
const chapters = [...document.querySelectorAll(".chapter")];
const chapterLinks = [...document.querySelectorAll(".chapter-nav a")];
const typeTitles = [...document.querySelectorAll(".type-title")];

let w = 0;
let h = 0;
let stars = [];
let activeId = "";

function prepareTypeTitles() {
  typeTitles.forEach((title) => {
    const raw = title.textContent;
    const chars = [...raw];
    title.textContent = "";
    chars.forEach((char, index) => {
      const span = document.createElement("span");
      span.className = "char";
      span.style.setProperty("--char-index", index);
      span.textContent = char === " " ? "\u00A0" : char;
      title.appendChild(span);
    });
  });
}

function lightTitleInChapter(chapter) {
  chapter.querySelectorAll(".type-title").forEach((title) => {
    title.classList.remove("lit");
    window.requestAnimationFrame(() => title.classList.add("lit"));
  });
}

function triggerChapterTransitionFx() {
  warpTransition.classList.remove("active");
  noiseTransition.classList.remove("active");
  document.body.classList.remove("zooming");
  window.requestAnimationFrame(() => {
    warpTransition.classList.add("active");
    noiseTransition.classList.add("active");
    document.body.classList.add("zooming");
  });
  window.setTimeout(() => document.body.classList.remove("zooming"), 620);
}

function resize() {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
  const count = Math.max(140, Math.floor((w * h) / 10500));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    z: 0.5 + Math.random() * 1.4,
    r: Math.random() * 1.6,
  }));
}

function renderStars() {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#dce9ff";
  for (const star of stars) {
    star.y += star.z;
    if (star.y > h + 2) {
      star.y = -2;
      star.x = Math.random() * w;
    }
    ctx.globalAlpha = 0.16 + star.z * 0.3;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(renderStars);
}

function markActiveChapter() {
  const marker = window.scrollY + window.innerHeight * 0.45;
  let nextActiveId = chapters[0]?.id;
  let nextActiveChapter = chapters[0];
  for (const section of chapters) {
    if (marker >= section.offsetTop) {
      nextActiveId = section.id;
      nextActiveChapter = section;
    }
  }

  if (activeId && nextActiveId !== activeId) {
    triggerChapterTransitionFx();
    lightTitleInChapter(nextActiveChapter);
  }
  activeId = nextActiveId;

  chapters.forEach((chapter) => {
    chapter.classList.toggle("is-active", chapter.id === nextActiveId);
  });
  document.body.classList.add("has-active");

  chapterLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${nextActiveId}`;
    link.classList.toggle("active", isActive);
  });
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("in");
    });
  },
  { threshold: 0.18 }
);

document.querySelectorAll(".reveal").forEach((block) => revealObserver.observe(block));

const tickerMessages = [
  "Live feed synchronized across 12 active regions.",
  "Command relay online: 438 fleet events processed in the last hour.",
  "Threat intelligence confidence updated to 98.7 percent.",
];

let tickerIndex = 0;
setInterval(() => {
  tickerIndex = (tickerIndex + 1) % tickerMessages.length;
  tickerEl.textContent = tickerMessages[tickerIndex];
}, 2500);

warpTransition.addEventListener("animationend", () => warpTransition.classList.remove("active"));
noiseTransition.addEventListener("animationend", () => noiseTransition.classList.remove("active"));

window.addEventListener("resize", () => {
  resize();
  markActiveChapter();
});

window.addEventListener("scroll", markActiveChapter);

window.addEventListener("mousemove", (event) => {
  const x = ((event.clientX / window.innerWidth) * 2 - 1) * 8;
  const y = ((event.clientY / window.innerHeight) * 2 - 1) * 8;
  document.documentElement.style.setProperty("--mx", `${x}px`);
  document.documentElement.style.setProperty("--my", `${y}px`);
});

resize();
prepareTypeTitles();
renderStars();
markActiveChapter();
if (chapters[0]) lightTitleInChapter(chapters[0]);
