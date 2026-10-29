// Pure layout-math helpers, extracted out of the compose API route so they're
// easy to unit test without spinning up sharp/Next.js.

function gridDimensions(slotCount, columns, cell, gap) {
  const cols = Math.max(1, columns);
  const rows = Math.ceil(slotCount / cols);
  const gridWidth = cols * cell + (cols - 1) * gap;
  const gridHeight = rows * cell + (rows - 1) * gap;
  return { cols, rows, gridWidth, gridHeight };
}

function slotPosition(index, columns, cell, gap, padding) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    left: padding + col * (cell + gap),
    top: padding + row * (cell + gap),
  };
}

module.exports = { gridDimensions, slotPosition };
