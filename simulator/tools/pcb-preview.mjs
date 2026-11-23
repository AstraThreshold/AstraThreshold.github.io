// SPDX-License-Identifier: GPL-3.0-or-later
// Keep the envelope of each substantial solid in the packed PCB mesh.
export function pcbPreviewBounds(mesh) {
  const vertexCount = mesh.readUInt32LE(4);
  const indexCount = mesh.readUInt32LE(8);
  const vertexOffset = 24, vertexSize = 10;
  const indexOffset = vertexOffset + vertexCount * vertexSize;
  const indexSize = vertexCount > 65535 ? 4 : 2;
  const paletteOffset = indexOffset + indexCount * indexSize;
  const parents = Int32Array.from({ length: vertexCount }, (_, index) => index);

  function root(index) {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }
  function join(a, b) { parents[root(a)] = root(b); }

  const vertices = [];
  const positions = new Map();
  for (let index = 0; index < vertexCount; index++) {
    const offset = vertexOffset + index * vertexSize;
    const point = [0, 2, 4].map(axis => mesh.readInt16LE(offset + axis));
    vertices.push(point);
    // The real mesh duplicates positions where material or normals change.
    const key = point.join(',');
    if (positions.has(key)) join(index, positions.get(key));
    else positions.set(key, index);
  }
  const indexAt = position => mesh.readUIntLE(indexOffset + position * indexSize, indexSize);
  for (let index = 0; index < indexCount; index += 3) {
    const first = indexAt(index);
    join(first, indexAt(index + 1));
    join(first, indexAt(index + 2));
  }

  const solids = new Map();
  const minimum = [...vertices[0]], maximum = [...vertices[0]];
  for (const [index, point] of vertices.entries()) {
    const component = root(index);
    if (!solids.has(component)) {
      solids.set(component, { low: [...point], high: [...point], luminance: 0, samples: 0 });
    }
    const solid = solids.get(component);
    for (let axis = 0; axis < 3; axis++) {
      solid.low[axis] = Math.min(solid.low[axis], point[axis]);
      solid.high[axis] = Math.max(solid.high[axis], point[axis]);
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
    const color = paletteOffset + mesh[vertexOffset + index * vertexSize + 9] * 6;
    solid.luminance += (mesh[color] + mesh[color + 1] + mesh[color + 2]) / 3;
    solid.samples++;
  }
  return [...solids.values()].flatMap(({ low, high, luminance, samples }) => {
    const volume = high.reduce((size, edge, axis) => size * (edge - low[axis]), 1);
    const outermost = low.some((edge, axis) => edge === minimum[axis] || high[axis] === maximum[axis]);
    if (!volume || (volume < 1_000_000 && !outermost)) return [];
    const gray = Math.round(112 + .23 * luminance / samples);
    return [[...low, ...high, gray]];
  });
}
