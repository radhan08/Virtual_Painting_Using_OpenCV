// --- Virtual Painting App with Gesture-based Drawing, Resizing ---

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cursor = document.getElementById('virtualCursor');
const eraserIcon = document.getElementById('eraserIcon');
const eraserBtn = document.getElementById('eraserBtn');
const brushSlider = document.getElementById('brushSize');
const shapeHoverIndicator = document.getElementById('shapeHoverIndicator');
let draggingCorner = null; // "tl", "tr", "bl", "br"
const HANDLE_SIZE = 12;

let brushSize = 5;
let currentColor = 'red';
let currentShape = 'free';
let drawing = false;
let prevX = null, prevY = null;
let smoothX = null, smoothY = null;
let isEraser = false;
let shapePlaced = true;
let placedShapes = [];
let freehandLines = [];
let selectedShapeIndex = null;
let initialPinchDist = null;

let isDraggingResizer = false;
let dragStartX = null;
let dragStartY = null;
let shapeStartScale = 1;
const RESIZER_SIZE = 40;

let isEraserGesture = false;
let isEraserToolSelected = false;

let showCursor = true;

let saveCooldown = false; 
let isDraggingShape = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

let lastCursorX = null;
let lastCursorY = null;
let lastTapTime = 0;
let shapeFrozen = false; // to mark shape placed
let actionHistory = [];
let redoStack = [];
let undoCooldown = false;
let redoCooldown = false;
let deleteCooldown = false;
let extraColorsTimer = null;
let extraShapesTimer = null;
let shapeHoverStartTime = null;
let hoveredShapeIndex = null;
let justReselected = false;
let isRotating = false;
let rotationStartAngle = 0;
let initialRotation = 0;
let justReselectedAt = null;
let currentSketch = [];
const socket = io();  // Automatically connects to current server


function pushAction(action) {
  actionHistory.push(action);
  redoStack = []; // Clear redo stack on new action
}

function undo() {
  if (actionHistory.length === 0) return;
  const last = actionHistory.pop();
  redoStack.push(last);

  // Restore state
  restoreFromHistory();
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  actionHistory.push(next);

  // Restore state
  restoreFromHistory();
}

function restoreFromHistory() {
  freehandLines = [];
  placedShapes = [];

  for (const action of actionHistory) {
    if (action.type === 'line') {
      freehandLines.push(action.data);
    } else if (action.type === 'shape') {
      placedShapes.push(action.data);
    } else if (action.type === 'fill') {
      const target = placedShapes[action.index];
      if (target) target.fill = action.color;
    }
  }

  drawAllShapes();
}


function saveCanvasToImage() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.fillStyle = "#ffffff"; // white background
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Redraw freehand lines
  for (let line of freehandLines) {
    tempCtx.beginPath();
    tempCtx.moveTo(line.x1, line.y1);
    tempCtx.lineTo(line.x2, line.y2);
    tempCtx.strokeStyle = line.erase ? 'rgba(255,255,255,1)' : line.color;
    tempCtx.globalCompositeOperation = line.erase ? 'destination-out' : 'source-over';
    tempCtx.lineWidth = line.erase ? line.size * 2 : line.size;
    tempCtx.lineCap = 'round';
    tempCtx.lineJoin = 'round';
    tempCtx.stroke();
    tempCtx.closePath();
  }

  // Redraw placed shapes
  for (let shape of placedShapes) {
    const { x, y, shape: type, color, scale, fill } = shape;

    tempCtx.save();
    tempCtx.translate(x, y);
    tempCtx.scale(scale, scale);
    tempCtx.translate(-x, -y);

    // ✅ Fill the shape if it has a fill color
    if (fill) {
      tempCtx.fillStyle = fill;
      switch (type) {
        case 'rectangle':
          tempCtx.fillRect(x - 50, y - 30, 100, 60);
          break;
        case 'square':
          tempCtx.fillRect(x - 50, y - 50, 100, 100);
          break;
        case 'circle':
          tempCtx.beginPath();
          tempCtx.arc(x, y, 40, 0, 2 * Math.PI);
          tempCtx.fill();
          break;
        case 'ellipse':
          tempCtx.beginPath();
          tempCtx.ellipse(x, y, 50, 30, 0, 0, 2 * Math.PI);
          tempCtx.fill();
          break;
        case 'triangle':
          tempCtx.beginPath();
          tempCtx.moveTo(x, y - 50);
          tempCtx.lineTo(x - 40, y + 30);
          tempCtx.lineTo(x + 40, y + 30);
          tempCtx.closePath();
          tempCtx.fill();
          break;
      }
    }

    // ✅ Stroke the shape border
    tempCtx.strokeStyle = color;
    tempCtx.lineWidth = 2;

    switch (type) {
      case 'rectangle':
        tempCtx.strokeRect(x - 50, y - 30, 100, 60);
        break;
      case 'square':
        tempCtx.strokeRect(x - 50, y - 50, 100, 100);
        break;
      case 'circle':
        tempCtx.beginPath();
        tempCtx.arc(x, y, 40, 0, 2 * Math.PI);
        tempCtx.stroke();
        break;
      case 'ellipse':
        tempCtx.beginPath();
        tempCtx.ellipse(x, y, 50, 30, 0, 0, 2 * Math.PI);
        tempCtx.stroke();
        break;
      case 'triangle':
        tempCtx.beginPath();
        tempCtx.moveTo(x, y - 50);
        tempCtx.lineTo(x - 40, y + 30);
        tempCtx.lineTo(x + 40, y + 30);
        tempCtx.closePath();
        tempCtx.stroke();
        break;
      case 'line':
        tempCtx.beginPath();
        tempCtx.moveTo(x - 40, y);
        tempCtx.lineTo(x + 40, y);
        tempCtx.stroke();
        break;
    }

    tempCtx.restore();
  }

  const imageData = tempCanvas.toDataURL('image/png');
  const downloadLink = document.createElement('a');
  downloadLink.href = imageData;
  downloadLink.download = 'my_drawing.png';
  downloadLink.click(); // Trigger download
}


function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

brushSlider.addEventListener('input', () => {
  brushSize = parseInt(brushSlider.value);
});

function updateUISelection(hoveredElement, selector) {
  document.querySelectorAll(selector).forEach(el => el.classList.remove('selected'));
  if (hoveredElement) hoveredElement.classList.add('selected');
}

function cursorOverlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
// Global flag to prevent repeated saves on hover

function checkHoverSelection() {
  const cursorBox = cursor.getBoundingClientRect();

  // 🎨 Color Selection
  document.querySelectorAll('.color-btn').forEach(btn => {
    const btnBox = btn.getBoundingClientRect();
    if (cursorOverlaps(cursorBox, btnBox)) {
      currentColor = btn.dataset.color;
      isEraser = false;
      isEraserToolSelected = false;
      updateUISelection(btn, '.color-btn');
    }
  });

  // ✏️ Shape Selection
  document.querySelectorAll('.shape-btn').forEach(btn => {
    const btnBox = btn.getBoundingClientRect();
    if (cursorOverlaps(cursorBox, btnBox)) {
      if (shapePlaced) {
        currentShape = btn.dataset.shape;
        shapePlaced = false;
        isEraser = false;
        isEraserToolSelected = false;
        updateUISelection(btn, '.shape-btn');
      }
    }
  });

  // 🧽 Eraser Button
  if (cursorOverlaps(cursorBox, eraserBtn.getBoundingClientRect())) {
    isEraser = true;
    isEraserToolSelected = true;
    updateUISelection(eraserBtn, '.tool-btn');
  }

  // 💾 Save on Hover (with cooldown)
  const saveBtnBox = saveBtn.getBoundingClientRect();
  if (cursorOverlaps(cursorBox, saveBtnBox)) {
    if (!saveCooldown) {
      saveCanvasToImage();
      saveCooldown = true;
      setTimeout(() => {
        saveCooldown = false;
      }, 2000);
    }
  }

  // 🎚️ Brush Size Slider
  const brushBox = brushSlider.getBoundingClientRect();
  if (cursorOverlaps(cursorBox, brushBox)) {
    const relativeX = cursorBox.left - brushBox.left;
    const percentage = Math.min(Math.max(relativeX / brushBox.width, 0), 1);
    const newSize = Math.round(1 + percentage * (40 - 1));
    brushSlider.value = newSize;
    brushSize = newSize;
  }

  // ↶ Undo Button
  const undoBtnBox = undoBtn.getBoundingClientRect();
  if (cursorOverlaps(cursorBox, undoBtnBox)) {
    if (!undoCooldown) {
      undo();
      undoCooldown = true;
      setTimeout(() => undoCooldown = false, 1500);
    }
  }

  // ↷ Redo Button
  const redoBtnBox = redoBtn.getBoundingClientRect();
  if (cursorOverlaps(cursorBox, redoBtnBox)) {
    if (!redoCooldown) {
      redo();
      redoCooldown = true;
      setTimeout(() => redoCooldown = false, 1500);
    }
  }

  // 🗑️ Clear (Delete) Button
  const deleteBtnBox = deleteBtn.getBoundingClientRect();
  if (cursorOverlaps(cursorBox, deleteBtnBox)) {
    if (!deleteCooldown) {
      actionHistory = [];
      redoStack = [];
      freehandLines = [];
      placedShapes = [];
      drawAllShapes();
      deleteCooldown = true;
      setTimeout(() => deleteCooldown = false, 1500);
    }
  }

  // ✅ 🔄 TOOL BUTTON HOVER VISUAL EFFECT
  const toolButtons = [saveBtn, eraserBtn, undoBtn, redoBtn, deleteBtn];
  toolButtons.forEach(btn => {
    const btnBox = btn.getBoundingClientRect();
    if (cursorOverlaps(cursorBox, btnBox)) {
      btn.classList.add('hovered-tool');
    } else {
      btn.classList.remove('hovered-tool');
    }
  });

  // + More Colors Button (hover to show)
  const moreColorsBtn = document.querySelector('button[onclick="toggleColors()"]');
  const moreColorsBox = moreColorsBtn.getBoundingClientRect();
  const extraColors = document.getElementById('extraColors');

  if (cursorOverlaps(cursorBox, moreColorsBox)) {
    extraColors.style.display = 'flex';
    if (extraColorsTimer) clearTimeout(extraColorsTimer);
    extraColorsTimer = setTimeout(() => {
      extraColors.style.display = 'none';
    }, 5000);
  }

  // + More Shapes Button (hover to show)
  const moreShapesBtn = document.querySelector('button[onclick="toggleShapes()"]');
  const moreShapesBox = moreShapesBtn.getBoundingClientRect();
  const extraShapes = document.getElementById('extraShapes');

  if (cursorOverlaps(cursorBox, moreShapesBox)) {
    extraShapes.style.display = 'flex';
    if (extraShapesTimer) clearTimeout(extraShapesTimer);
    extraShapesTimer = setTimeout(() => {
      extraShapes.style.display = 'none';
    }, 5000);
  }
}



function updateCursor(x, y, snap = false) {
  const alpha = 0.25;
  if (snap || smoothX === null || smoothY === null) {
    smoothX = x;
    smoothY = y;
  } else {
    smoothX = alpha * x + (1 - alpha) * smoothX;
    smoothY = alpha * y + (1 - alpha) * smoothY;
  }

  cursor.style.left = `${smoothX}px`;
  cursor.style.top = `${smoothY}px`;

  if (isEraser) {
    eraserIcon.style.display = 'block';
    eraserIcon.style.left = `${smoothX - 15}px`;
    eraserIcon.style.top = `${smoothY - 15}px`;
  } else {
    eraserIcon.style.display = 'none';
  }
}



function drawLine(x1, y1, x2, y2, color = currentColor, size = brushSize, erase = false, track = true) {
  if ([x1, y1, x2, y2].some(val => isNaN(val) || val === null)) return;

  // 🧠 Store sketch points for ML only in free draw mode (and not erasing)
  if (currentShape === 'free' && !erase) {
    currentSketch.push({ x: x2, y: y2 });
  }

  const lineData = { x1, y1, x2, y2, color, size, erase };
  freehandLines.push(lineData);

  if (track) {
    pushAction({ type: 'line', data: lineData });
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = erase ? 'rgba(255,255,255,1)' : color;
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = erase ? size * 2 : size;
  ctx.stroke();
  ctx.closePath();
}


function drawAllFreehand() {
  for (let line of freehandLines) {
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.strokeStyle = line.erase ? 'rgba(255,255,255,1)' : line.color;
    ctx.globalCompositeOperation = line.erase ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = line.erase ? line.size * 2 : line.size;
    ctx.stroke();
    ctx.closePath();
  }
}

function drawShapePreview(x, y, shape) {
  drawAllShapes();
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = 2;
  ctx.globalCompositeOperation = 'source-over';
  switch (shape) {
    case 'rectangle':
      ctx.strokeRect(x - 50, y - 30, 100, 60);
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(x, y - 50);
      ctx.lineTo(x - 40, y + 30);
      ctx.lineTo(x + 40, y + 30);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(x - 40, y);
      ctx.lineTo(x + 40, y);
      ctx.stroke();
      break;
  }
}

function placeShape(x, y, shape, width = null, height = null) {
  // Default sizes if not provided
  if (width === null || height === null) {
    switch (shape) {
      case 'rectangle':
        width = 100;
        height = 60;
        break;
      case 'square':
        width = 100;
        height = 100;
        break;
      case 'circle':
        width = height = 80; // diameter
        break;
      case 'ellipse':
        width = 100;
        height = 60;
        break;
      case 'triangle':
        width = 80;
        height = 80;
        break;
      case 'line':
        width = 100;
        height = 10; // just for selection box and visual scaling
        break;
      default:
        width = 100;
        height = 60;
    }
  }

  const newShape = {
    x,
    y,
    shape,
    color: currentColor,
    fill: null,
    width,
    height,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  };

  placedShapes.push(newShape);
  shapePlaced = true;

  // ✅ Immediately select the newly placed shape
  selectedShapeIndex = placedShapes.length - 1;
  shapeFrozen = false;

  // Draw and store action
  drawAllShapes();
  pushAction({ type: 'shape', data: newShape });
}




function drawAllShapes() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawAllFreehand();

  for (let i = 0; i < placedShapes.length; i++) {
    const item = placedShapes[i];
    const { x, y, shape, color, fill, width, height, scaleX = 1, scaleY = 1, rotation = 0 } = item;

    // 🌀 Apply rotation + scaling
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-x, -y);

    // Fill shape if fill color exists
    if (fill) {
      ctx.fillStyle = fill;
      switch (shape) {
        case 'rectangle':
        case 'square':
          ctx.fillRect(x - width / 2, y - height / 2, width, height);
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(x, y, width / 2, 0, 2 * Math.PI);
          ctx.fill();
          break;
        case 'ellipse':
          ctx.beginPath();
          ctx.ellipse(x, y, width / 2, height / 2, 0, 0, 2 * Math.PI);
          ctx.fill();
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(x, y - height / 2);
          ctx.lineTo(x - width / 2, y + height / 2);
          ctx.lineTo(x + width / 2, y + height / 2);
          ctx.closePath();
          ctx.fill();
          break;
      }
    }

    // Outline shape
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    switch (shape) {
      case 'rectangle':
      case 'square':
        ctx.strokeRect(x - width / 2, y - height / 2, width, height);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(x, y, width / 2, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(x, y, width / 2, height / 2, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(x, y - height / 2);
        ctx.lineTo(x - width / 2, y + height / 2);
        ctx.lineTo(x + width / 2, y + height / 2);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(x - width / 2, y);
        ctx.lineTo(x + width / 2, y);
        ctx.stroke();
        break;
    }

    ctx.restore();

    // 💠 Selection box + handles for selected shape
    if (i === selectedShapeIndex) {
      const boxW = width * scaleX;
      const boxH = height * scaleY;
      const boxX = x - boxW / 2;
      const boxY = y - boxH / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.translate(-x, -y);

      // Highlight background
      ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // Dashed border
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      ctx.setLineDash([]);

      // Label
      ctx.font = 'bold 14px Segoe UI';
      ctx.fillStyle = '#007bff';
      ctx.fillText('Selected', x - 30, boxY - 10);

      // 🟣 Corner resize handles with double-arrow indicators
      const corners = [
        { id: 'tl', x: boxX, y: boxY },
        { id: 'tr', x: boxX + boxW, y: boxY },
        { id: 'bl', x: boxX, y: boxY + boxH },
        { id: 'br', x: boxX + boxW, y: boxY + boxH }
      ];

      ctx.fillStyle = '#007bff';
      corners.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        const arrowLength = 8;
        const angle = Math.atan2(c.y - y, c.x - x);
        const ax = Math.cos(angle) * arrowLength;
        const ay = Math.sin(angle) * arrowLength;

        ctx.beginPath();
        ctx.moveTo(c.x - ax, c.y - ay);
        ctx.lineTo(c.x + ax, c.y + ay);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // 🌀 Rotation handle
      const rotationHandle = { x: x, y: boxY - 30 };
      ctx.beginPath();
      ctx.arc(rotationHandle.x, rotationHandle.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#28a745';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, boxY);
      ctx.lineTo(rotationHandle.x, rotationHandle.y);
      ctx.strokeStyle = '#28a745';
      ctx.stroke();

      ctx.restore();
    }
  }
}


async function pollFingerData() {
  try {
    const res = await fetch('/finger_position');
    const data = await res.json();

    const cx = data.x * canvas.width;
    const cy = data.y * canvas.height;
    const cursorVisible = data.cursor;
    const draw = data.draw;

    isEraserGesture = data.eraser;
    isEraser = isEraserToolSelected && isEraserGesture;

    if (cursorVisible) {
      cursor.style.display = 'block';
      updateCursor(cx, cy);
      checkHoverSelection();

      if (!draw && currentShape !== 'free' && !shapePlaced) {
        drawShapePreview(smoothX, smoothY, currentShape);
      } else {
        drawAllShapes();
      }
    } else {
      cursor.style.display = 'none';
      drawing = false;
      prevX = prevY = null;
      drawAllShapes();
      isDraggingResizer = false;
      isDraggingShape = false;
      draggingCorner = null;
      isRotating = false;
      return requestAnimationFrame(pollFingerData);
    }

    // Drawing or erasing
    if (isEraser) {
      if (currentShape === 'free') {
        if (prevX !== null && prevY !== null) {
          drawLine(prevX, prevY, smoothX, smoothY, currentColor, brushSize, true);
        }
        prevX = smoothX;
        prevY = smoothY;
        drawing = true;
      } else {
        drawing = false;
        prevX = prevY = null;
      }
    } else if (draw && !isEraser) {
      if (currentShape === 'free') {
        if (prevX !== null && prevY !== null) {
          drawLine(prevX, prevY, smoothX, smoothY, currentColor, brushSize, false);
        }
        prevX = smoothX;
        prevY = smoothY;
        drawing = true;
      } else if (!shapePlaced) {
        placeShape(smoothX, smoothY, currentShape);
        currentShape = 'free';
        updateUISelection(null, '.shape-btn');
      }
    } else {
      drawing = false;
      prevX = prevY = null;
    }

    // Hover to reselect shape
    if (!draw && !draggingCorner && !isDraggingResizer && !isRotating) {
      let hoverFound = false;
      for (let i = placedShapes.length - 1; i >= 0; i--) {
        const shape = placedShapes[i];
        const { x, y, scaleX = 1, scaleY = 1, width, height } = shape;

        const withinX = cx >= x - (width * scaleX) / 2 && cx <= x + (width * scaleX) / 2;
        const withinY = cy >= y - (height * scaleY) / 2 && cy <= y + (height * scaleY) / 2;

        if (withinX && withinY) {
          hoverFound = true;
          if (hoveredShapeIndex !== i) {
            hoveredShapeIndex = i;
            shapeHoverStartTime = Date.now();
          } else {
            const now = Date.now();
            if (shapeHoverStartTime && (now - shapeHoverStartTime > 2000)) {
              selectedShapeIndex = i;
              shapeFrozen = false;
              justReselectedAt = Date.now();
              drawAllShapes();
              shapeHoverStartTime = null;
              shapeHoverIndicator.style.display = 'none';
            }
          }
          break;
        }
      }

      if (!hoverFound) {
        hoveredShapeIndex = null;
        shapeHoverStartTime = null;
        shapeHoverIndicator.style.display = 'none';
      }
    }

    // Fill gesture
    if (draw && !isEraser && selectedShapeIndex !== null && currentShape === 'free') {
      placedShapes[selectedShapeIndex].fill = currentColor;
      pushAction({ type: 'fill', index: selectedShapeIndex, color: currentColor });
      drawAllShapes();

      const now = Date.now();
      if (now - lastTapTime < 300) {
        shapeFrozen = true;
        selectedShapeIndex = null;
        drawAllShapes();
      }
      lastTapTime = now;
    }

    // Shape manipulation
    if (selectedShapeIndex !== null) {
      const shape = placedShapes[selectedShapeIndex];
      const { x, y, scaleX = 1, scaleY = 1, width, height } = shape;

      const boxW = width * scaleX;
      const boxH = height * scaleY;
      const boxX = x - boxW / 2;
      const boxY = y - boxH / 2;

      const corners = {
        tl: { x: boxX, y: boxY },
        tr: { x: boxX + boxW, y: boxY },
        bl: { x: boxX, y: boxY + boxH },
        br: { x: boxX + boxW, y: boxY + boxH }
      };

      const isOverCorner = Object.values(corners).some(
        handle => Math.hypot(cx - handle.x, cy - handle.y) < 10
      );

      // Rotation handle detection
      const rotationHandle = { x: x, y: boxY - 30 };
      const distToRotationHandle = Math.hypot(cx - rotationHandle.x, cy - rotationHandle.y);

      // Start rotating
      if (!draw && distToRotationHandle < 12 && !isRotating && !draggingCorner && !isDraggingShape) {
        isRotating = true;
        rotationStartAngle = Math.atan2(cy - y, cx - x);
        initialRotation = shape.rotation ?? 0;
      }

      // Rotate
      if (isRotating && !draw) {
        const currentAngle = Math.atan2(cy - y, cx - x);
        shape.rotation = initialRotation + (currentAngle - rotationStartAngle);
        drawAllShapes();
      }

      // Start resizing
      if (!draggingCorner && !draw) {
        for (let key in corners) {
          const handle = corners[key];
          const dist = Math.hypot(cx - handle.x, cy - handle.y);
          if (dist < 10) {
            draggingCorner = key;
            dragStartX = cx;
            dragStartY = cy;
            shapeStartWidth = width * scaleX;
            shapeStartHeight = height * scaleY;
            break;
          }
        }
      }

      // Resize
      if (draggingCorner && !draw) {
        const dx = cx - dragStartX;
        const dy = cy - dragStartY;
        if (draggingCorner.includes('r')) shape.scaleX = Math.max(0.2, (shapeStartWidth + dx) / width);
        else if (draggingCorner.includes('l')) shape.scaleX = Math.max(0.2, (shapeStartWidth - dx) / width);
        if (draggingCorner.includes('b')) shape.scaleY = Math.max(0.2, (shapeStartHeight + dy) / height);
        else if (draggingCorner.includes('t')) shape.scaleY = Math.max(0.2, (shapeStartHeight - dy) / height);
        drawAllShapes();
      }

      // Move shape
      const withinShape =
        cx >= boxX && cx <= boxX + boxW &&
        cy >= boxY && cy <= boxY + boxH;

      const reselectDelayPassed = !justReselectedAt || (Date.now() - justReselectedAt > 2000);
      if (reselectDelayPassed && !draggingCorner && !isOverCorner && !isDraggingShape && withinShape && !draw) {
        isDraggingShape = true;
        dragOffsetX = cx - x;
        dragOffsetY = cy - y;
      }

      if (isDraggingShape && !draw) {
        shape.x = cx - dragOffsetX;
        shape.y = cy - dragOffsetY;
        drawAllShapes();
      }

      if ((!withinShape || draw || isOverCorner) && !draggingCorner) {
        isDraggingShape = false;
      }

      if (draw) {
        draggingCorner = null;
        isRotating = false;
      }
    }

    if (!cursorVisible || draw) {
      isDraggingShape = false;
      isDraggingResizer = false;
      draggingCorner = null;
      isRotating = false;
    }

    justReselected = false;
    requestAnimationFrame(pollFingerData);
  } catch (err) {
    console.error('Error polling finger data:', err);
    isDraggingResizer = false;
    isDraggingShape = false;
    draggingCorner = null;
    isRotating = false;
    justReselected = false;
    requestAnimationFrame(pollFingerData);
  }
}

pollFingerData();

const saveBtn = document.getElementById('saveBtn');

saveBtn.addEventListener('click', () => {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.fillStyle = "#ffffff"; // white background
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  for (let line of freehandLines) {
    tempCtx.beginPath();
    tempCtx.moveTo(line.x1, line.y1);
    tempCtx.lineTo(line.x2, line.y2);
    tempCtx.strokeStyle = line.erase ? 'rgba(255,255,255,1)' : line.color;
    tempCtx.globalCompositeOperation = line.erase ? 'destination-out' : 'source-over';
    tempCtx.lineWidth = line.erase ? line.size * 2 : line.size;
    tempCtx.lineCap = 'round';
    tempCtx.lineJoin = 'round';
    tempCtx.stroke();
    tempCtx.closePath();
  }

  for (let shape of placedShapes) {
    const { x, y, shape: type, color, scale } = shape;
    tempCtx.save();
    tempCtx.translate(x, y);
    tempCtx.scale(scale, scale);
    tempCtx.translate(-x, -y);
    tempCtx.strokeStyle = color;
    tempCtx.lineWidth = 2;

    switch (type) {
      case 'rectangle':
        tempCtx.strokeRect(x - 50, y - 30, 100, 60);
        break;
      case 'square':
        tempCtx.strokeRect(x - 50, y - 50, 100, 100);
        break;
      case 'circle':
        tempCtx.beginPath();
        tempCtx.arc(x, y, 40, 0, 2 * Math.PI);
        tempCtx.stroke();
        break;
      case 'ellipse':
        tempCtx.beginPath();
        tempCtx.ellipse(x, y, 50, 30, 0, 0, 2 * Math.PI);
        tempCtx.stroke();
        break;
      case 'triangle':
        tempCtx.beginPath();
        tempCtx.moveTo(x, y - 50);
        tempCtx.lineTo(x - 40, y + 30);
        tempCtx.lineTo(x + 40, y + 30);
        tempCtx.closePath();
        tempCtx.stroke();
        break;
      case 'line':
        tempCtx.beginPath();
        tempCtx.moveTo(x - 40, y);
        tempCtx.lineTo(x + 40, y);
        tempCtx.stroke();
        break;
    }

    tempCtx.restore();
  }

  // ✅ Save as file (download to computer)
  const imageData = tempCanvas.toDataURL('image/png');
  const downloadLink = document.createElement('a');
  downloadLink.href = imageData;
  downloadLink.download = 'my_drawing.png'; // File name
  downloadLink.click(); // Trigger download
});



function toggleColors() {
  const extra = document.getElementById('extraColors');
  extra.style.display = extra.style.display === 'flex' ? 'none' : 'flex';
}

function toggleShapes() {
  const extra = document.getElementById('extraShapes');
  extra.style.display = extra.style.display === 'flex' ? 'none' : 'flex';
}
