const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const HALF_HEIGHT = EXPORT_HEIGHT / 2;
const COMPARISON_MONTHS = [0, 1, 3, 6, 9, 12];

const video = document.getElementById("camera");
const canvasAdult = document.getElementById("viewAdult");
const canvasBaby = document.getElementById("viewBaby");
const ctxAdult = canvasAdult.getContext("2d");
const ctxBaby = canvasBaby.getContext("2d");
const viewerWrap = document.getElementById("viewerWrap");
const statusEl = document.getElementById("status");
const flipBtn = document.getElementById("flipBtn");

const liveModeBtn = document.getElementById("liveModeBtn");
const photoModeBtn = document.getElementById("photoModeBtn");
const liveScreen = document.getElementById("liveScreen");
const photoScreen = document.getElementById("photoScreen");

const ageSlider = document.getElementById("ageSlider");
const ageLabel = document.getElementById("ageLabel");
const captureBtn = document.getElementById("captureBtn");
const saveBtn = document.getElementById("saveBtn");
const photoInput = document.getElementById("photoInput");

const sourcePreview = document.getElementById("sourcePreview");
const sourceCtx = sourcePreview.getContext("2d");
const sourceLabel = document.getElementById("sourceLabel");
const comparisonMeta = document.getElementById("comparisonMeta");

const tileCanvases = COMPARISON_MONTHS.reduce((map, month) => {
  map[month] = document.getElementById(`tile-${month}`);
  return map;
}, {});

let stream;
let isRunning = false;
let mode = "live";
let currentFacingMode = "environment";
let isDesktopSplit = window.matchMedia("(min-width: 900px)").matches;

function syncViewportHeightVar() {
  const h = window.innerHeight;
  document.documentElement.style.setProperty("--app-vh", `${h}px`);
  isDesktopSplit = window.matchMedia("(min-width: 900px)").matches;
  requestAnimationFrame(resizeLiveCanvas);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function interpolateStops(age, stops) {
  if (age <= stops[0].age) return stops[0].value;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return lerp(a.value, b.value, t);
    }
  }
  return stops[stops.length - 1].value;
}

function getSimParams(ageMonths) {
  const age = clamp(Number(ageMonths), 0, 12);

  const blur = interpolateStops(age, [
    { age: 0, value: 40 },
    { age: 1, value: 40 },
    { age: 2, value: 25 },
    { age: 4, value: 10 },
    { age: 6, value: 4 },
    { age: 12, value: 0 }
  ]);

  const saturation = interpolateStops(age, [
    { age: 0, value: 0 },
    { age: 1, value: 0 },
    { age: 2, value: 20 },
    { age: 4, value: 70 },
    { age: 5, value: 100 },
    { age: 12, value: 100 }
  ]);

  const contrast = interpolateStops(age, [
    { age: 0, value: 120 },
    { age: 1, value: 120 },
    { age: 2, value: 110 },
    { age: 4, value: 100 },
    { age: 12, value: 100 }
  ]);

  const warmTint = interpolateStops(age, [
    { age: 0, value: 0 },
    { age: 1.5, value: 0 },
    { age: 2, value: 12 },
    { age: 3, value: 3 },
    { age: 4, value: 0 },
    { age: 12, value: 0 }
  ]);

  return { blur, saturation, contrast, warmTint };
}

function updateAgeLabel() {
  const age = Number(ageSlider.value);
  ageLabel.textContent = `${age} month${age === 1 ? "" : "s"}`;
}

function getSourceDimensions(source) {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }

  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }

  return { width: source.width, height: source.height };
}

function drawCoverToContext(targetCtx, source, dx, dy, dWidth, dHeight) {
  const dims = getSourceDimensions(source);
  if (!dims.width || !dims.height) return;

  const sourceRatio = dims.width / dims.height;
  const boxRatio = dWidth / dHeight;

  let cropW = dims.width;
  let cropH = dims.height;
  let cropX = 0;
  let cropY = 0;

  if (sourceRatio > boxRatio) {
    cropW = Math.round(dims.height * boxRatio);
    cropX = Math.round((dims.width - cropW) / 2);
  } else {
    cropH = Math.round(dims.width / boxRatio);
    cropY = Math.round((dims.height - cropH) / 2);
  }

  targetCtx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dWidth, dHeight);
}

function drawContainToContext(targetCtx, source, dx, dy, dWidth, dHeight, bg = "#020407") {
  const dims = getSourceDimensions(source);
  if (!dims.width || !dims.height) return;

  targetCtx.fillStyle = bg;
  targetCtx.fillRect(dx, dy, dWidth, dHeight);

  const sourceRatio = dims.width / dims.height;
  const boxRatio = dWidth / dHeight;

  let drawW = dWidth;
  let drawH = dHeight;
  let drawX = dx;
  let drawY = dy;

  if (sourceRatio > boxRatio) {
    drawH = Math.round(dWidth / sourceRatio);
    drawY = dy + Math.round((dHeight - drawH) / 2);
  } else {
    drawW = Math.round(dHeight * sourceRatio);
    drawX = dx + Math.round((dWidth - drawW) / 2);
  }

  targetCtx.drawImage(source, 0, 0, dims.width, dims.height, drawX, drawY, drawW, drawH);
}

function drawContainImageToContext(targetCtx, source, dx, dy, dWidth, dHeight) {
  const dims = getSourceDimensions(source);
  if (!dims.width || !dims.height) return;

  const sourceRatio = dims.width / dims.height;
  const boxRatio = dWidth / dHeight;

  let drawW = dWidth;
  let drawH = dHeight;
  let drawX = dx;
  let drawY = dy;

  if (sourceRatio > boxRatio) {
    drawH = Math.round(dWidth / sourceRatio);
    drawY = dy + Math.round((dHeight - drawH) / 2);
  } else {
    drawW = Math.round(dHeight * sourceRatio);
    drawX = dx + Math.round((dWidth - drawW) / 2);
  }

  targetCtx.drawImage(source, 0, 0, dims.width, dims.height, drawX, drawY, drawW, drawH);
}

function createProcessingSource(source) {
  const dims = getSourceDimensions(source);
  if (!dims.width || !dims.height) return source;

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(dims.width, dims.height));
  if (scale === 1) return source;

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(dims.width * scale));
  out.height = Math.max(1, Math.round(dims.height * scale));
  const outCtx = out.getContext("2d");
  if (!outCtx) return source;

  outCtx.drawImage(source, 0, 0, dims.width, dims.height, 0, 0, out.width, out.height);
  return out;
}

function configureComparisonCanvases(source) {
  const viewportH = window.innerHeight || 900;
  const compact = viewportH < 760;
  const isDesktop = window.matchMedia("(min-width: 860px)").matches;

  let targetWidth = 320;
  if (compact) targetWidth = 260;
  if (!isDesktop) targetWidth = Math.min(targetWidth, 240);

  const targetHeight = Math.round(targetWidth * 0.75);

  sourcePreview.width = targetWidth;
  sourcePreview.height = targetHeight;

  COMPARISON_MONTHS.forEach((age) => {
    const tile = tileCanvases[age];
    tile.width = targetWidth;
    tile.height = targetHeight;
  });
}

function drawSplitFrame() {
  if (!video.videoWidth || !video.videoHeight) return false;

  const width = canvasAdult.width;
  const height = canvasAdult.height;
  if (!width || !height) return false;

  const age = Number(ageSlider.value);
  const { blur, saturation, contrast, warmTint } = getSimParams(age);

  // Adult view (unfiltered, using cover)
  ctxAdult.clearRect(0, 0, width, height);
  drawCoverToContext(ctxAdult, video, 0, 0, width, height);

  // Baby view (filtered via CSS, using cover)
  ctxBaby.clearRect(0, 0, width, height);
  drawCoverToContext(ctxBaby, video, 0, 0, width, height);
  canvasBaby.style.filter = `blur(${blur}px) saturate(${saturation}%) contrast(${contrast}%) sepia(${warmTint}%)`;
  canvasBaby.style.webkitFilter = `blur(${blur}px) saturate(${saturation}%) contrast(${contrast}%) sepia(${warmTint}%)`;

  return true;
}

function tick() {
  if (!isRunning || mode !== "live") return;
  drawSplitFrame();
  requestAnimationFrame(tick);
}

async function startCamera() {
  if (stream) {
    if (!isRunning) {
      try {
        await video.play();
        isRunning = true;
        requestAnimationFrame(tick);
      } catch (err) {
        console.error("video.play error:", err);
        statusEl.textContent = "Click Live or Tap here to start camera.";
      }
    }
    return;
  }

  try {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: currentFacingMode },
        // Relax constraints to improve compatibility on some mobile devices
        width: { ideal: 1280 }, 
        height: { ideal: 720 }
      }
    };
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);

    video.srcObject = stream;
    video.setAttribute("playsinline", "true"); // Explicitly set playsinline
    await video.play();

    // Check for 0x0 video dimensions after play
    let checkCount = 0;
    const dimensionCheck = setInterval(() => {
      checkCount++;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        clearInterval(dimensionCheck);
        isRunning = true;
        saveBtn.disabled = false;
        captureBtn.disabled = false;
        statusEl.textContent = `Live camera active. Everything stays on device.`;
        requestAnimationFrame(tick);
      } else if (checkCount > 20) { // 2 seconds timeout
        clearInterval(dimensionCheck);
        console.warn("Video started but has 0 dimensions.");
        statusEl.textContent = "Camera started but no video. Tap here to retry.";
        isRunning = false;
      }
    }, 100);

  } catch (error) {
    console.error("startCamera error:", error);
    isRunning = false;
    saveBtn.disabled = true;
    captureBtn.disabled = true;
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      statusEl.textContent = "Camera access denied. Enable it in settings and tap here.";
    } else {
      statusEl.textContent = `Camera error: ${error.name}. Tap to retry.`;
    }
  }
}

async function toggleCamera() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  stopCamera();
  await startCamera();
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  stream = undefined;
  isRunning = false;
}

function saveCurrentSplitFrame() {
  if (!video.videoWidth || !video.videoHeight) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = EXPORT_WIDTH;
  exportCanvas.height = EXPORT_HEIGHT;
  const ectx = exportCanvas.getContext("2d");
  if (!ectx) return;

  const age = Number(ageSlider.value);
  const { blur, saturation, contrast, warmTint } = getSimParams(age);

  ectx.save();
  ectx.filter = "none";
  drawCoverToContext(ectx, video, 0, 0, EXPORT_WIDTH, HALF_HEIGHT);
  ectx.restore();

  ectx.save();
  // Using canvas filter here for export is usually fine as it's a single operation, not a live stream
  // But to be safe, we can replicate the logic if needed. 
  // However, exportCanvas is not displayed, so CSS filter won't affect the blob output.
  // We MUST use ctx.filter for the exported image data.
  ectx.filter = `blur(${blur}px) saturate(${saturation}%) contrast(${contrast}%) sepia(${warmTint}%)`;
  drawCoverToContext(ectx, video, 0, HALF_HEIGHT, EXPORT_WIDTH, HALF_HEIGHT);
  ectx.restore();

  ectx.fillStyle = "rgba(255,255,255,0.75)";
  ectx.fillRect(0, HALF_HEIGHT - 2, EXPORT_WIDTH, 4);

  ectx.fillStyle = "rgba(0,0,0,0.58)";
  ectx.fillRect(20, 24, 180, 68);
  ectx.fillRect(20, HALF_HEIGHT + 24, 180, 68);

  ectx.fillStyle = "#ffffff";
  ectx.font = "700 40px 'Avenir Next', sans-serif";
  ectx.fillText("ADULT", 36, 70);
  ectx.fillText("BABY", 44, HALF_HEIGHT + 70);

  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = `baby-vision-v0.1-live-${stamp}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png", 1);
}

function resizeLiveCanvas() {
  if (!viewerWrap) return;
  const rect = viewerWrap.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height));

  if (canvasAdult.width !== width || canvasAdult.height !== height) {
    canvasAdult.width = width;
    canvasAdult.height = height;
    canvasBaby.width = width;
    canvasBaby.height = height;
    if (mode === "live") drawSplitFrame();
  }
}

function captureLiveSourceCanvas() {
  if (!video.videoWidth || !video.videoHeight || !canvasAdult.width || !canvasAdult.height) return null;

  const snapshot = document.createElement("canvas");
  snapshot.width = canvasAdult.width;
  snapshot.height = canvasAdult.height;
  const snapshotCtx = snapshot.getContext("2d");
  if (!snapshotCtx) return null;

  // Capture what the user sees (cover/crop) instead of the full distorted video frame
  drawCoverToContext(snapshotCtx, video, 0, 0, snapshot.width, snapshot.height);
  return snapshot;
}

function renderComparisonFromSource(source, labelText) {
  const processingSource = createProcessingSource(source);
  configureComparisonCanvases(processingSource);

  sourceCtx.clearRect(0, 0, sourcePreview.width, sourcePreview.height);
  drawContainToContext(sourceCtx, processingSource, 0, 0, sourcePreview.width, sourcePreview.height);
  sourceLabel.textContent = labelText;

  COMPARISON_MONTHS.forEach((age) => {
    const tile = tileCanvases[age];
    const tctx = tile.getContext("2d");
    const p = getSimParams(age);

    tctx.clearRect(0, 0, tile.width, tile.height);
    tctx.fillStyle = "#020407";
    tctx.fillRect(0, 0, tile.width, tile.height);
    drawContainImageToContext(tctx, processingSource, 0, 0, tile.width, tile.height);
    
    // Use CSS filter for the tile canvas for broad compatibility
    tile.style.filter = `blur(${p.blur / 4}px) saturate(${p.saturation}%) contrast(${p.contrast}%) sepia(${p.warmTint}%)`;
  });
}

async function setMode(nextMode) {
  mode = nextMode;
  const isLive = mode === "live";

  liveModeBtn.classList.toggle("active", isLive);
  photoModeBtn.classList.toggle("active", !isLive);
  liveModeBtn.setAttribute("aria-selected", String(isLive));
  photoModeBtn.setAttribute("aria-selected", String(!isLive));

  liveScreen.hidden = !isLive;
  photoScreen.hidden = isLive;

  if (isLive) {
    resizeLiveCanvas();
    await startCamera();
  } else {
    stopCamera();
  }
}

async function captureToComparison() {
  const source = captureLiveSourceCanvas();
  if (!source) return;

  renderComparisonFromSource(source, "Original (Live Capture)");
  comparisonMeta.textContent = "Source: Live capture";
  await setMode("photo");
}

async function loadPhotoFile(file) {
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;

  try {
    await img.decode();
    renderComparisonFromSource(img, "Original (Uploaded Photo)");
    comparisonMeta.textContent = "Source: Uploaded photo";
    await setMode("photo");
  } catch (error) {
    console.error(error);
    comparisonMeta.textContent = "Could not load image. Try a different photo.";
  } finally {
    URL.revokeObjectURL(url);
  }
}

function initGridPlaceholders() {
  sourceCtx.fillStyle = "#05090f";
  sourceCtx.fillRect(0, 0, sourcePreview.width, sourcePreview.height);

  Object.values(tileCanvases).forEach((tile) => {
    const tctx = tile.getContext("2d");
    tctx.fillStyle = "#05090f";
    tctx.fillRect(0, 0, tile.width, tile.height);
    tile.style.filter = "none";
  });
}

liveModeBtn.addEventListener("click", async () => {
  await setMode("live");
});

photoModeBtn.addEventListener("click", async () => {
  await setMode("photo");
});

ageSlider.addEventListener("input", () => {
  updateAgeLabel();
  if (mode === "live") drawSplitFrame();
});

captureBtn.addEventListener("click", captureToComparison);
saveBtn.addEventListener("click", saveCurrentSplitFrame);
flipBtn.addEventListener("click", toggleCamera);

statusEl.addEventListener("click", async () => {
  if (!isRunning && mode === "live") {
    await startCamera();
  }
});

photoInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  await loadPhotoFile(file);
});

updateAgeLabel();
initGridPlaceholders();
syncViewportHeightVar();
resizeLiveCanvas();
setMode("live");

window.addEventListener("resize", syncViewportHeightVar, { passive: true });
window.addEventListener("resize", resizeLiveCanvas, { passive: true });
window.addEventListener("orientationchange", syncViewportHeightVar, { passive: true });
window.addEventListener("orientationchange", resizeLiveCanvas, { passive: true });
window.addEventListener("pageshow", syncViewportHeightVar, { passive: true });
window.addEventListener("beforeunload", stopCamera);
